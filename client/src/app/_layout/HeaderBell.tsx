import { useState } from "react";
import { Bell } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/components/ui/popover";
import { Button } from "@/shared/components/ui/button";
import { fetchNotifications, markNotificationRead } from "@/features/notifications/api";
import type { NotificationRecord, NotificationsResponse } from "@/features/notifications/types";
import { NotificationItem } from "@/features/notifications/components/NotificationItem";
import { mapNotificationToDisplay } from "@/features/notifications/utils";
import { useUnreadNotifications, UNREAD_COUNT_QUERY_KEY } from "@/features/notifications/hooks/useUnreadNotifications";
import { useLocation, Link } from "wouter";
import { NOTIFICATIONS_DROPDOWN_QUERY_KEY, NOTIFICATIONS_LIST_QUERY_KEY } from "@/features/notifications/constants";

export function HeaderBell() {
  const [open, setOpen] = useState(false);
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();

  const unread = useUnreadNotifications();
  const unreadCount = unread.count ?? 0;

  const popoverQuery = useQuery({
    queryKey: NOTIFICATIONS_DROPDOWN_QUERY_KEY,
    queryFn: () => fetchNotifications({ limit: 5 }),
    enabled: open,
    staleTime: 0,
  });

  const markReadMutation = useMutation({
    mutationFn: async ({ id, isRead }: { id: string; isRead: boolean }) => {
      await markNotificationRead(id, isRead);
    },
    onSuccess: (_, variables) => {
      queryClient.setQueryData<NotificationsResponse | undefined>(NOTIFICATIONS_DROPDOWN_QUERY_KEY, (data) => {
        if (!data) return data;
        return {
          ...data,
          items: data.items.map((item) =>
            item.id === variables.id ? { ...item, isRead: variables.isRead } : item
          ),
        };
      });
      void queryClient.invalidateQueries({ queryKey: UNREAD_COUNT_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_DROPDOWN_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_LIST_QUERY_KEY });
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
    onSuccess: (_, visibleNotifications) => {
      if (!visibleNotifications || visibleNotifications.length === 0) return;
      queryClient.setQueryData<NotificationsResponse | undefined>(NOTIFICATIONS_DROPDOWN_QUERY_KEY, (data) => {
        if (!data) return data;
        const readIds = new Set(visibleNotifications.map((notification) => notification.id));
        return {
          ...data,
          items: data.items.map((item) =>
            readIds.has(item.id) ? { ...item, isRead: true } : item
          ),
        };
      });
      void queryClient.invalidateQueries({ queryKey: UNREAD_COUNT_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_DROPDOWN_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_LIST_QUERY_KEY });
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
    const unreadVisible = notifications.filter((notification) => !notification.isRead);
    if (unreadVisible.length === 0) return;
    markVisibleMutation.mutate(unreadVisible);
    setOpen(false);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label="Notifications"
        >
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
