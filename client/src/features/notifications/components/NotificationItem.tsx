import { memo } from "react";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import type { NotificationRecord } from "../types";
import { mapNotificationToDisplay } from "../utils";

interface NotificationItemProps {
  notification: NotificationRecord;
  onSelect?: (notification: NotificationRecord) => void;
  compact?: boolean;
}

function NotificationItemComponent({ notification, onSelect, compact = false }: NotificationItemProps) {
  const display = mapNotificationToDisplay(notification);
  const Icon = display.icon;
  const createdAt = new Date(notification.createdAt);
  const timestamp = Number.isNaN(createdAt.getTime())
    ? ""
    : formatDistanceToNow(createdAt, { addSuffix: true });

  return (
    <button
      type="button"
      onClick={() => onSelect?.(notification)}
      className={cn(
        "w-full text-left flex items-start gap-3 rounded-md border border-transparent px-3 py-2 transition-colors",
        notification.isRead ? "bg-background hover:bg-muted/60" : "bg-muted hover:bg-muted",
        compact ? "" : "md:px-4 md:py-3"
      )}
    >
      <div
        className={cn(
          "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
          "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-100"
        )}
      >
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground truncate">{display.title}</p>
        {display.body ? (
          <p className="text-xs text-muted-foreground truncate">{display.body}</p>
        ) : null}
        <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
          {timestamp ? <span>{timestamp}</span> : null}
          {notification.isRead ? null : <span className="inline-flex h-2 w-2 rounded-full bg-primary" />}
        </div>
      </div>
    </button>
  );
}

/**
 * Memoized notification item component to prevent unnecessary re-renders.
 * Only re-renders when notification ID, read status, or callback functions change.
 */
export const NotificationItem = memo(NotificationItemComponent, (prevProps, nextProps) => {
  // Compare notification properties that affect rendering
  return (
    prevProps.notification.id === nextProps.notification.id &&
    prevProps.notification.isRead === nextProps.notification.isRead &&
    prevProps.notification.createdAt === nextProps.notification.createdAt &&
    prevProps.compact === nextProps.compact &&
    prevProps.onSelect === nextProps.onSelect
  );
});
