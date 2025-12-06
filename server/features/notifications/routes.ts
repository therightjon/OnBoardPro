import type { Request, Response, NextFunction } from "express";

/**
 * Interface for notification storage operations used by the handler functions.
 * This is a minimal interface that allows for easy mocking in tests.
 */
export interface NotificationStorageInterface {
  getNotifications(params: {
    userId: string;
    limit?: number;
    cursor?: string;
    unreadOnly?: boolean;
    types?: string[];
  }): Promise<{
    items: any[];
    nextCursor?: string;
    unreadCount: number;
    totalCount: number;
  }>;
  setNotificationRead(userId: string, notificationId: string, isRead: boolean): Promise<boolean>;
  markAllNotificationsRead(userId: string): Promise<number>;
}

export async function listNotificationsHandler(storage: Pick<NotificationStorageInterface, "getNotifications">, req: Request, res: Response, next: NextFunction) {
  try {
    const limitParam = typeof req.query.limit === 'string' ? parseInt(req.query.limit, 10) : undefined;
    const limit = limitParam && !Number.isNaN(limitParam) ? Math.min(Math.max(limitParam, 1), 100) : 20;
    const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined;
    const unreadOnly = req.query.unreadOnly === 'true' || req.query.unreadOnly === '1';
    const typeParam = req.query.type;

    let types: string[] | undefined;
    if (typeof typeParam === 'string') {
      types = typeParam.split(',').map((t) => t.trim()).filter(Boolean);
    } else if (Array.isArray(typeParam)) {
      types = typeParam.filter((t): t is string => typeof t === 'string').map((t) => t.trim()).filter(Boolean);
    }

    const result = await storage.getNotifications({
      userId: req.user!.id,
      limit,
      cursor,
      unreadOnly,
      types,
    });

    res.json(result);
  } catch (error) {
    next(error);
  }
}

export async function markNotificationReadHandler(storage: Pick<NotificationStorageInterface, "setNotificationRead">, req: Request, res: Response, next: NextFunction) {
  try {
    const { isRead } = req.body ?? {};
    if (typeof isRead !== 'boolean') {
      return res.status(400).json({ message: 'isRead flag must be provided as boolean' });
    }

    const updated = await storage.setNotificationRead(req.user!.id, req.params.id, isRead);
    if (!updated) {
      return res.status(404).json({ message: 'Notification not found' });
    }

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
}

export async function markAllNotificationsReadHandler(storage: Pick<NotificationStorageInterface, "markAllNotificationsRead">, req: Request, res: Response, next: NextFunction) {
  try {
    const updated = await storage.markAllNotificationsRead(req.user!.id);
    res.json({ updated });
  } catch (error) {
    next(error);
  }
}
