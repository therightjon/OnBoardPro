import { describe, it, expect } from "vitest";
import { getHiringPhase } from "./hiring-phase";

describe("getHiringPhase", () => {
  it("returns loi_issued when LOO has not been issued", () => {
    const phase = getHiringPhase({
      letterOfIntentDate: "2026-02-01",
      offerLetterIssuedAt: null,
      offerLetterAcceptedAt: null,
    });

    expect(phase.phase).toBe("loi_issued");
    expect(phase.label).toBe("LOI Issued");
  });

  it("returns pre_hire when LOO is issued but not accepted", () => {
    const phase = getHiringPhase({
      letterOfIntentDate: "2026-02-01",
      offerLetterIssuedAt: "2026-02-05",
      offerLetterAcceptedAt: null,
      templateAppliedFromId: "template-1",
      templateAppliedAt: null,
    });

    expect(phase.phase).toBe("pre_hire");
    expect(phase.label).toBe("Pre-hire");
    expect(phase.canApplyTemplate).toBe(false);
    expect(phase.blockedReason).toContain("accepted");
  });

  it("returns onboarding when template is applied and current stage is onboarding", () => {
    const phase = getHiringPhase({
      letterOfIntentDate: "2026-02-01",
      offerLetterIssuedAt: "2026-02-05",
      offerLetterAcceptedAt: "2026-02-06",
      templateAppliedFromId: "template-1",
      templateAppliedAt: "2026-02-06",
      currentStage: { phase: "onboarding" },
    });

    expect(phase.phase).toBe("onboarding");
    expect(phase.label).toBe("Onboarding");
  });
});
