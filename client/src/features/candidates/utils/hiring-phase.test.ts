import { describe, it, expect } from "vitest";
import { getHiringPhase, resolveCandidateStageLabel } from "./hiring-phase";

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

describe("resolveCandidateStageLabel", () => {
  it("uses real stage name when available", () => {
    const label = resolveCandidateStageLabel({
      currentStage: { name: "Credentialing" },
      offerLetterIssuedAt: "2026-02-05",
    });

    expect(label).toBe("Credentialing");
  });

  it("shows Offer Sent when stage is missing but LOO was issued", () => {
    const label = resolveCandidateStageLabel({
      currentStage: null,
      offerLetterIssuedAt: "2026-02-05",
      offerLetterAcceptedAt: null,
    });

    expect(label).toBe("Offer Sent");
  });

  it("shows Offer Accepted when stage is missing and LOO was accepted", () => {
    const label = resolveCandidateStageLabel({
      currentStage: null,
      offerLetterIssuedAt: "2026-02-05",
      offerLetterAcceptedAt: "2026-02-06",
    });

    expect(label).toBe("Offer Accepted");
  });
});
