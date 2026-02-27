import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import AcceptInvitePage from "./page";
import { apiRequest } from "@/lib/queryClient";

const setLocationMock = vi.fn();

vi.mock("wouter", () => ({
  useLocation: () => ["/accept-invite", setLocationMock],
  useSearch: () => "?token=test-token"
}));

vi.mock("@/lib/queryClient", () => ({
  apiRequest: vi.fn()
}));

describe("AcceptInvitePage", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_ENABLE_INVITATIONS", "true");
    vi.mocked(apiRequest).mockRejectedValue({
      status: 404,
      message: "Not found"
    });
  });

  afterEach(() => {
    vi.mocked(apiRequest).mockReset();
    setLocationMock.mockReset();
    vi.unstubAllEnvs();
  });

  test("shows an unavailable message when invitation accept returns 404", async () => {
    render(<AcceptInvitePage />);

    await waitFor(() => {
      expect(screen.getByText("Invitation feature is currently unavailable.")).toBeInTheDocument();
    });

    expect(apiRequest).toHaveBeenCalledWith("POST", "/api/invitations/accept", { token: "test-token" });
  });
});
