/**
 * Notification Service
 *
 * Business logic layer for notification management.
 * Handles notification creation, retrieval, and read status management.
 */

import type { Notification } from "@shared/schemas";
import type { NotificationRepository } from "../../repositories/NotificationRepository";

export interface GetNotificationsInput {
  userId: string;
  limit?: number;
  cursor?: string;
  unreadOnly?: boolean;
  types?: string[];
}

export interface GetNotificationsResult {
  items: Notification[];
  nextCursor?: string;
  unreadCount: number;
  totalCount: number;
}

/**
 * Service for notification-related business operations
 */
export class NotificationService {
  constructor(
    private notificationRepo: NotificationRepository
  ) {}

  /**
   * Get notifications for a user with pagination
   */
  async getNotifications(input: GetNotificationsInput): Promise<GetNotificationsResult> {
    return this.notificationRepo.getNotifications(input);
  }

  /**
   * Mark a single notification as read
   */
  async markAsRead(notificationId: string, userId: string): Promise<boolean> {
    return this.notificationRepo.setNotificationRead(userId, notificationId, true);
  }

  /**
   * Mark a single notification as unread
   */
  async markAsUnread(notificationId: string, userId: string): Promise<boolean> {
    return this.notificationRepo.setNotificationRead(userId, notificationId, false);
  }

  /**
   * Mark all notifications as read for a user
   */
  async markAllAsRead(userId: string): Promise<void> {
    await this.notificationRepo.markAllNotificationsRead(userId);
  }

  /**
   * Get unread notification count for a user
   */
  async getUnreadCount(userId: string): Promise<number> {
    const result = await this.notificationRepo.getNotifications({
      userId,
      limit: 1,
      unreadOnly: true
    });
    return result.unreadCount;
  }
}
