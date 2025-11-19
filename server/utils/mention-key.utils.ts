/**
 * Mention Key Utility Functions
 *
 * Provides utilities for generating unique user mention keys (usernames)
 * used in the @mention system throughout the application.
 */

import { eq, and, ne } from "drizzle-orm";
import { users } from "@shared/schemas";
import type { db as DbType } from "../db/connection";

const MENTION_KEY_REPLACE = /[^a-z0-9]+/g;
const MENTION_KEY_DOTS = /\.\.+/g;

/**
 * Sanitize a string to create a valid mention key
 * Converts to lowercase, replaces special chars with dots, removes consecutive dots
 *
 * @param value - The string to sanitize
 * @returns Sanitized mention key or null if empty
 */
export function sanitizeMentionKey(value?: string | null): string | null {
  if (!value) return null;
  const cleaned = value
    .trim()
    .toLowerCase()
    .replace(MENTION_KEY_REPLACE, ".")
    .replace(MENTION_KEY_DOTS, ".")
    .replace(/^\.+|\.+$/g, "");
  return cleaned || null;
}

/**
 * Build a base mention key from user data
 * Tries in order: existing mentionKey, username, firstName.lastName, email prefix, 'user'
 *
 * @param source - User data source
 * @returns Base mention key
 */
export function buildMentionKeyBase(source: {
  mentionKey?: string | null;
  username?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
}): string {
  return (
    sanitizeMentionKey(source.mentionKey) ??
    sanitizeMentionKey(source.username) ??
    sanitizeMentionKey(`${source.firstName ?? ''}.${source.lastName ?? ''}`) ??
    sanitizeMentionKey(source.email?.split('@')[0]) ??
    'user'
  );
}

/**
 * Ensure a mention key is unique by appending a number if necessary
 *
 * @param db - Database connection
 * @param base - Base mention key to make unique
 * @param excludeUserId - Optional user ID to exclude from uniqueness check
 * @returns Unique mention key
 */
export async function ensureUniqueMentionKey(
  db: typeof DbType,
  base: string,
  excludeUserId?: string
): Promise<string> {
  let attempt = 1;
  while (true) {
    const candidate = attempt === 1 ? base : `${base}.${attempt}`;
    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(
        excludeUserId
          ? and(eq(users.mentionKey, candidate), ne(users.id, excludeUserId))
          : eq(users.mentionKey, candidate)
      )
      .limit(1);
    if (existing.length === 0) {
      return candidate;
    }
    attempt += 1;
  }
}

/**
 * Generate a unique mention key from user data
 *
 * @param db - Database connection
 * @param source - User data source
 * @param excludeUserId - Optional user ID to exclude from uniqueness check
 * @returns Unique mention key
 */
export async function generateMentionKey(
  db: typeof DbType,
  source: {
    mentionKey?: string | null;
    username?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
  },
  excludeUserId?: string
): Promise<string> {
  const base = buildMentionKeyBase(source);
  return ensureUniqueMentionKey(db, base, excludeUserId);
}
