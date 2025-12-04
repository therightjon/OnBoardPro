/**
 * Hiring Phase Utilities (Client-side)
 *
 * Provides utilities for determining and displaying a candidate's current hiring phase
 * based on milestone dates (LOI, LOO issued, LOO accepted, etc.)
 *
 * Hiring Flow:
 * 1. LOI Issued - Candidate created with Letter of Intent date
 * 2. Offer Pending - Letter of Offer has been issued, awaiting acceptance
 * 3. Pre-hire - LOO accepted, template applied, pre-hire tasks in progress
 * 4. Onboarding - All pre-hire tasks complete, onboarding tasks in progress
 */

/**
 * The four hiring phases a candidate progresses through
 */
export type HiringPhase = 
  | "loi_issued"     // LOI date set, no LOO issued yet
  | "offer_pending"  // LOO issued, awaiting acceptance
  | "pre_hire"       // LOO accepted, template applied, pre-hire tasks
  | "onboarding";    // Pre-hire complete, onboarding phase

/**
 * Human-readable labels for each hiring phase
 */
export const HIRING_PHASE_LABELS: Record<HiringPhase, string> = {
  loi_issued: "LOI Issued",
  offer_pending: "Offer Pending",
  pre_hire: "Pre-hire",
  onboarding: "Onboarding",
};

/**
 * Badge variant for each hiring phase (for UI styling)
 */
export const HIRING_PHASE_VARIANTS: Record<HiringPhase, "default" | "secondary" | "outline" | "destructive"> = {
  loi_issued: "outline",
  offer_pending: "secondary",
  pre_hire: "default",
  onboarding: "default",
};

/**
 * Step number for each phase (for stepper UI)
 */
export const HIRING_PHASE_STEPS: Record<HiringPhase, number> = {
  loi_issued: 1,
  offer_pending: 2,
  pre_hire: 3,
  onboarding: 4,
};

/**
 * Information about a candidate's current hiring phase
 */
export interface HiringPhaseInfo {
  /** Current phase */
  phase: HiringPhase;
  /** Human-readable phase label */
  label: string;
  /** Step number (1-4) */
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
}

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

  // Phase 2: Offer issued, waiting for acceptance
  if (!hasLOOAccepted) {
    return {
      phase: "offer_pending",
      label: HIRING_PHASE_LABELS.offer_pending,
      step: HIRING_PHASE_STEPS.offer_pending,
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
  // Determine if in pre_hire or onboarding based on template stages
  // For now, default to pre_hire (actual phase determined by currentStageId in template)
  
  // If template is applied, we're in active workflow
  if (hasTemplateApplied) {
    // TODO: Could determine actual phase (pre_hire vs onboarding) from current stage
    return {
      phase: "pre_hire",
      label: HIRING_PHASE_LABELS.pre_hire,
      step: HIRING_PHASE_STEPS.pre_hire,
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
