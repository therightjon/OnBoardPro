import { sql, inArray, eq } from "drizzle-orm";
import { db } from "../../db/connection";
import {
  notificationOutbox,
  notifications,
  userPreferences,
  type NotificationOutboxEntry
} from "@shared/schemas";
import type { DigestFrequency } from "@shared/preferences";
import { logger } from "../../utils/logger";

export type DigestCapableFrequency = Exclude<DigestFrequency, "immediate">;

export interface NotificationEmailCandidate {
  notificationId: string;
  userId: string;
  createdAt: Date;
  notifyEmail: boolean;
  digestFrequency: DigestFrequency;
}

export async function enqueueNotificationEmails(candidates: NotificationEmailCandidate[]): Promise<void> {
  if (candidates.length === 0) return;

  logger.info("[email-pipeline] enqueueNotificationEmails called", {
    candidateCount: candidates.length,
    candidates: candidates.map(c => ({
      userId: c.userId,
      notifyEmail: c.notifyEmail,
      digestFrequency: c.digestFrequency,
    })),
  });

  const values = candidates
    .filter((candidate) => candidate.notifyEmail)
    .map((candidate) => ({
      notificationId: candidate.notificationId,
      userId: candidate.userId,
      status: candidate.digestFrequency === "immediate" ? "pending" : "digest_pending",
      retryCount: 0,
      nextAttemptAt: candidate.createdAt,
      createdAt: candidate.createdAt,
      digestCandidate: candidate.digestFrequency !== "immediate",
    }));

  if (values.length === 0) return;

  await db
    .insert(notificationOutbox)
    .values(values)
    .onConflictDoNothing({ target: notificationOutbox.notificationId });
}

export async function claimImmediateOutbox(limit: number): Promise<NotificationOutboxEntry[]> {
  const result = await db.execute<NotificationOutboxEntry>(sql`
    WITH candidates AS (
      SELECT id
      FROM notification_outbox
      WHERE status IN ('pending', 'retrying')
        AND digest_candidate = false
        AND next_attempt_at <= now()
      ORDER BY next_attempt_at ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    UPDATE notification_outbox o
    SET status = 'retrying'
    FROM candidates c
    WHERE o.id = c.id
    RETURNING o.*
  `);

  return result.rows ?? [];
}

export async function markOutboxSent(entryIds: string[], notificationIds: string[]): Promise<void> {
  if (entryIds.length === 0) return;

  await db.update(notificationOutbox)
    .set({
      status: "sent",
      lastError: null,
      deliveredAt: new Date(),
    })
    .where(inArray(notificationOutbox.id, entryIds));

  if (notificationIds.length > 0) {
    await db.execute(sql`
      UPDATE notifications
      SET delivered_channels = (
        SELECT ARRAY(SELECT DISTINCT unnest(delivered_channels || ARRAY['email']))
      )
      WHERE id = ANY(ARRAY[${sql.join(notificationIds.map((id) => sql`${id}`), sql`, `)}]::uuid[])
    `);
  }
}

export async function markOutboxQuiet(entryId: string, nextAttemptAt: Date): Promise<void> {
  await db.update(notificationOutbox)
    .set({
      status: "pending",
      nextAttemptAt,
    })
    .where(eq(notificationOutbox.id, entryId));
}

const MAX_RETRIES = 5;

export async function markOutboxFailure(entry: NotificationOutboxEntry, message: string, nextAttemptAt: Date): Promise<void> {
  const retryCount = entry.retryCount + 1;
  const shouldFail = retryCount >= MAX_RETRIES;

  await db.update(notificationOutbox)
    .set({
      status: shouldFail ? "failed" : "retrying",
      retryCount,
      lastError: message,
      nextAttemptAt,
    })
    .where(eq(notificationOutbox.id, entry.id));
}

export async function markOutboxSkipped(entryId: string, reason: string): Promise<void> {
  await db.update(notificationOutbox)
    .set({
      status: "sent",
      lastError: reason,
      deliveredAt: new Date(),
    })
    .where(eq(notificationOutbox.id, entryId));
}

export async function convertOutboxToDigest(entryId: string): Promise<void> {
  await db.update(notificationOutbox)
    .set({
      status: "digest_pending",
      digestCandidate: true,
      nextAttemptAt: new Date(),
      lastError: null,
    })
    .where(eq(notificationOutbox.id, entryId));
}

export interface DigestCandidate {
  outboxId: string;
  notificationId: string;
  userId: string;
  createdAt: Date;
  payload: any;
  type: string;
}

export async function fetchDigestCandidates(
  frequency: DigestCapableFrequency,
  windowStart: Date,
  windowEnd: Date
): Promise<DigestCandidate[]> {
  const result = await db.execute<{
    outboxId: string;
    notificationId: string;
    userId: string;
    createdAt: Date;
    payload: unknown;
    type: string;
  }>(sql`
    SELECT 
      o.id as "outboxId",
      o.notification_id as "notificationId",
      o.user_id as "userId",
      o.created_at as "createdAt",
      n.payload as "payload",
      n.type as "type"
    FROM notification_outbox o
    JOIN notifications n ON n.id = o.notification_id
    JOIN user_preferences p ON p.user_id = o.user_id
    WHERE o.digest_candidate = true
      AND o.status = 'digest_pending'
      AND o.created_at >= ${windowStart}
      AND o.created_at < ${windowEnd}
      AND o.next_attempt_at <= now()
      AND p.notify_email = true
      AND p.digest_frequency = ${frequency}
  `);

  return (result.rows ?? []).map((row) => ({
    outboxId: row.outboxId,
    notificationId: row.notificationId,
    userId: row.userId,
    createdAt: row.createdAt,
    payload: row.payload as any,
    type: row.type,
  }));
}

export async function markDigestDelivered(outboxIds: string[], notificationIds: string[]): Promise<void> {
  if (outboxIds.length === 0) return;

  await db.update(notificationOutbox)
    .set({
      status: "sent",
      deliveredAt: new Date(),
      lastError: null,
    })
    .where(inArray(notificationOutbox.id, outboxIds));

  if (notificationIds.length > 0) {
    await db.execute(sql`
      UPDATE notifications
      SET delivered_channels = (
        SELECT ARRAY(SELECT DISTINCT unnest(delivered_channels || ARRAY['email']))
      )
      WHERE id = ANY(ARRAY[${sql.join(notificationIds.map((id) => sql`${id}`), sql`, `)}]::uuid[])
    `);
  }
}

export async function markDigestFailure(outboxIds: string[], reason: string): Promise<void> {
  if (outboxIds.length === 0) return;

  await db.update(notificationOutbox)
    .set({
      status: "failed",
      lastError: reason,
      deliveredAt: new Date(),
    })
    .where(inArray(notificationOutbox.id, outboxIds));
}

export async function rescheduleDigest(outboxIds: string[], nextAttemptAt: Date): Promise<void> {
  if (outboxIds.length === 0) return;
  await db.update(notificationOutbox)
    .set({
      nextAttemptAt,
      status: "digest_pending",
    })
    .where(inArray(notificationOutbox.id, outboxIds));
}
