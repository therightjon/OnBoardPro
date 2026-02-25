import { type InsertNotification } from "@shared/schemas";
import { mergeUserPreferences, type DigestFrequency } from "@shared/preferences";
import { enqueueNotificationEmails } from "../../email/outbox.service";
import { getUserRepository, getNotificationRepository } from "../../../services/service-factory";
import { logger } from "../../../utils/logger";

type NotificationVisibility = "internal" | "external";
export type NotificationEventType =
  | "comment.created"
  | "task.created"
  | "task.assigned"
  | "task.completed"
  | "stage.changed"
  | "mention"
  | "task.overdue"
  | "task.due_soon"
  | "candidate.owner_changed"
  | "candidate.template_applied";
export type NotificationEntityType = "candidate" | "task" | "comment";

export interface NotificationEntityRef {
  type: NotificationEntityType;
  id: string;
}

export interface CreateNotificationsArgs {
  type: NotificationEventType;
  actorId?: string | null;
  recipients: string[];
  entity: NotificationEntityRef;
  payload: Record<string, unknown>;
  visibility?: NotificationVisibility;
  deliveredChannels?: string[];
  timestamp?: Date;
}

export interface CreateNotificationsResult {
  created: number;
  updated: number;
  notifiedUserIds: string[];
  skipped: Array<{ userId: string; reason: string }>;
}

const COALESCE_WINDOW_MS = 60_000;
const IN_APP_CHANNEL = "in_app";

function normalizeMentionKey(raw: string): string {
  return raw.trim().toLowerCase();
}

const MENTION_PATTERN = /(^|[^a-z0-9_.-])@([a-z0-9][a-z0-9_.-]*)/gi;

export function extractMentionKeys(input: string): string[] {
  if (!input) return [];
  const keys = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = MENTION_PATTERN.exec(input)) !== null) {
    const key = normalizeMentionKey(match[2]);
    if (key) keys.add(key);
  }
  return Array.from(keys);
}

export interface MentionedUser {
  id: string;
  mentionKey: string;
  role: string;
  status: string;
  active: boolean;
}

export async function resolveMentionedUsers(keys: string[]): Promise<MentionedUser[]> {
  if (!keys.length) return [];
  const normalized = Array.from(new Set(keys.map(normalizeMentionKey))).filter(Boolean);
  if (!normalized.length) return [];

  const userRepo = getUserRepository();
  return await userRepo.getUsersByMentionKeys(normalized);
}

export interface RecipientWithPreferences {
  userId: string;
  role: string;
  status: string;
  active: boolean;
  preferences: ReturnType<typeof mergeUserPreferences>;
}

export interface FilterRecipientsOptions {
  actorId?: string | null;
  visibility: NotificationVisibility;
  type: NotificationEventType;
}

export interface FilterRecipientsResult {
  eligible: RecipientWithPreferences[];
  skipped: Array<{ userId: string; reason: string }>;
}

export function filterRecipientsForNotification(recipients: RecipientWithPreferences[], options: FilterRecipientsOptions): FilterRecipientsResult {
  const skipped: Array<{ userId: string; reason: string }> = [];
  const eligible: RecipientWithPreferences[] = [];

  for (const recipient of recipients) {
    if (!recipient.active || recipient.status === "disabled") {
      skipped.push({ userId: recipient.userId, reason: "inactive" });
      continue;
    }

    if (!recipient.preferences.notifyInApp) {
      skipped.push({ userId: recipient.userId, reason: "notify_in_app_disabled" });
      continue;
    }

    const wantsEvent = recipient.preferences.eventSubscriptions?.[options.type];
    if (wantsEvent === false) {
      skipped.push({ userId: recipient.userId, reason: "subscription_disabled" });
      continue;
    }

    if (options.actorId && recipient.userId === options.actorId && !recipient.preferences.allowSelfNotifications) {
      skipped.push({ userId: recipient.userId, reason: "self_notification_suppressed" });
      continue;
    }

    if (recipient.role === "candidate" && options.visibility !== "external") {
      skipped.push({ userId: recipient.userId, reason: "candidate_visibility" });
      continue;
    }

    eligible.push(recipient);
  }

  return { eligible, skipped };
}

export interface CoalesceParams {
  recipientIds: string[];
  existing: Array<{ id: string; userId: string; payload: Record<string, unknown> | null }>;
  payload: Record<string, unknown>;
  entity: NotificationEntityRef;
  type: NotificationEventType;
  deliveredChannels?: string[];
  timestamp: Date;
}

export interface CoalesceResult {
  updates: Array<{ id: string; payload: Record<string, unknown> }>;
  inserts: InsertNotification[];
}

export function computeNotificationCoalescing(params: CoalesceParams): CoalesceResult {
  const existingByUser = new Map(params.existing.map((row) => [row.userId, row]));
  const updates: Array<{ id: string; payload: Record<string, unknown> }> = [];
  const inserts: InsertNotification[] = [];

  for (const userId of params.recipientIds) {
    const existingRow = existingByUser.get(userId);
    if (existingRow) {
      const currentPayload = (existingRow.payload as Record<string, unknown>) ?? {};
      const currentCount = typeof currentPayload.count === "number" ? currentPayload.count : 1;
      const nextPayload = { ...currentPayload, count: currentCount + 1 };
      updates.push({ id: existingRow.id, payload: nextPayload });
      continue;
    }

    inserts.push({
      userId,
      type: params.type,
      entityType: params.entity.type,
      entityId: params.entity.id,
      payload: { ...params.payload },
      deliveredChannels: params.deliveredChannels ?? [IN_APP_CHANNEL],
      createdAt: params.timestamp,
    });
  }

  return { updates, inserts };
}

export async function createNotifications(args: CreateNotificationsArgs): Promise<CreateNotificationsResult> {
  const {
    type,
    actorId,
    recipients,
    entity,
    payload,
    visibility = "internal",
    deliveredChannels,
    timestamp
  } = args;

  const uniqueRecipientIds = Array.from(new Set(recipients.filter(Boolean)));
  if (uniqueRecipientIds.length === 0) {
    return { created: 0, updated: 0, notifiedUserIds: [], skipped: [] };
  }

  // Use repository to get users with preferences
  const userRepo = getUserRepository();
  const rows = await userRepo.getUsersWithPreferences(uniqueRecipientIds);

  const normalizedRecipients: RecipientWithPreferences[] = rows.map((row) => {
    const preferencesInput = row.preferences
      ? (({ userId: _userId, updatedAt: _updatedAt, ...rest }) => rest)(row.preferences as any)
      : undefined;
    const preferences = mergeUserPreferences(preferencesInput as any);
    return {
      userId: row.id,
      role: row.role,
      status: row.status,
      active: row.active,
      preferences,
    };
  });

  const { eligible, skipped } = filterRecipientsForNotification(normalizedRecipients, {
    actorId,
    visibility,
    type,
  });

  logger.info("[email-pipeline] createNotifications filter result", {
    type,
    actorId,
    requestedRecipients: uniqueRecipientIds,
    eligibleCount: eligible.length,
    eligible: eligible.map(e => ({
      userId: e.userId,
      notifyEmail: e.preferences.notifyEmail,
      digestFrequency: e.preferences.digestFrequency,
      notifyInApp: e.preferences.notifyInApp,
      allowSelfNotifications: e.preferences.allowSelfNotifications,
    })),
    skipped,
  });

  const foundIds = new Set(rows.map((row) => row.id));
  for (const requestedId of uniqueRecipientIds) {
    if (!foundIds.has(requestedId)) {
      skipped.push({ userId: requestedId, reason: "user_not_found" });
    }
  }

  if (eligible.length === 0) {
    return { created: 0, updated: 0, notifiedUserIds: [], skipped };
  }

  const now = timestamp ?? new Date();
  const since = new Date(now.getTime() - COALESCE_WINDOW_MS);
  const eligibleIds = eligible.map((row) => row.userId);

  // Use repository to find existing notifications for coalescing
  const notificationRepo = getNotificationRepository();
  const existing = await notificationRepo.findNotificationsForCoalescing({
    userIds: eligibleIds,
    type,
    entityType: entity.type,
    entityId: entity.id,
    since
  });

  const { updates, inserts } = computeNotificationCoalescing({
    recipientIds: eligibleIds,
    existing: existing.map((row) => ({
      id: row.id,
      userId: row.userId,
      payload: row.payload as Record<string, unknown> | null
    })),
    payload,
    entity,
    type,
    deliveredChannels,
    timestamp: now,
  });

  // Use repository for bulk upsert
  const insertedRows = await notificationRepo.bulkUpsertNotifications({
    updates,
    inserts,
    now
  });

  logger.info("[email-pipeline] bulkUpsert result", {
    type,
    insertedCount: insertedRows.length,
    updatedCount: updates.length,
  });

  if (insertedRows.length > 0) {
    const preferenceMap = new Map(eligible.map((recipient) => [recipient.userId, recipient.preferences]));
    const candidates = insertedRows.map((row) => {
      const prefs = preferenceMap.get(row.userId);
      return {
        notificationId: row.id,
        userId: row.userId,
        createdAt: row.createdAt,
        notifyEmail: prefs?.notifyEmail ?? false,
        digestFrequency: (prefs?.digestFrequency ?? "immediate") as DigestFrequency,
      };
    });

    logger.info("[email-pipeline] about to enqueue", {
      type,
      candidates: candidates.map(c => ({
        userId: c.userId,
        notifyEmail: c.notifyEmail,
        digestFrequency: c.digestFrequency,
      })),
    });

    await enqueueNotificationEmails(candidates);
  }

  return {
    created: inserts.length,
    updated: updates.length,
    notifiedUserIds: eligibleIds,
    skipped
  };
}
