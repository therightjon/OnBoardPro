import { useState } from "react";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/shared/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/shared/components/ui/tabs";
import { NotificationItem } from "@/features/notifications/components/NotificationItem";
import type { NotificationRecord, NotificationsResponse } from "@/features/notifications/types";
import { fetchNotifications, markNotificationRead, markAllNotificationsRead } from "@/features/notifications/api";
import { mapNotificationToDisplay } from "@/features/notifications/utils";
import { NOTIFICATIONS_LIST_QUERY_KEY, NOTIFICATIONS_DROPDOWN_QUERY_KEY } from "@/features/notifications/constants";
import { getNotificationFilter, NOTIFICATION_FILTERS, type NotificationFilterKey } from "@/features/notifications/filters";

export default function NotificationsPage() {
  const [filter, setFilter] = useState<NotificationFilterKey>("all");
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();

  const currentFilter = getNotificationFilter(filter);

  const notificationsQuery = useInfiniteQuery({
    queryKey: [...NOTIFICATIONS_LIST_QUERY_KEY, filter],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => fetchNotifications({
      limit: 20,
      cursor: pageParam ?? undefined,
      unreadOnly: currentFilter.unreadOnly,
      types: currentFilter.types
    }),
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    refetchInterval: 20_000,
  });

  const markReadMutation = useMutation({
    mutationFn: async ({ id, isRead }: { id: string; isRead: boolean }) => {
      await markNotificationRead(id, isRead);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_LIST_QUERY_KEY, exact: false });
      void queryClient.invalidateQueries({ queryKey: ["notifications", "unread-count"], exact: false });
      void queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_DROPDOWN_QUERY_KEY, exact: false });
    }
  });

  const markAllMutation = useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_LIST_QUERY_KEY, exact: false });
      void queryClient.invalidateQueries({ queryKey: ["notifications", "unread-count"], exact: false });
      void queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_DROPDOWN_QUERY_KEY, exact: false });
    }
  });

  const notifications = notificationsQuery.data?.pages.flatMap((page: NotificationsResponse) => page.items) ?? [];
  const isLoading = notificationsQuery.isLoading;
  const isFetchingNext = notificationsQuery.isFetchingNextPage;
  const hasNext = notificationsQuery.hasNextPage;

  const handleSelect = (notification: NotificationRecord) => {
    const display = mapNotificationToDisplay(notification);
    markReadMutation.mutate({ id: notification.id, isRead: true });
    if (display.link) {
      navigate(display.link);
    }
  };

  const handleMarkAllRead = () => {
    markAllMutation.mutate();
  };

  return (
    <div className="px-4 py-4 md:px-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Notifications</h1>
          <p className="text-sm text-muted-foreground">Stay up to date with comments, mentions, assignments, and stage changes.</p>
        </div>
        <Button
          variant="outline"
          onClick={handleMarkAllRead}
          disabled={markAllMutation.isPending}
        >
          {markAllMutation.isPending ? "Marking…" : "Mark all read"}
        </Button>
      </div>

      <div className="mt-6">
        <Tabs value={filter} onValueChange={(value) => setFilter(value as NotificationFilterKey)}>
          <TabsList className="flex flex-wrap gap-2">
            {NOTIFICATION_FILTERS.map(({ key, label }) => (
              <TabsTrigger key={key} value={key} className="capitalize">
                {label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      <div className="mt-6 space-y-3">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading notifications…</p>
        ) : notifications.length === 0 ? (
          <p className="text-sm text-muted-foreground">No notifications found for this filter.</p>
        ) : (
          notifications.map((notification: NotificationRecord) => (
            <NotificationItem
              key={notification.id}
              notification={notification}
              onSelect={handleSelect}
            />
          ))
        )}
      </div>

      {hasNext && (
        <div className="mt-6 flex justify-center">
          <Button
            variant="outline"
            onClick={() => notificationsQuery.fetchNextPage()}
            disabled={isFetchingNext}
          >
            {isFetchingNext ? "Loading…" : "Load more"}
          </Button>
        </div>
      )}
    </div>
  );
}
