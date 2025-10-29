import { useState } from "react";
import { Bell } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/components/ui/popover";
import { Button } from "@/shared/components/ui/button";
import { fetchNotifications, markNotificationRead } from "@/features/notifications/api";
import type { NotificationRecord } from "@/features/notifications/types";
import { NotificationItem } from "@/features/notifications/components/NotificationItem";
import { mapNotificationToDisplay } from "@/features/notifications/utils";
import { useUnreadNotifications, UNREAD_COUNT_QUERY_KEY } from "@/features/notifications/hooks/useUnreadNotifications";
import { useLocation, Link } from "wouter";

const POPOVER_KEY = ["notifications", "popover"] as const;

export function HeaderBell() {
  const [open, setOpen] = useState(false);
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();

  const unread = useUnreadNotifications();

  const popoverQuery = useQuery({
    queryKey: POPOVER_KEY,
    queryFn: () => fetchNotifications({ limit: 5 }),
    enabled: open,
    staleTime: 0,
  });

  const markReadMutation = useMutation({
    mutationFn: async ({ id, isRead }: { id: string; isRead: boolean }) => {
      await markNotificationRead(id, isRead);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: UNREAD_COUNT_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: POPOVER_KEY });
      void queryClient.invalidateQueries({ queryKey: ["notifications", "list"] });
    }
  });

  const markVisibleMutation = useMutation({
    mutationFn: async (visibleNotifications: NotificationRecord[]) => {
      const unreadVisible = visibleNotifications.filter((notification) => !notification.isRead);
      if (unreadVisible.length === 0) return;
      await Promise.all(
        unreadVisible.map((notification) => markNotificationRead(notification.id, true))
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: UNREAD_COUNT_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: POPOVER_KEY });
      void queryClient.invalidateQueries({ queryKey: ["notifications", "list"] });
    }
  });

  const notifications = popoverQuery.data?.items ?? [];
  const isLoading = popoverQuery.isLoading || popoverQuery.isFetching;
  const hasUnreadVisible = notifications.some((notification) => !notification.isRead);

  const handleSelect = (notification: NotificationRecord) => {
    const display = mapNotificationToDisplay(notification);
    markReadMutation.mutate({ id: notification.id, isRead: true });
    setOpen(false);
    if (display.link) {
      navigate(display.link);
    }
  };

  const handleMarkAllRead = () => {
    if (!hasUnreadVisible) return;
    markVisibleMutation.mutate(notifications);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Notifications">
          <Bell className="h-5 w-5" />
          {unread.showBadge && (
            <span className="absolute -top-1 -right-1 inline-flex items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-none text-destructive-foreground">
              {unread.badgeText}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0 shadow-lg">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <p className="text-sm font-semibold">Notifications</p>
          <Button
            variant="ghost"
            size="sm"
            disabled={markVisibleMutation.isPending || !hasUnreadVisible}
            onClick={handleMarkAllRead}
          >
            {markVisibleMutation.isPending ? "Marking..." : "Mark all read"}
          </Button>
        </div>
        <div className={notifications.length === 0 && !isLoading ? "py-6" : "py-3"}>
          {isLoading ? (
            <div className="px-4 text-sm text-muted-foreground">Loading notifications…</div>
          ) : notifications.length === 0 ? (
            <div className="px-4 text-sm text-muted-foreground">You're all caught up.</div>
          ) : (
            <div className="space-y-2 px-3">
              {notifications.map((notification) => (
                <NotificationItem
                  key={notification.id}
                  notification={notification}
                  onSelect={handleSelect}
                  compact
                />
              ))}
            </div>
          )}
        </div>
        <div className="border-t border-border px-4 py-3 text-center text-sm">
          <Link href="/notifications" onClick={() => setOpen(false)} className="font-medium text-primary hover:underline">
            View all notifications
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
