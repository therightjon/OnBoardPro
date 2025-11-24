import { and, inArray, isNotNull, lte } from "drizzle-orm";
import { db } from "../db/connection";
import { notifications } from "@shared/schemas";

const DAY_MS = 24 * 60 * 60 * 1000;
export const READ_RETENTION_DAYS = 3;
export const NOTIFICATION_CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000; // daily
export const NOTIFICATION_CLEANUP_BATCH_SIZE = 500;

export function computeReadCutoff(now: Date = new Date()): Date {
  return new Date(now.getTime() - READ_RETENTION_DAYS * DAY_MS);
}

export function isNotificationExpired(readAt: Date | null | undefined, now: Date = new Date()): boolean {
  if (!readAt) return false;
  return readAt.getTime() <= computeReadCutoff(now).getTime();
}

async function deleteExpiredBatch(cutoff: Date, batchSize: number): Promise<number> {
  const candidates = await db
    .select({ id: notifications.id })
    .from(notifications)
    .where(and(isNotNull(notifications.readAt), lte(notifications.readAt, cutoff)))
    .limit(batchSize);

  if (candidates.length === 0) return 0;

  const deleted = await db
    .delete(notifications)
    .where(inArray(notifications.id, candidates.map((row) => row.id)))
    .returning({ id: notifications.id });

  return deleted.length;
}

async function runCleanupOnce(batchSize: number) {
  const cutoff = computeReadCutoff();
  let totalDeleted = 0;
  try {
    while (true) {
      const deleted = await deleteExpiredBatch(cutoff, batchSize);
      totalDeleted += deleted;
      if (deleted < batchSize) break;
    }
    console.info(`[notification-cleanup] removed ${totalDeleted} read notifications (cutoff ${cutoff.toISOString()})`);
  } catch (error) {
    console.error("[notification-cleanup] failed", error);
  }
}

interface NotificationCleanupOptions {
  intervalMs?: number;
  batchSize?: number;
}

let timer: NodeJS.Timeout | null = null;
let running = false;

export function startNotificationCleanupJob(options: NotificationCleanupOptions = {}) {
  if (timer) return () => { /* already running */ };

  const intervalMs = options.intervalMs ?? NOTIFICATION_CLEANUP_INTERVAL_MS;
  const batchSize = options.batchSize ?? NOTIFICATION_CLEANUP_BATCH_SIZE;

  const execute = async () => {
    if (running) return;
    running = true;
    try {
      await runCleanupOnce(batchSize);
    } finally {
      running = false;
    }
  };

  void execute();
  timer = setInterval(execute, intervalMs);

  return () => {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}
