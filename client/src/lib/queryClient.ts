/**
 * Query Client / Fetch Utilities
 * Purpose: Central TanStack Query client configuration and fetch helpers (error parsing, auth handling, URL assembly).
 * Belongs: Shared client-side data access patterns; keep API shape assumptions and fetch defaults here.
 * Conventions: Always include credentials, parse JSON safely to surface backend HTML/route misses, and preserve cache key semantics when joining URL parts.
 */
import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { getCsrfToken, clearCsrfTokenCache } from "./csrf";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Debounce flag to prevent multiple simultaneous 401 redirects.
 * Once set, all subsequent 401s are ignored until the redirect completes.
 */
let sessionExpiredRedirecting = false;

/** Check whether a session-expired redirect is already in progress. */
export function isSessionExpiredRedirecting() {
  return sessionExpiredRedirecting;
}

/**
 * Reset the session-expired debounce flag. Only intended for use in tests.
 * @internal
 */
export function _resetSessionExpiredFlag() {
  sessionExpiredRedirecting = false;
}

/**
 * Immediately redirect to the login page when the session has expired.
 * Clears the query cache and uses a hard navigation to reset all React state.
 */
function handleSessionExpired() {
  if (sessionExpiredRedirecting) return;
  sessionExpiredRedirecting = true;
  clearCsrfTokenCache();
  // Defer the clear + redirect to the next microtask so the calling fetch
  // can finish propagating its error without hitting a cleared cache.
  queueMicrotask(() => {
    queryClient.clear();
    window.location.replace("/auth?expired=1");
  });
}

function extractErrorMessage(errorData: any, fallback: string): string {
  if (!errorData) return fallback;
  if (typeof errorData === "string") return errorData;
  if (typeof errorData.message === "string" && errorData.message.trim()) return errorData.message;
  if (typeof errorData.error?.message === "string" && errorData.error.message.trim()) return errorData.error.message;
  if (typeof errorData.error === "string" && errorData.error.trim()) return errorData.error;
  return fallback;
}

function deriveErrorMessage(res: Response, rawText: string): { message: string; parsed?: any } {
  const statusText = res.statusText || "Request failed";
  const cleaned = rawText.replace(/^\uFEFF/, "").trim();

  const tryParse = (text: string) => {
    try {
      const parsed = JSON.parse(text);
      return { message: extractErrorMessage(parsed, statusText), parsed };
    } catch {
      return null;
    }
  };

  const direct = tryParse(cleaned);
  if (direct) return direct;

  const firstJsonChar = cleaned.search(/[\[{]/);
  if (firstJsonChar >= 0) {
    const candidate = cleaned.slice(firstJsonChar);
    const recovered = tryParse(candidate);
    if (recovered) return recovered;
  }

  const messageMatch = cleaned.match(/\"message\"\\s*:\\s*\"([^\"]+)\"/);
  if (messageMatch?.[1]) {
    return { message: messageMatch[1], parsed: undefined };
  }

  return { message: statusText, parsed: undefined };
}

/**
 * Authentication endpoint paths where a 401 means "wrong credentials",
 * NOT "session expired". These should NOT trigger a session-expired redirect.
 */
const AUTH_ENDPOINT_PATHS = new Set(["/api/login", "/api/auth/login", "/api/register"]);

async function throwIfResNotOk(res: Response, requestUrl?: string) {
  if (!res.ok) {
    // Only redirect on 401 for non-auth endpoints.
    // A 401 from a login/register endpoint means bad credentials, not expired session.
    if (res.status === 401) {
      const isAuthEndpoint = requestUrl && AUTH_ENDPOINT_PATHS.has(new URL(requestUrl, window.location.origin).pathname);
      if (!isAuthEndpoint) {
        handleSessionExpired();
      }
    }
    const text = await res.text();
    const { message, parsed } = deriveErrorMessage(res, text);
    const error: any = new Error(message);
    error.status = res.status;
    error.statusText = res.statusText;
    error.body = parsed || text;
    error.parsedBody = parsed;
    throw error;
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

  if (res.status === 401 || res.status === 403) {
    clearCsrfTokenCache();
  }

  await throwIfResNotOk(res, url);
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

    if (res.status === 401) {
      clearCsrfTokenCache();
      // For the auth-check query (/api/user), return null so ProtectedRoute
      // can redirect via Wouter. For everything else, trigger hard redirect.
      if (unauthorizedBehavior === "returnNull") {
        return null as unknown as T;
      }
      handleSessionExpired();
    }

    await throwIfResNotOk(res, url);
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
