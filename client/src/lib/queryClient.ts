/**
 * Query Client / Fetch Utilities
 * Purpose: Central TanStack Query client configuration and fetch helpers (error parsing, auth handling, URL assembly).
 * Belongs: Shared client-side data access patterns; keep API shape assumptions and fetch defaults here.
 * Conventions: Always include credentials, parse JSON safely to surface backend HTML/route misses, and preserve cache key semantics when joining URL parts.
 */
import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { getCsrfToken, clearCsrfTokenCache } from "./csrf";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    // Read the response text once
    const text = await res.text();
    
    try {
      // Try to parse as JSON for structured error responses
      const errorData = JSON.parse(text);
      // Create an error object with the parsed data
      const error = new Error(errorData.message || res.statusText);
      Object.assign(error, errorData);
      throw error;
    } catch (jsonError) {
      // If JSON parsing fails, use the text as error message
      throw new Error(`${res.status}: ${text || res.statusText}`);
    }
  }
}

/**
 * Perform a JSON-aware API request with credentials included.
 * Throws parsed error bodies when possible; use for imperative mutations.
 */
export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const normalizedMethod = method.toUpperCase();

  const headers = new Headers();
  if (data) {
    headers.set("Content-Type", "application/json");
  }
  if (!SAFE_METHODS.has(normalizedMethod)) {
    const csrfToken = await getCsrfToken();
    headers.set("X-CSRF-Token", csrfToken);
  }

  const res = await fetch(url, {
    method: normalizedMethod,
    headers,
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
    cache: "no-store",
  });

  if (res.status === 403) {
    clearCsrfTokenCache();
  }

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
/**
 * Build a query function for TanStack Query that understands our URL key conventions.
 * - Joins leading string segments of the query key into a URL path.
 * - Honors on401 behavior: returnNull or throw.
 * Intended for use as the default queryFn on the shared client.
 */
export function getQueryFn<T>({ on401: unauthorizedBehavior }: { on401: UnauthorizedBehavior }): QueryFunction<T> {
  return async ({ queryKey }) => {
    // Build URL from all leading string segments of the queryKey.
    // This allows patterns like ["/api/templates", id, "template-tasks"]
    // to correctly request "/api/templates/:id/template-tasks" while still
    // supporting additional non-string items for cache scoping.
    const parts = queryKey as ReadonlyArray<unknown>;
    const stringParts: string[] = [];
    for (const p of parts) {
      if (typeof p !== "string") break;
      stringParts.push(p);
    }

    let url = stringParts[0] ?? "";
    if (stringParts.length > 1) {
      // Join remaining parts as URL path segments, trimming redundant slashes
      const rest = stringParts
        .slice(1)
        .map((s) => s.replace(/^\/+|\/+$/g, ""))
        .join("/");
      url = `${url.replace(/\/$/, "")}/${rest}`;
    }

    const res = await fetch(url, {
      credentials: "include",
      cache: "no-store",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null as unknown as T;
    }

    await throwIfResNotOk(res);
    const data = await parseJsonSafe(res, `Request to ${url} `);
    return data as T;
  };
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});

// Safely parse JSON responses. If the response is HTML or otherwise not JSON,
// throw a clear, concise error to help developers diagnose server route issues
// (e.g., server not restarted so the route isn't registered and HTML is returned).
/**
 * Parse JSON responses with strict content-type checking.
 * Throws clear errors when the response is HTML/empty/invalid JSON to surface backend route/config issues.
 */
export async function parseJsonSafe<T = any>(res: Response, context?: string): Promise<T> {
  const contentType = res.headers.get("content-type") || "";
  const text = await res.text();
  if (!contentType.toLowerCase().includes("application/json")) {
    if (res.status === 204 || text.length === 0) {
      return undefined as unknown as T;
    }
    const snippet = text.slice(0, 120);
    const ctx = context ? `${context} ` : "";
    throw new Error(`${ctx}expected JSON but received (${res.status}) ${snippet || "[empty response]"}. The backend may not be returning an API response.`);
  }
  try {
    return JSON.parse(text) as T;
  } catch (e) {
    const snippet = text.slice(0, 120);
    const ctx = context ? `${context} ` : "";
    throw new Error(`${ctx}invalid JSON (${res.status}): ${snippet}`);
  }
}
