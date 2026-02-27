import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { UsersSection } from "./UsersSection";
import { apiRequest, queryClient } from "@/lib/queryClient";

vi.mock("@/features/auth/hooks/use-auth", () => ({
  useAuth: () => ({
    user: { id: "test-admin", role: "system_admin" }
  })
}));

const toastMock = vi.fn();

vi.mock("@/shared/hooks/use-toast", () => ({
  useToast: () => ({
    toast: toastMock
  })
}));

vi.mock("@/lib/queryClient", async () => {
  const actual = await vi.importActual<typeof import("@/lib/queryClient")>("@/lib/queryClient");
  return {
    ...actual,
    apiRequest: vi.fn()
  };
});

function jsonResponse(payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}

describe("UsersSection invitation gating", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_ENABLE_INVITATIONS", "false");
    vi.mocked(apiRequest).mockImplementation(async (_method, url) => {
      if (url === "/api/users") return jsonResponse([]);
      if (url === "/api/departments") return jsonResponse([]);
      throw new Error(`Unexpected request URL: ${url}`);
    });
  });

  afterEach(() => {
    queryClient.clear();
    vi.mocked(apiRequest).mockReset();
    toastMock.mockReset();
    vi.unstubAllEnvs();
  });

  test("hides invite controls when VITE_ENABLE_INVITATIONS is false", async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <UsersSection />
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(apiRequest).toHaveBeenCalledWith("GET", "/api/users");
    });

    expect(screen.queryByTestId("button-send-invite")).not.toBeInTheDocument();
  });
});
