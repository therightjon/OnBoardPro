import { describe, it, expect } from "vitest";
import { isCandidateFullyOnboarded, resolveCandidateStatus, summarizeCandidateTasks } from "./status";

describe("resolveCandidateStatus", () => {
  it("treats archived as highest priority even when previously canceled", () => {
    const result = resolveCandidateStatus({ status: "canceled", archived: true });
    expect(result.status).toBe("archived");
    expect(result.isArchived).toBe(true);
    expect(result.label).toBe("Archived");
  });

  it("keeps archived priority over onboarding completion", () => {
    const result = resolveCandidateStatus({ status: "completed", archived: true });
    expect(result.status).toBe("archived");
    expect(result.isArchived).toBe(true);
  });

  it("returns to the active state when the archived flag is cleared", () => {
    const result = resolveCandidateStatus({ status: "active", archived: false });
    expect(result.status).toBe("active");
    expect(result.isArchived).toBe(false);
  });
});

describe("completion helpers", () => {
  it("marks fully onboarded only when status is completed and all tasks are done", () => {
    const tasks = [{ status: "done" }, { status: "done" }];
    const result = isCandidateFullyOnboarded({ status: "completed" }, tasks);
    expect(result).toBe(true);
  });

  it("treats canceled tasks as completion (allClosed)", () => {
    const tasks = [{ status: "done" }, { status: "canceled" }];
    const result = isCandidateFullyOnboarded({ status: "completed" }, tasks);
    expect(result).toBe(true);
  });

  it("does not mark as fully onboarded when tasks are still open", () => {
    const tasks = [{ status: "done" }, { status: "todo" }];
    const result = isCandidateFullyOnboarded({ status: "completed" }, tasks);
    expect(result).toBe(false);
  });

  it("summarizes task states", () => {
    const summary = summarizeCandidateTasks([{ status: "done" }, { status: "canceled" }, { status: "todo" }]);
    expect(summary.completed).toBe(1);
    expect(summary.canceled).toBe(1);
    expect(summary.open).toBe(1);
    expect(summary.allDone).toBe(false);
    expect(summary.allClosed).toBe(false);
  });
});
