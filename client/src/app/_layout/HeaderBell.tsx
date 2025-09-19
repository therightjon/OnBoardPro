import { useState } from "react";
import { Bell } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/shared/components/ui/dropdown-menu";
import { Button } from "@/shared/components/ui/button";
import { fetchNotifications, markNotificationRead, markAllNotificationsRead } from "@/features/notifications/api";
import type { NotificationRecord } from "@/features/notifications/types";
import { NotificationItem } from "@/features/notifications/components/NotificationItem";
import { mapNotificationToDisplay } from "@/features/notifications/utils";
import { useLocation, Link } from "wouter";

const UNREAD_COUNT_KEY = ["notifications", "unread-count"] as const;
const DROPDOWN_KEY = ["notifications", "dropdown"] as const;

export function HeaderBell() {
  const [open, setOpen] = useState(false);
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();

  const unreadQuery = useQuery({
    queryKey: UNREAD_COUNT_KEY,
    queryFn: () => fetchNotifications({ limit: 1, unreadOnly: true }),
    refetchInterval: 20_000,
  });

  const dropdownQuery = useQuery({
    queryKey: DROPDOWN_KEY,
    queryFn: () => fetchNotifications({ limit: 10 }),
    enabled: open,
    staleTime: 0,
  });

  const markReadMutation = useMutation({
    mutationFn: async ({ id, isRead }: { id: string; isRead: boolean }) => {
      await markNotificationRead(id, isRead);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: UNREAD_COUNT_KEY });
      void queryClient.invalidateQueries({ queryKey: DROPDOWN_KEY });
      void queryClient.invalidateQueries({ queryKey: ["notifications", "list"] });
    }
  });

  const markAllMutation = useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: UNREAD_COUNT_KEY });
      void queryClient.invalidateQueries({ queryKey: DROPDOWN_KEY });
      void queryClient.invalidateQueries({ queryKey: ["notifications", "list"] });
    }
  });

  const unreadCount = unreadQuery.data?.unreadCount ?? 0;
  const notifications = dropdownQuery.data?.items ?? [];
  const isLoading = dropdownQuery.isLoading || dropdownQuery.isFetching;

  const handleSelect = (notification: NotificationRecord) => {
    const display = mapNotificationToDisplay(notification);
    markReadMutation.mutate({ id: notification.id, isRead: true });
    setOpen(false);
    if (display.link) {
      navigate(display.link);
    }
  };

  const handleMarkAllRead = () => {
    markAllMutation.mutate();
  };

  const badge = unreadCount > 99 ? "99+" : unreadCount.toString();

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Notifications">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 inline-flex items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-none text-destructive-foreground">
              {badge}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <p className="text-sm font-semibold">Notifications</p>
          <Button
            variant="ghost"
            size="sm"
            disabled={markAllMutation.isPending || unreadCount === 0}
            onClick={handleMarkAllRead}
          >
            {markAllMutation.isPending ? "Marking..." : "Mark all read"}
          </Button>
        </div>
        <div className={notifications.length === 0 && !isLoading ? "py-6" : "py-2"}>
          {isLoading ? (
            <div className="px-4 text-sm text-muted-foreground">Loading notifications…</div>
          ) : notifications.length === 0 ? (
            <div className="px-4 text-sm text-muted-foreground">You're all caught up.</div>
          ) : (
            <div className="space-y-1 px-2">
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
        <div className="border-t border-border px-3 py-2 text-center text-sm">
          <Link href="/notifications" onClick={() => setOpen(false)} className="text-primary hover:underline">
            View all notifications
          </Link>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
