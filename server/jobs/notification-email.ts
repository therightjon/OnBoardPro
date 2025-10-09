import { inArray, eq } from "drizzle-orm";
import { db } from "../db/connection";
import {
  notifications as notificationsTable,
  users,
  userPreferences,
  type NotificationOutboxEntry
} from "@shared/schemas";
import { mergeUserPreferences, type DigestFrequency } from "@shared/preferences";
import {
  claimImmediateOutbox,
  markOutboxSent,
  markOutboxFailure,
  markOutboxQuiet,
  markOutboxSkipped,
  convertOutboxToDigest,
  fetchDigestCandidates,
  markDigestDelivered,
  markDigestFailure,
  rescheduleDigest
} from "../features/email/outbox.service";
import { getOrCreateTransport } from "../features/email/smtp-settings.service";
import { renderImmediateEmail, renderDigestEmail } from "../features/email/templates";

const IMMEDIATE_POLL_INTERVAL_MS = 30_000;
const DIGEST_CHECK_INTERVAL_MS = 60_000;
const IMMEDIATE_BATCH_SIZE = 20;

let immediateTimer: NodeJS.Timeout | undefined;
let digestTimer: NodeJS.Timeout | undefined;
let processingImmediate = false;
let processingDigest = false;

interface NotificationRow {
  id: string;
  userId: string;
  type: string;
  payload: Record<string, any>;
  createdAt: Date;
}

interface UserRow {
  id: string;
  email: string | null;
  firstName: string;
  lastName: string;
  notifyEmail: boolean | null;
  digestFrequency: string | null;
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
}

interface UserContext {
  id: string;
  email: string | null;
  name: string;
  preferences: ReturnType<typeof mergeUserPreferences>;
  quietStart: string | null;
  quietEnd: string | null;
}

export function parseTimeToMinutes(value: string | null | undefined): number | null {
  if (!value) return null;
  const parts = value.split(":");
  if (parts.length < 2) return null;
  const hours = Number(parts[0]);
  const minutes = Number(parts[1]);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
  return hours * 60 + minutes;
}

export function computeQuietHoursWindow(startMinutes: number | null, endMinutes: number | null, now: Date) {
  if (startMinutes === null || endMinutes === null || startMinutes === endMinutes) {
    return { inQuiet: false, nextEnd: null as Date | null };
  }

  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  const nextEnd = new Date(now);
  nextEnd.setSeconds(0, 0);

  if (startMinutes < endMinutes) {
    const inQuiet = currentMinutes >= startMinutes && currentMinutes < endMinutes;
    if (!inQuiet) return { inQuiet: false, nextEnd: null as Date | null };
    nextEnd.setHours(Math.floor(endMinutes / 60), endMinutes % 60, 0, 0);
    if (nextEnd <= now) {
      nextEnd.setDate(nextEnd.getDate() + 1);
    }
    return { inQuiet: true, nextEnd };
  }

  const inQuiet = currentMinutes >= startMinutes || currentMinutes < endMinutes;
  if (!inQuiet) {
    return { inQuiet: false, nextEnd: null as Date | null };
  }

  if (currentMinutes < endMinutes) {
    nextEnd.setHours(Math.floor(endMinutes / 60), endMinutes % 60, 0, 0);
    if (nextEnd <= now) {
      nextEnd.setDate(nextEnd.getDate() + 1);
    }
  } else {
    nextEnd.setDate(nextEnd.getDate() + 1);
    nextEnd.setHours(Math.floor(endMinutes / 60), endMinutes % 60, 0, 0);
  }

  return { inQuiet: true, nextEnd };
}

export function computeBackoff(entry: NotificationOutboxEntry): Date {
  const baseMinutes = Math.min(60, Math.pow(2, entry.retryCount + 1));
  const jitterSeconds = Math.floor(Math.random() * 30);
  const delayMs = baseMinutes * 60 * 1000 + jitterSeconds * 1000;
  return new Date(Date.now() + delayMs);
}

async function loadNotifications(ids: string[]): Promise<Map<string, NotificationRow>> {
  if (ids.length === 0) return new Map();
  const rows = await db
    .select({
      id: notificationsTable.id,
      userId: notificationsTable.userId,
      type: notificationsTable.type,
      payload: notificationsTable.payload,
      createdAt: notificationsTable.createdAt,
    })
    .from(notificationsTable)
    .where(inArray(notificationsTable.id, ids));

  return new Map(
    rows.map((row) => [row.id, { ...row, payload: row.payload as Record<string, any> }])
  );
}

async function loadUsers(ids: string[]): Promise<Map<string, UserContext>> {
  if (ids.length === 0) return new Map();
  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      firstName: users.firstName,
      lastName: users.lastName,
      notifyEmail: userPreferences.notifyEmail,
      digestFrequency: userPreferences.digestFrequency,
      quietHoursStart: userPreferences.quietHoursStart,
      quietHoursEnd: userPreferences.quietHoursEnd,
    })
    .from(users)
    .leftJoin(userPreferences, eq(userPreferences.userId, users.id))
    .where(inArray(users.id, ids));

  const map = new Map<string, UserContext>();
  for (const row of rows) {
    const merged = mergeUserPreferences({
      notifyEmail: row.notifyEmail ?? undefined,
      digestFrequency: (row.digestFrequency ?? undefined) as DigestFrequency | undefined,
      quietHoursStart: row.quietHoursStart ?? undefined,
      quietHoursEnd: row.quietHoursEnd ?? undefined,
    });
    const name = `${row.firstName ?? ""} ${row.lastName ?? ""}`.trim() || row.email || row.id;
    map.set(row.id, {
      id: row.id,
      email: row.email,
      name,
      preferences: merged,
      quietStart: row.quietHoursStart ?? merged.quietHoursStart,
      quietEnd: row.quietHoursEnd ?? merged.quietHoursEnd,
    });
  }
  return map;
}

async function processImmediateBatch(entries: NotificationOutboxEntry[]) {
  if (entries.length === 0) return;

  const notificationIds = Array.from(new Set(entries.map((entry) => entry.notificationId)));
  const userIds = Array.from(new Set(entries.map((entry) => entry.userId)));

  const [notificationsMap, usersMap] = await Promise.all([
    loadNotifications(notificationIds),
    loadUsers(userIds),
  ]);

  let transportData;
  try {
    transportData = await getOrCreateTransport();
  } catch (error: any) {
    const reason = error?.message || "SMTP transport unavailable";
    await Promise.all(entries.map((entry) =>
      markOutboxFailure(entry, reason, computeBackoff(entry))
    ));
    console.error("[smtp] immediate worker failed to obtain transport", reason);
    return;
  }

  const { transport, settings } = transportData;
  const successes: string[] = [];
  const successNotificationIds: string[] = [];

  for (const entry of entries) {
    const notification = notificationsMap.get(entry.notificationId);
    if (!notification) {
      await markOutboxSkipped(entry.id, "Notification not found");
      continue;
    }

    const user = usersMap.get(entry.userId);
    if (!user) {
      await markOutboxSkipped(entry.id, "User not found");
      continue;
    }

    const prefs = user.preferences;

    if (prefs.digestFrequency !== "immediate") {
      await convertOutboxToDigest(entry.id);
      continue;
    }

    if (!prefs.notifyEmail) {
      await markOutboxSkipped(entry.id, "Email notifications disabled");
      continue;
    }

    if (!user.email) {
      await markOutboxSkipped(entry.id, "User email missing");
      continue;
    }

    const quietStartMinutes = parseTimeToMinutes(user.quietStart);
    const quietEndMinutes = parseTimeToMinutes(user.quietEnd);
    const quietWindow = computeQuietHoursWindow(quietStartMinutes, quietEndMinutes, new Date());
    if (quietWindow.inQuiet && quietWindow.nextEnd) {
      await markOutboxQuiet(entry.id, quietWindow.nextEnd);
      continue;
    }

    try {
      const content = renderImmediateEmail({
        id: notification.id,
        type: notification.type,
        payload: notification.payload as Record<string, any>,
        createdAt: notification.createdAt,
      });

      const fromEmail = settings.fromEmail ?? settings.username;
      if (!fromEmail) {
        await markOutboxFailure(entry, "SMTP sender email not configured", computeBackoff(entry));
        continue;
      }

      await transport.sendMail({
        from: settings.fromName ? `${settings.fromName} <${fromEmail}>` : fromEmail,
        to: user.name ? `${user.name} <${user.email}>` : user.email,
        subject: content.subject,
        text: content.text,
        html: content.html,
      });

      successes.push(entry.id);
      successNotificationIds.push(notification.id);
    } catch (error: any) {
      const message = error?.message ?? "Failed to send email";
      await markOutboxFailure(entry, message, computeBackoff(entry));
    }
  }

  if (successes.length > 0) {
    await markOutboxSent(successes, successNotificationIds);
  }
}

async function runImmediateWorker() {
  if (processingImmediate) return;
  processingImmediate = true;

  try {
    const entries = await claimImmediateOutbox(IMMEDIATE_BATCH_SIZE);
    if (entries.length === 0) return;
    await processImmediateBatch(entries);
  } catch (error) {
    console.error("[smtp] immediate worker error", error);
  } finally {
    processingImmediate = false;
  }
}

const lastDigestRun: Record<"hourly" | "daily" | "weekly", Date | null> = {
  hourly: null,
  daily: null,
  weekly: null,
};

function shouldRunDigest(frequency: "hourly" | "daily" | "weekly", now: Date): boolean {
  const last = lastDigestRun[frequency];
  if (frequency === "hourly") {
    if (now.getMinutes() !== 0) return false;
    if (!last) return true;
    return last.getHours() !== now.getHours();
  }

  if (frequency === "daily") {
    if (!(now.getHours() === 7 && now.getMinutes() === 0)) return false;
    if (!last) return true;
    return last.getDate() !== now.getDate();
  }

  // weekly
  if (!(now.getDay() === 1 && now.getHours() === 7 && now.getMinutes() === 0)) return false;
  if (!last) return true;
  const diffMs = now.getTime() - last.getTime();
  return diffMs >= 6 * 24 * 60 * 60 * 1000;
}

async function processDigest(frequency: "hourly" | "daily" | "weekly") {
  const now = new Date();
  let windowStart: Date;
  if (frequency === "hourly") {
    windowStart = new Date(now.getTime() - 60 * 60 * 1000);
  } else if (frequency === "daily") {
    windowStart = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  } else {
    windowStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  }

  const candidates = await fetchDigestCandidates(frequency, windowStart, now);
  if (candidates.length === 0) {
    lastDigestRun[frequency] = now;
    return;
  }

  const byUser = new Map<string, typeof candidates>();
  for (const candidate of candidates) {
    if (!byUser.has(candidate.userId)) {
      byUser.set(candidate.userId, []);
    }
    byUser.get(candidate.userId)!.push(candidate);
  }

  const userIds = Array.from(byUser.keys());
  const usersMap = await loadUsers(userIds);

  let transportData;
  try {
    transportData = await getOrCreateTransport();
  } catch (error: any) {
    console.error("[smtp] digest worker failed to obtain transport", error?.message ?? error);
    await markDigestFailure(
      candidates.map((c) => c.outboxId),
      error?.message ?? "SMTP transport unavailable"
    );
    return;
  }

  const { transport, settings } = transportData;

  for (const [userId, items] of byUser.entries()) {
    const user = usersMap.get(userId);
    if (!user) {
      await markDigestFailure(items.map((item) => item.outboxId), "User not found");
      continue;
    }

    const prefs = user.preferences;
    if (!prefs.notifyEmail) {
      await markDigestFailure(items.map((item) => item.outboxId), "Email notifications disabled");
      continue;
    }

    if (prefs.digestFrequency !== frequency) {
      await rescheduleDigest(items.map((item) => item.outboxId), new Date(now.getTime() + 60 * 60 * 1000));
      continue;
    }

    if (!user.email) {
      await markDigestFailure(items.map((item) => item.outboxId), "User email missing");
      continue;
    }

    const quietStartMinutes = parseTimeToMinutes(user.quietStart);
    const quietEndMinutes = parseTimeToMinutes(user.quietEnd);
    const quietWindow = computeQuietHoursWindow(quietStartMinutes, quietEndMinutes, now);
    if (quietWindow.inQuiet && quietWindow.nextEnd) {
      await rescheduleDigest(items.map((item) => item.outboxId), quietWindow.nextEnd);
      continue;
    }

    try {
      const content = renderDigestEmail(
        frequency,
        items.map((item) => ({
          id: item.notificationId,
          type: item.type,
          payload: item.payload as Record<string, any>,
          createdAt: item.createdAt,
        }))
      );

      const fromEmail = settings.fromEmail ?? settings.username;
      if (!fromEmail) {
        await markDigestFailure(items.map((item) => item.outboxId), "SMTP sender email not configured");
        continue;
      }

      await transport.sendMail({
        from: settings.fromName ? `${settings.fromName} <${fromEmail}>` : fromEmail,
        to: user.email,
        subject: content.subject,
        text: content.text,
        html: content.html,
      });

      await markDigestDelivered(
        items.map((item) => item.outboxId),
        items.map((item) => item.notificationId)
      );
    } catch (error: any) {
      const message = error?.message ?? "Failed to send digest";
      await markDigestFailure(items.map((item) => item.outboxId), message);
    }
  }

  lastDigestRun[frequency] = now;
}

async function runDigestWorker() {
  if (processingDigest) return;
  processingDigest = true;

  const now = new Date();

  try {
    for (const frequency of ["hourly", "daily", "weekly"] as const) {
      if (shouldRunDigest(frequency, now)) {
        await processDigest(frequency);
      }
    }
  } catch (error) {
    console.error("[smtp] digest worker error", error);
  } finally {
    processingDigest = false;
  }
}

export function startNotificationEmailJobs() {
  if (!immediateTimer) {
    immediateTimer = setInterval(runImmediateWorker, IMMEDIATE_POLL_INTERVAL_MS);
    void runImmediateWorker();
  }

  if (!digestTimer) {
    digestTimer = setInterval(runDigestWorker, DIGEST_CHECK_INTERVAL_MS);
    void runDigestWorker();
  }
}

export function stopNotificationEmailJobs() {
  if (immediateTimer) {
    clearInterval(immediateTimer);
    immediateTimer = undefined;
  }
  if (digestTimer) {
    clearInterval(digestTimer);
    digestTimer = undefined;
  }
}
