export type NotificationFilterKey = "all" | "unread" | "mentions" | "comments" | "assignments" | "stage";

export type NotificationFilter = {
  key: NotificationFilterKey;
  label: string;
  unreadOnly?: boolean;
  types?: string[];
};

export const NOTIFICATION_FILTERS: NotificationFilter[] = [
  { key: "all", label: "All" },
  { key: "unread", label: "Unread", unreadOnly: true },
  { key: "mentions", label: "Mentions", types: ["mention"] },
  { key: "comments", label: "Comments", types: ["comment.created"] },
  { key: "assignments", label: "Assignments", types: ["task.assigned"] },
  { key: "stage", label: "Stage Changes", types: ["stage.changed"] },
];

export function getNotificationFilter(key: NotificationFilterKey): NotificationFilter {
  return NOTIFICATION_FILTERS.find((filter) => filter.key === key) ?? NOTIFICATION_FILTERS[0];
}
