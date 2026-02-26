import { useEffect } from "react";
import { useLocation } from "wouter";
import { queryClient, isSessionExpiredRedirecting } from "@/lib/queryClient";

/**
 * Type guard to check if an error has an HTTP status code.
 */
function isHttpError(error: unknown): error is Error & { status: number } {
  return error instanceof Error && typeof (error as any).status === "number";
}

/**
 * Monitor React Query errors and redirect to auth when a session expires.
 * Acts as defense-in-depth — the primary 401 interception happens in
 * throwIfResNotOk (queryClient.ts), but this catches any edge cases
 * where an error with status 401 reaches the query/mutation cache.
 */
export function SessionExpirationHandler() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    const handleError = (error: Error) => {
      // Skip if the primary redirect in throwIfResNotOk already fired
      if (isSessionExpiredRedirecting()) return;
      if (isHttpError(error) && error.status === 401) {
        queryClient.clear();
        setLocation("/auth?expired=1");
      }
    };

    const unsubscribeQuery = queryClient.getQueryCache().subscribe((event) => {
      if (event.type === "updated" && event.query.state.error) {
        handleError(event.query.state.error as Error);
      }
    });

    const unsubscribeMutation = queryClient.getMutationCache().subscribe((event) => {
      if (event.type === "updated" && event.mutation.state.error) {
        handleError(event.mutation.state.error as Error);
      }
    });

    return () => {
      unsubscribeQuery();
      unsubscribeMutation();
    };
  }, [setLocation]);

  return null;
}
