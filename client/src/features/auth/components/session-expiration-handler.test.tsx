import { QueryClientProvider } from "@tanstack/react-query";
import { render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { queryClient, _resetSessionExpiredFlag } from "@/lib/queryClient";
import { SessionExpirationHandler } from "./session-expiration-handler";

const setLocationMock = vi.fn();

vi.mock("wouter", () => ({
  useLocation: () => ["/", setLocationMock] as const,
}));

function unauthorizedError() {
  return Object.assign(new Error("Unauthorized"), { status: 401 });
}

describe("SessionExpirationHandler", () => {
  beforeEach(() => {
    setLocationMock.mockReset();
    queryClient.clear();
    _resetSessionExpiredFlag();
  });

  afterEach(() => {
    queryClient.clear();
    _resetSessionExpiredFlag();
  });

  it("redirects to /auth?expired=1 when a query fails with 401", async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <SessionExpirationHandler />
      </QueryClientProvider>,
    );

    await queryClient
      .fetchQuery({
        queryKey: ["session-expired-query-test"],
        queryFn: async () => {
          throw unauthorizedError();
        },
        retry: false,
      })
      .catch(() => undefined);

    await waitFor(() => {
      expect(setLocationMock).toHaveBeenCalledWith("/auth?expired=1");
    });
  });

  it("redirects to /auth?expired=1 when a mutation fails with 401", async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <SessionExpirationHandler />
      </QueryClientProvider>,
    );

    const mutation = queryClient.getMutationCache().build(queryClient, {
      mutationFn: async () => {
        throw unauthorizedError();
      },
      retry: false,
    });

    await mutation.execute(undefined).catch(() => undefined);

    await waitFor(() => {
      expect(setLocationMock).toHaveBeenCalledWith("/auth?expired=1");
    });
  });

  it("does not redirect for non-401 errors", async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <SessionExpirationHandler />
      </QueryClientProvider>,
    );

    await queryClient
      .fetchQuery({
        queryKey: ["non-401-test"],
        queryFn: async () => {
          throw Object.assign(new Error("Forbidden"), { status: 403 });
        },
        retry: false,
      })
      .catch(() => undefined);

    // Give it time to potentially fire
    await new Promise((r) => setTimeout(r, 50));
    expect(setLocationMock).not.toHaveBeenCalled();
  });
});
