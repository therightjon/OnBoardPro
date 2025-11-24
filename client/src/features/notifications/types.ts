export type NotificationType =
  | "comment.created"
  | "task.assigned"
  | "stage.changed"
  | "mention"
  | "task.due_soon"
  | "task.overdue";
export type NotificationEntityType = "candidate" | "task" | "comment";

export interface NotificationRecord {
  id: string;
  userId: string;
  type: NotificationType | string;
  entityType: NotificationEntityType | string;
  entityId: string;
  payload: Record<string, unknown> | null;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
  deliveredChannels?: string[];
}

export interface NotificationsResponse {
  items: NotificationRecord[];
  nextCursor?: string;
  unreadCount: number;
  totalCount: number;
}
