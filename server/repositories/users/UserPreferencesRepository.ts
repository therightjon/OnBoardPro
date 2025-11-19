/**
 * User Preferences Repository
 *
 * Manages user-specific preferences for notifications, task filtering,
 * and other personalization settings.
 */

import { eq } from "drizzle-orm";
import {
  userPreferences,
  type UserPreferences,
  USER_PREFERENCES_DEFAULTS,
} from "@shared/schemas";
import { BaseRepository } from "../base/BaseRepository";

/**
 * Type for user preference updates
 * Excludes userId and updatedAt which are managed automatically
 */
export type UserPreferencesUpdateInput = Partial<
  Omit<UserPreferences, "userId" | "updatedAt">
>;

/**
 * Repository for managing user preferences
 */
export class UserPreferencesRepository extends BaseRepository {
  /**
   * Get user preferences by user ID
   * @param userId - User ID
   * @returns User preferences or undefined if not found
   */
  async getUserPreferences(userId: string): Promise<UserPreferences | undefined> {
    const [preferences] = await this.db
      .select()
      .from(userPreferences)
      .where(eq(userPreferences.userId, userId));
    return preferences || undefined;
  }

  /**
   * Update or insert user preferences
   * Merges updates with existing preferences and defaults
   * Uses upsert to handle both create and update cases
   * @param userId - User ID
   * @param updates - Partial preference updates to apply
   * @returns Updated or created user preferences
   */
  async upsertUserPreferences(
    userId: string,
    updates: UserPreferencesUpdateInput
  ): Promise<UserPreferences> {
    const now = new Date();
    const existing = await this.getUserPreferences(userId);

    const mergedEventSubscriptions = updates.eventSubscriptions !== undefined
      ? {
        ...USER_PREFERENCES_DEFAULTS.eventSubscriptions,
        ...(existing?.eventSubscriptions ?? {}),
        ...updates.eventSubscriptions,
      }
      : {
        ...USER_PREFERENCES_DEFAULTS.eventSubscriptions,
        ...(existing?.eventSubscriptions ?? {}),
      };

    const resolved = {
      userId,
      mytasksShowArchived: updates.mytasksShowArchived ?? existing?.mytasksShowArchived ?? USER_PREFERENCES_DEFAULTS.mytasksShowArchived,
      mytasksShowCanceled: updates.mytasksShowCanceled ?? existing?.mytasksShowCanceled ?? USER_PREFERENCES_DEFAULTS.mytasksShowCanceled,
      mytasksShowCompleted: updates.mytasksShowCompleted ?? existing?.mytasksShowCompleted ?? USER_PREFERENCES_DEFAULTS.mytasksShowCompleted,
      notifyInApp: updates.notifyInApp ?? existing?.notifyInApp ?? USER_PREFERENCES_DEFAULTS.notifyInApp,
      notifyEmail: updates.notifyEmail ?? existing?.notifyEmail ?? USER_PREFERENCES_DEFAULTS.notifyEmail,
      digestFrequency: updates.digestFrequency ?? existing?.digestFrequency ?? USER_PREFERENCES_DEFAULTS.digestFrequency,
      quietHoursStart: updates.quietHoursStart === undefined ? (existing?.quietHoursStart ?? USER_PREFERENCES_DEFAULTS.quietHoursStart) : updates.quietHoursStart,
      quietHoursEnd: updates.quietHoursEnd === undefined ? (existing?.quietHoursEnd ?? USER_PREFERENCES_DEFAULTS.quietHoursEnd) : updates.quietHoursEnd,
      allowSelfNotifications: updates.allowSelfNotifications ?? existing?.allowSelfNotifications ?? USER_PREFERENCES_DEFAULTS.allowSelfNotifications,
      eventSubscriptions: mergedEventSubscriptions,
    } satisfies typeof userPreferences.$inferInsert;

    const [result] = await this.db
      .insert(userPreferences)
      .values({ ...resolved, updatedAt: now })
      .onConflictDoUpdate({
        target: userPreferences.userId,
        set: {
          ...resolved,
          updatedAt: now,
        }
      })
      .returning();

    return result;
  }
}
