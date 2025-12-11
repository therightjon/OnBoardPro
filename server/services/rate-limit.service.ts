import { and, eq } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { rateLimitCounters } from "@shared/schemas";
import { db } from "../db/connection";

export interface RateLimitRule {
  type: string;
  key: string;
  windowMs: number;
  max: number;
}

export interface RateLimitEvaluation {
  allowed: boolean;
  retryAfterSeconds: number;
  count: number;
  resetAt?: Date | null;
}

async function getCounter(type: string, key: string) {
  const rows = await db
    .select({
      count: rateLimitCounters.count,
      resetAt: rateLimitCounters.resetAt
    })
    .from(rateLimitCounters)
    .where(and(eq(rateLimitCounters.type, type), eq(rateLimitCounters.key, key)))
    .limit(1);
  return rows[0];
}

/**
 * Increment the counter, resetting the window if expired.
 */
export async function incrementRateLimit(rule: RateLimitRule): Promise<{ count: number; resetAt: Date }> {
  const result = await db.execute(sql`
    INSERT INTO rate_limit_counters (type, key, count, reset_at)
    VALUES (${rule.type}, ${rule.key}, 1, NOW() + (${rule.windowMs}::int * interval '1 millisecond'))
    ON CONFLICT (type, key)
    DO UPDATE SET
      count = CASE WHEN rate_limit_counters.reset_at < NOW() THEN 1 ELSE rate_limit_counters.count + 1 END,
      reset_at = CASE WHEN rate_limit_counters.reset_at < NOW() THEN NOW() + (${rule.windowMs}::int * interval '1 millisecond') ELSE rate_limit_counters.reset_at END
    RETURNING count, reset_at;
  `);

  const row = result.rows[0] as { count: number; reset_at: Date };
  return { count: Number(row.count), resetAt: new Date(row.reset_at) };
}

/**
 * Evaluate without incrementing (used before consuming an attempt).
 */
export async function evaluateRateLimit(rule: RateLimitRule): Promise<RateLimitEvaluation> {
  const row = await getCounter(rule.type, rule.key);
  if (!row) {
    return { allowed: true, retryAfterSeconds: 0, count: 0, resetAt: null };
  }

  const now = Date.now();
  const resetAt = row.resetAt ? new Date(row.resetAt) : null;
  if (!resetAt || resetAt.getTime() <= now) {
    return { allowed: true, retryAfterSeconds: 0, count: 0, resetAt: null };
  }

  if (row.count >= rule.max) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((resetAt.getTime() - now) / 1000)),
      count: row.count,
      resetAt
    };
  }

  return {
    allowed: true,
    retryAfterSeconds: 0,
    count: row.count,
    resetAt
  };
}

export async function resetRateLimit(type: string, key: string): Promise<void> {
  await db
    .delete(rateLimitCounters)
    .where(and(eq(rateLimitCounters.type, type), eq(rateLimitCounters.key, key)));
}
