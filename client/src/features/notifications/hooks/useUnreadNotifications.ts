import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { fetchNotifications } from "../api";
import { formatUnreadCount } from "../utils";

export const UNREAD_COUNT_QUERY_KEY = ["notifications", "unread-count"] as const;
// Reduced from 20s to 60s to decrease network requests while still providing timely updates
const REFRESH_INTERVAL_MS = 60_000;

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
    // Retry transient errors but never retry 401s — let the session-expired
    // redirect in throwIfResNotOk fire immediately instead of wasting retries.
    retry: (failureCount, error) => {
      if (error && typeof (error as any).status === "number" && (error as any).status === 401) {
        return false;
      }
      return failureCount < 2;
    },
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
    // Don't throw on network errors - just return stale data if available
    throwOnError: false,
  });

  useEffect(() => {
    if (query.error) {
      // Only log once per error instance, not on every refetch failure
      const isNetworkError = query.error instanceof TypeError && 
        (query.error.message === 'Failed to fetch' || query.error.message.includes('NetworkError'));
      if (!isNetworkError) {
        console.warn("Failed to load unread notifications count", query.error);
      }
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
