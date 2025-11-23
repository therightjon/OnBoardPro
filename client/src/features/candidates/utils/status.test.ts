import { describe, it, expect } from "vitest";
import { resolveCandidateStatus } from "./status";

describe("resolveCandidateStatus", () => {
  it("treats archived as highest priority even when previously canceled", () => {
    const result = resolveCandidateStatus({ status: "canceled", archived: true });
    expect(result.status).toBe("archived");
    expect(result.isArchived).toBe(true);
    expect(result.label).toBe("Archived");
  });

  it("keeps archived priority over onboarding completion", () => {
    const result = resolveCandidateStatus(
      { status: "completed", archived: true },
      { onboardingComplete: true }
    );
    expect(result.status).toBe("archived");
    expect(result.isArchived).toBe(true);
  });

  it("marks candidates as completed when onboarding is finished and not archived/canceled", () => {
    const result = resolveCandidateStatus({ status: "active" }, { onboardingComplete: true });
    expect(result.status).toBe("completed");
    expect(result.isCompleted).toBe(true);
  });

  it("returns to the active state when the archived flag is cleared", () => {
    const result = resolveCandidateStatus({ status: "active", archived: false });
    expect(result.status).toBe("active");
    expect(result.isArchived).toBe(false);
  });
});
