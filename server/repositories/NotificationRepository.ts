/**
 * Notification Repository
 *
 * Manages user notifications with cursor-based pagination.
 * Provides methods to retrieve, mark as read, and manage notification states.
 */

import { eq, and, or, inArray, desc, lt, sql, gte } from "drizzle-orm";
import {
  notifications,
  type Notification,
  type InsertNotification
} from "@shared/schemas";
import { BaseRepository } from "./base/BaseRepository";
import type { db as DbType } from "../db/connection";
import type { Pool } from "pg";

export class NotificationRepository extends BaseRepository {
  constructor(db: typeof DbType, pool: Pool) {
    super(db, pool);
  }

  /**
   * Get notifications for a user with cursor-based pagination
   *
   * Supports filtering by:
   * - Unread status
   * - Notification types
   *
   * Returns notifications sorted by creation date (newest first) with pagination support.
   * Always includes the total unread count regardless of filters applied.
   *
   * @param params - Query parameters
   * @param params.userId - ID of the user whose notifications to retrieve
   * @param params.limit - Maximum number of notifications to return (default: 20)
   * @param params.cursor - Pagination cursor for fetching next page
   * @param params.unreadOnly - If true, only return unread notifications
   * @param params.types - Optional array of notification types to filter by
   * @returns Promise resolving to paginated notifications with unread count
   */
  async getNotifications(params: {
    userId: string;
    limit?: number;
    cursor?: string;
    unreadOnly?: boolean;
    types?: string[]
  }): Promise<{ items: Notification[]; nextCursor?: string; unreadCount: number; totalCount: number }> {
    const { userId, limit = 20, cursor, unreadOnly = false, types } = params;
    const cursorObj = this.decodeCursor(cursor);

    const baseCondition = eq(notifications.userId, userId);
    const appliedConditions = [baseCondition];

    const unreadCondition = unreadOnly ? eq(notifications.isRead, false) : undefined;
    if (unreadCondition) {
      appliedConditions.push(unreadCondition);
    }

    const typesCondition = types && types.length > 0 ? inArray(notifications.type, types) : undefined;
    if (typesCondition) {
      appliedConditions.push(typesCondition);
    }

    const baseWhere = appliedConditions.reduce((acc, condition) => acc ? and(acc, condition)! : condition)!;
    const cursorCondition = cursorObj
      ? or(
          lt(notifications.createdAt, cursorObj.createdAt),
          and(
            eq(notifications.createdAt, cursorObj.createdAt),
            lt(notifications.id, cursorObj.id)
          )
        )
      : undefined;

    const whereClause = cursorCondition ? and(baseWhere, cursorCondition)! : baseWhere;

    const totalResult = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(notifications)
      .where(baseWhere);

    const rows = await this.db
      .select()
      .from(notifications)
      .where(whereClause)
      .orderBy(desc(notifications.createdAt), desc(notifications.id))
      .limit(limit + 1);

    const items = rows.slice(0, limit);
    const nextCursor = items.length === limit
      ? this.encodeCursor({ createdAt: items[items.length - 1].createdAt as Date, id: items[items.length - 1].id })
      : undefined;

    const unreadResult = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(notifications)
      .where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)));

    const unreadCount = unreadResult[0]?.count ?? 0;
    const totalCount = totalResult[0]?.count ?? 0;

    return { items: items as Notification[], nextCursor, unreadCount, totalCount };
  }

  /**
   * Mark a notification as read or unread
   *
   * Only updates the notification if it belongs to the specified user.
   * Sets the readAt timestamp when marking as read, clears it when marking as unread.
   *
   * @param userId - ID of the user who owns the notification
   * @param notificationId - ID of the notification to update
   * @param isRead - Whether to mark as read (true) or unread (false)
   * @returns Promise resolving to true if notification was updated, false otherwise
   */
  async setNotificationRead(userId: string, notificationId: string, isRead: boolean): Promise<boolean> {
    const [updated] = await this.db
      .update(notifications)
      .set({
        isRead,
        readAt: isRead ? new Date() : null
      })
      .where(and(eq(notifications.id, notificationId), eq(notifications.userId, userId)))
      .returning({ id: notifications.id });

    return !!updated;
  }

  /**
   * Mark all unread notifications as read for a user
   *
   * Updates all unread notifications for the specified user in a single operation.
   * Sets isRead to true and readAt to current timestamp.
   *
   * @param userId - ID of the user whose notifications to mark as read
   * @returns Promise resolving to the number of notifications that were marked as read
   */
  async markAllNotificationsRead(userId: string): Promise<number> {
    const now = new Date();
    const result = await this.db
      .update(notifications)
      .set({ isRead: true, readAt: now })
      .where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)))
      .returning({ id: notifications.id });

    return result.length;
  }

  /**
   * Create a new notification
   *
   * Creates a notification record in the database with the specified parameters.
   * This is used by event handlers to create notifications in response to domain events.
   *
   * @param params - Notification creation parameters
   * @returns Promise resolving to the created notification ID
   */
  async createNotification(params: {
    recipientUserId: string;
    eventType: string;
    title: string;
    message: string;
    actorUserId: string | null | undefined;
    relatedEntityType: string;
    relatedEntityId: string;
    contextCandidateId: string | null;
  }): Promise<string> {
    // Map relatedEntityType to entityType enum
    let entityType: 'candidate' | 'task' | 'comment' = 'task';
    if (params.relatedEntityType === 'candidate') {
      entityType = 'candidate';
    } else if (params.relatedEntityType === 'comment') {
      entityType = 'comment';
    } else if (params.relatedEntityType === 'candidate_task') {
      entityType = 'task';
    }

    const [inserted] = await this.db.insert(notifications).values({
      userId: params.recipientUserId,
      type: params.eventType,
      entityType,
      entityId: params.relatedEntityId,
      payload: {
        title: params.title,
        message: params.message,
        actorId: params.actorUserId,
        contextCandidateId: params.contextCandidateId
      },
      isRead: false,
      readAt: null,
      deliveredChannels: []
    }).returning({ id: notifications.id });

    return inserted.id;
  }

  /**
   * Find existing notifications for coalescing
   *
   * Searches for notifications within a time window that can be coalesced
   * (same type, entity type/id, and recipient).
   *
   * @param params - Search parameters
   * @returns Array of matching notifications
   */
  async findNotificationsForCoalescing(params: {
    userIds: string[];
    type: string;
    entityType: 'candidate' | 'task' | 'comment';
    entityId: string;
    since: Date;
  }): Promise<Array<{
    id: string;
    userId: string;
    payload: Record<string, unknown> | null;
    createdAt: Date;
  }>> {
    const results = await this.db
      .select({
        id: notifications.id,
        userId: notifications.userId,
        payload: notifications.payload,
        createdAt: notifications.createdAt
      })
      .from(notifications)
      .where(and(
        inArray(notifications.userId, params.userIds),
        eq(notifications.type, params.type),
        eq(notifications.entityType, params.entityType),
        eq(notifications.entityId, params.entityId),
        gte(notifications.createdAt, params.since)
      ));

    return results.map(row => ({
      ...row,
      payload: row.payload as Record<string, unknown> | null
    }));
  }

  /**
   * Bulk create and update notifications with coalescing
   *
   * Performs all notification updates and inserts in a transaction.
   * Used by the notification creation system for efficient bulk operations.
   *
   * @param params - Updates and inserts to perform
   * @returns Inserted notification rows with id, userId, createdAt
   */
  async bulkUpsertNotifications(params: {
    updates: Array<{ id: string; payload: Record<string, unknown> }>;
    inserts: InsertNotification[];
    now: Date;
  }): Promise<Array<{ id: string; userId: string; createdAt: Date }>> {
    let insertedRows: Array<{ id: string; userId: string; createdAt: Date }> = [];

    await this.db.transaction(async (trx) => {
      if (params.updates.length > 0) {
        for (const update of params.updates) {
          await trx
            .update(notifications)
            .set({
              payload: update.payload,
              isRead: false,
              readAt: null,
              createdAt: params.now
            })
            .where(eq(notifications.id, update.id));
        }
      }

      if (params.inserts.length > 0) {
        const inserted = await trx
          .insert(notifications)
          .values(params.inserts)
          .returning({
            id: notifications.id,
            userId: notifications.userId,
            createdAt: notifications.createdAt,
          });
        insertedRows = inserted;
      }
    });

    return insertedRows;
  }
}
