import { QueryClientProvider } from "@tanstack/react-query";
import { render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { queryClient } from "@/lib/queryClient";
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
  });

  afterEach(() => {
    queryClient.clear();
  });

  it("redirects to /auth when a query fails with 401", async () => {
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
      expect(setLocationMock).toHaveBeenCalledWith("/auth");
    });
  });

  it("redirects to /auth when a mutation fails with 401", async () => {
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
      expect(setLocationMock).toHaveBeenCalledWith("/auth");
    });
  });
});
