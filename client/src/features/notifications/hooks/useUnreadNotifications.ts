import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { fetchNotifications } from "../api";
import { formatUnreadCount } from "../utils";

export const UNREAD_COUNT_QUERY_KEY = ["notifications", "unread-count"] as const;
const REFRESH_INTERVAL_MS = 20_000;

export interface UseUnreadNotificationsOptions {
  resetOnNavigate?: boolean;
}

export function useUnreadNotifications(options: UseUnreadNotificationsOptions = {}) {
  const [location] = useLocation();
  const { resetOnNavigate = false } = options;

  const query = useQuery({
    queryKey: UNREAD_COUNT_QUERY_KEY,
    queryFn: () => fetchNotifications({ limit: 1, unreadOnly: true }),
    refetchInterval: REFRESH_INTERVAL_MS,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    staleTime: 0,
  });

  useEffect(() => {
    if (query.error) {
      console.warn("Failed to load unread notifications count", query.error);
    }
  }, [query.error]);

  const rawCount = useMemo(() => {
    if (typeof query.data?.unreadCount !== "number" || !Number.isFinite(query.data.unreadCount)) {
      return undefined;
    }
    return Math.max(0, Math.floor(query.data.unreadCount));
  }, [query.data?.unreadCount]);

  const shouldReset = resetOnNavigate && location.startsWith("/notifications");
  const displayCount = shouldReset ? 0 : rawCount ?? 0;
  const formatted = formatUnreadCount(displayCount);
  const hasData = rawCount !== undefined;
  const showBadge = hasData && formatted.showBadge;

  return {
    query,
    rawCount,
    displayCount,
    count: rawCount ?? 0,
    badgeText: formatted.badgeText,
    showBadge,
    ariaLabel: hasData ? formatted.announcement : undefined,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    refetch: query.refetch,
  };
}
