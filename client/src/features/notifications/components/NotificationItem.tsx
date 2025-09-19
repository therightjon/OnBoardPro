import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import type { NotificationRecord } from "../types";
import { mapNotificationToDisplay } from "../utils";

interface NotificationItemProps {
  notification: NotificationRecord;
  onSelect?: (notification: NotificationRecord) => void;
  compact?: boolean;
}

export function NotificationItem({ notification, onSelect, compact = false }: NotificationItemProps) {
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
          notification.isRead ? "bg-secondary" : "bg-primary/80"
        )}
      >
        <Icon className={cn("h-4 w-4", notification.isRead ? "text-foreground" : "text-primary-foreground")} />
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
