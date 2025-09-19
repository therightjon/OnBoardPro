import { apiRequest, parseJsonSafe } from "@/lib/queryClient";
import type { NotificationsResponse } from "./types";

export interface FetchNotificationsParams {
  limit?: number;
  cursor?: string;
  unreadOnly?: boolean;
  types?: string[];
}

export async function fetchNotifications(params: FetchNotificationsParams = {}): Promise<NotificationsResponse> {
  const searchParams = new URLSearchParams();
  if (params.limit) {
    searchParams.set("limit", String(params.limit));
  }
  if (params.cursor) {
    searchParams.set("cursor", params.cursor);
  }
  if (params.unreadOnly) {
    searchParams.set("unreadOnly", "true");
  }
  if (params.types && params.types.length > 0) {
    searchParams.set("type", params.types.join(","));
  }

  const url = `/api/notifications${searchParams.size ? `?${searchParams.toString()}` : ""}`;
  const res = await apiRequest("GET", url);
  return await parseJsonSafe<NotificationsResponse>(res);
}

export async function markNotificationRead(id: string, isRead: boolean): Promise<void> {
  await apiRequest("PATCH", `/api/notifications/${id}`, { isRead });
}

export async function markAllNotificationsRead(): Promise<number> {
  const res = await apiRequest("POST", "/api/notifications/mark-all-read");
  const data = await parseJsonSafe<{ updated: number }>(res);
  return data.updated;
}
