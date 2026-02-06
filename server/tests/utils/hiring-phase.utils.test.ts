import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { getHiringPhase } from "../../utils/hiring-phase.utils";

describe("server getHiringPhase", () => {
  test("returns loi_issued when LOO has not been issued", () => {
    const phase = getHiringPhase({
      letterOfIntentDate: "2026-02-01",
      offerLetterIssuedAt: null,
      offerLetterAcceptedAt: null,
    });

    assert.equal(phase.phase, "loi_issued");
    assert.equal(phase.label, "LOI Issued");
  });

  test("returns pre_hire when LOO is issued but not accepted", () => {
    const phase = getHiringPhase({
      letterOfIntentDate: "2026-02-01",
      offerLetterIssuedAt: "2026-02-05",
      offerLetterAcceptedAt: null,
      templateAppliedFromId: "template-1",
      templateAppliedAt: null,
    });

    assert.equal(phase.phase, "pre_hire");
    assert.equal(phase.label, "Pre-hire");
    assert.equal(phase.canApplyTemplate, false);
    assert.match(phase.blockedReason ?? "", /accepted/i);
  });
});
