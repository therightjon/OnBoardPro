import { QueryClient, QueryFunction } from "@tanstack/react-query";

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

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const res = await fetch(url, {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    // Only use the first element of queryKey as the URL.
    // Additional elements are for cache scoping, not URL path construction.
    const first = (queryKey as ReadonlyArray<unknown>)[0];
    const url = typeof first === "string" ? first : String(first);
    const res = await fetch(url, {
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

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
export async function parseJsonSafe<T = any>(res: Response): Promise<T> {
  const contentType = res.headers.get("content-type") || "";
  const text = await res.text();
  if (!contentType.toLowerCase().includes("application/json")) {
    const snippet = text.slice(0, 120);
    throw new Error(`Unexpected non-JSON response (${res.status}): ${snippet}`);
  }
  try {
    return JSON.parse(text) as T;
  } catch (e) {
    const snippet = text.slice(0, 120);
    throw new Error(`Invalid JSON (${res.status}): ${snippet}`);
  }
}
