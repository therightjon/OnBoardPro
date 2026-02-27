import { useEffect, useState } from "react";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/shared/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/shared/components/ui/tabs";
import { Card, CardContent } from "@/shared/components/ui/card";
import { NotificationItem } from "@/features/notifications/components/NotificationItem";
import type { NotificationRecord } from "@/features/notifications/types";
import { fetchNotifications, markNotificationRead, markAllNotificationsRead } from "@/features/notifications/api";
import { mapNotificationToDisplay } from "@/features/notifications/utils";
import { NOTIFICATIONS_LIST_QUERY_KEY, NOTIFICATIONS_DROPDOWN_QUERY_KEY } from "@/features/notifications/constants";
import { getNotificationFilter, NOTIFICATION_FILTERS, type NotificationFilterKey } from "@/features/notifications/filters";
import { PaginationControls } from "@/shared/components/pagination-controls";

const PAGE_SIZE = 5;

export default function NotificationsPage() {
  const [filter, setFilter] = useState<NotificationFilterKey>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();

  const currentFilter = getNotificationFilter(filter);

  useEffect(() => {
    setCurrentPage(1);
  }, [filter]);

  const notificationsQuery = useInfiniteQuery({
    queryKey: [...NOTIFICATIONS_LIST_QUERY_KEY, filter, PAGE_SIZE],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => fetchNotifications({
      limit: PAGE_SIZE,
      cursor: pageParam ?? undefined,
      unreadOnly: currentFilter.unreadOnly,
      types: currentFilter.types
    }),
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    refetchInterval: 20_000,
    placeholderData: (previousData) => previousData,
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

  const {
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isFetching
  } = notificationsQuery;

  const pages = notificationsQuery.data?.pages ?? [];
  const loadedPagesCount = pages.length;
  const totalCount = pages[0]?.totalCount ?? 0;
  const totalPages = Math.max(1, Math.ceil((totalCount || 0) / PAGE_SIZE));
  const currentPageData = pages[currentPage - 1];
  const notifications = currentPageData?.items ?? [];
  const isPageLoading = isLoading || (isFetchingNextPage && !currentPageData);

  useEffect(() => {
    if (!hasNextPage) return;
    if (currentPage <= loadedPagesCount) return;
    if (isFetchingNextPage) return;
    void fetchNextPage();
  }, [currentPage, loadedPagesCount, hasNextPage, fetchNextPage, isFetchingNextPage]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages || 1);
    }
  }, [currentPage, totalPages]);

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
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6 min-w-0 overflow-hidden">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-lg sm:text-xl md:text-2xl font-bold text-foreground">Notifications</h1>
          <p className="text-sm text-muted-foreground">Stay up to date with comments, mentions, assignments, and stage changes.</p>
        </div>
        <Button
          variant="outline"
          onClick={handleMarkAllRead}
          disabled={markAllMutation.isPending}
          className="shrink-0"
        >
          {markAllMutation.isPending ? "Marking…" : "Mark All Read"}
        </Button>
      </div>

      {/* Filter Tabs */}
      <Card>
        <CardContent className="p-3 sm:p-4">
          <Tabs value={filter} onValueChange={(value) => setFilter(value as NotificationFilterKey)}>
            <TabsList className="flex w-full flex-wrap h-auto gap-1 bg-transparent p-0 sm:inline-flex sm:flex-nowrap sm:bg-muted sm:p-1 sm:gap-0">
              {NOTIFICATION_FILTERS.map(({ key, label }) => (
                <TabsTrigger
                  key={key}
                  value={key}
                  className="capitalize text-xs sm:text-sm flex-1 sm:flex-initial data-[state=active]:bg-background data-[state=active]:shadow-sm border border-border sm:border-0"
                >
                  {label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </CardContent>
      </Card>

      {/* Notifications List */}
      <Card className="overflow-hidden">
        <CardContent className="p-3 sm:p-4 min-w-0">
          <div className="space-y-2 min-w-0">
            {isPageLoading ? (
              <p className="text-sm text-muted-foreground py-4 text-center">Loading notifications…</p>
            ) : notifications.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No notifications found for this filter.</p>
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

          {totalCount > PAGE_SIZE && (
            <div className="mt-4 pt-4 border-t border-border/60">
              <PaginationControls
                page={currentPage}
                pageSize={PAGE_SIZE}
                totalCount={totalCount}
                totalPages={totalPages}
                onPageChange={(page) => {
                  setCurrentPage(page);
                }}
                className="justify-center"
              />
            </div>
          )}

          {isFetching && !isLoading && (
            <p className="mt-2 text-center text-xs text-muted-foreground">Updating…</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
