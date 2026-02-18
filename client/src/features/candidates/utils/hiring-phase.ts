/**
 * Hiring Phase Utilities (Client-side)
 *
 * Provides utilities for determining and displaying a candidate's current hiring phase
 * based on milestone dates (LOI, LOO issued, LOO accepted, etc.)
 *
 * Hiring Flow:
 * 1. LOI Issued - Candidate created with Letter of Intent date
 * 2. Pre-hire - Letter of Offer has been issued (accepted or pending)
 * 3. Onboarding - All pre-hire tasks complete, onboarding tasks in progress
 */

/**
 * Hiring phases a candidate progresses through
 */
export type HiringPhase = 
  | "loi_issued"     // LOI date set, no LOO issued yet
  | "pre_hire"       // LOO issued (accepted or pending), pre-hire work
  | "onboarding";    // Pre-hire complete, onboarding phase

/**
 * Human-readable labels for each hiring phase
 */
export const HIRING_PHASE_LABELS: Record<HiringPhase, string> = {
  loi_issued: "LOI Issued",
  pre_hire: "Pre-hire",
  onboarding: "Onboarding",
};

/**
 * Badge variant for each hiring phase (for UI styling)
 */
export const HIRING_PHASE_VARIANTS: Record<HiringPhase, "default" | "secondary" | "outline" | "destructive"> = {
  loi_issued: "outline",
  pre_hire: "default",
  onboarding: "default",
};

/**
 * Step number for each phase (for stepper UI)
 */
export const HIRING_PHASE_STEPS: Record<HiringPhase, number> = {
  loi_issued: 1,
  pre_hire: 2,
  onboarding: 3,
};

/**
 * Information about a candidate's current hiring phase
 */
export interface HiringPhaseInfo {
  /** Current phase */
  phase: HiringPhase;
  /** Human-readable phase label */
  label: string;
  /** Step number (1-3) */
  step: number;
  /** Whether a template can be applied (only after LOO acceptance) */
  canApplyTemplate: boolean;
  /** Whether template is selected but not yet applied */
  templatePending: boolean;
  /** If blocked, the reason why */
  blockedReason?: string;
  /** Next action the user can take */
  nextAction?: {
    label: string;
    field: "offerLetterIssuedAt" | "offerLetterAcceptedAt" | "anticipatedStartDate";
  };
}

/**
 * Minimal candidate fields needed for phase calculation
 */
export interface CandidateForPhase {
  letterOfIntentDate?: Date | string | null;
  offerLetterIssuedAt?: Date | string | null;
  offerLetterAcceptedAt?: Date | string | null;
  anticipatedStartDate?: Date | string | null;
  templateAppliedFromId?: string | null;
  templateAppliedAt?: Date | string | null;
  currentStageId?: string | null;
  currentStage?: {
    phase?: "pre_hire" | "onboarding" | string | null;
    name?: string | null;
  } | null;
}

type CandidateForStageLabel = CandidateForPhase & {
  currentStage?: {
    name?: string | null;
  } | null;
};

/**
 * Calculate the current hiring phase for a candidate based on milestone dates
 *
 * @param candidate - Candidate record with milestone date fields
 * @returns HiringPhaseInfo with current phase and available actions
 */
export function getHiringPhase(candidate: CandidateForPhase): HiringPhaseInfo {
  const hasLOI = !!candidate.letterOfIntentDate;
  const hasLOOIssued = !!candidate.offerLetterIssuedAt;
  const hasLOOAccepted = !!candidate.offerLetterAcceptedAt;
  const hasTemplateSelected = !!candidate.templateAppliedFromId;
  const hasTemplateApplied = !!candidate.templateAppliedAt;
  
  // Template is "pending" if selected but not yet applied
  const templatePending = hasTemplateSelected && !hasTemplateApplied;

  // Phase 1: LOI issued, waiting for offer letter
  if (!hasLOOIssued) {
    return {
      phase: "loi_issued",
      label: HIRING_PHASE_LABELS.loi_issued,
      step: HIRING_PHASE_STEPS.loi_issued,
      canApplyTemplate: false,
      templatePending,
      blockedReason: "Waiting for Letter of Offer to be issued",
      nextAction: {
        label: "Record Offer Issued",
        field: "offerLetterIssuedAt",
      },
    };
  }

  // Phase 2: Pre-hire starts once offer is issued (acceptance may still be pending)
  if (!hasLOOAccepted) {
    return {
      phase: "pre_hire",
      label: HIRING_PHASE_LABELS.pre_hire,
      step: HIRING_PHASE_STEPS.pre_hire,
      canApplyTemplate: false,
      templatePending,
      blockedReason: "Waiting for Letter of Offer to be accepted",
      nextAction: {
        label: "Record Offer Accepted",
        field: "offerLetterAcceptedAt",
      },
    };
  }

  // Phase 3+: LOO accepted - template should be applied
  // Determine if in pre_hire or onboarding based on current stage phase

  // If template is applied, use the current stage's phase to determine hiring phase
  if (hasTemplateApplied) {
    // Use the actual phase from the candidate's current stage if available
    const actualPhase = candidate.currentStage?.phase;
    const phase: HiringPhase =
      actualPhase === "onboarding" ? "onboarding" : "pre_hire";

    return {
      phase,
      label: HIRING_PHASE_LABELS[phase],
      step: HIRING_PHASE_STEPS[phase],
      canApplyTemplate: false, // Already applied
      templatePending: false,
    };
  }

  // LOO accepted but template not yet applied (edge case - should auto-apply)
  return {
    phase: "pre_hire",
    label: HIRING_PHASE_LABELS.pre_hire,
    step: HIRING_PHASE_STEPS.pre_hire,
    canApplyTemplate: true,
    templatePending,
    blockedReason: templatePending ? "Template ready to be applied" : undefined,
  };
}

/**
 * Resolve the stage badge label for candidate list/detail views.
 * When no workflow stage is set yet, align the label to hiring milestones.
 */
export function resolveCandidateStageLabel(
  candidate: CandidateForStageLabel | null | undefined,
  fallbackLabel: string = "Not Started"
): string {
  const stageName = candidate?.currentStage?.name?.trim();
  if (stageName) return stageName;
  if (!candidate) return fallbackLabel;

  if (candidate.offerLetterAcceptedAt) return "Offer Accepted";
  if (candidate.offerLetterIssuedAt) return "Offer Sent";
  if (candidate.letterOfIntentDate) return "LOI Issued";
  return fallbackLabel;
}

const STAGE_LABEL_ALIAS_GROUPS: ReadonlyArray<ReadonlySet<string>> = [
  new Set(["loi", "loi issued", "letter of intent"]),
  new Set(["offer", "offer sent", "offer accepted", "letter of offer", "letter of offer sent", "letter of offer accepted"]),
];

function normalizeStageLabel(value?: string | null): string {
  return value?.trim().toLowerCase().replace(/\s+/g, " ") ?? "";
}

/**
 * Compare candidate stage labels against selected stage names from filter dropdown.
 * Supports exact matches and milestone aliases (e.g., "Letter of Intent" vs "LOI Issued").
 */
export function stageLabelsMatch(
  candidateStageLabel?: string | null,
  selectedStageName?: string | null
): boolean {
  const normalizedCandidate = normalizeStageLabel(candidateStageLabel);
  const normalizedSelected = normalizeStageLabel(selectedStageName);

  if (!normalizedCandidate || !normalizedSelected) return false;
  if (normalizedCandidate === normalizedSelected) return true;

  return STAGE_LABEL_ALIAS_GROUPS.some(
    (group) => group.has(normalizedCandidate) && group.has(normalizedSelected)
  );
}

/**
 * Check if a candidate can have their template applied
 * Template can only be applied after LOO is accepted
 *
 * @param candidate - Candidate record
 * @returns Object with allowed flag and optional reason
 */
export function canApplyTemplate(candidate: CandidateForPhase): { allowed: boolean; reason?: string } {
  if (!candidate.offerLetterAcceptedAt) {
    return {
      allowed: false,
      reason: "Cannot apply template until Letter of Offer is accepted",
    };
  }

  if (candidate.templateAppliedAt) {
    return {
      allowed: false,
      reason: "Template has already been applied",
    };
  }

  if (!candidate.templateAppliedFromId) {
    return {
      allowed: false,
      reason: "No template selected for this candidate",
    };
  }

  return { allowed: true };
}
