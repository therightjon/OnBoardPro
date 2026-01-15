/**
 * Prerequisite Conditions Service
 *
 * Handles evaluation of prerequisite conditions to determine which template tasks
 * should be created immediately upon candidate creation (before LOO acceptance).
 *
 * Current supported conditions:
 * - requires_pt: Task only created for faculty ranks that require P&T approval
 * - always: Task always created regardless of candidate attributes
 * - null/undefined: Defaults to 'always' for backward compatibility
 */

import type { Candidate, FacultyRank } from "@shared/schemas";
import { logger } from "../../utils/logger";

export type PrerequisiteCondition = 'requires_pt' | 'always';

export interface PrerequisiteConditionMetadata {
  condition: PrerequisiteCondition;
  label: string;
  description: string;
}

export interface CandidateWithRank extends Candidate {
  facultyRank?: FacultyRank | null;
}

/**
 * Service for evaluating prerequisite conditions against candidate attributes
 */
export class PrerequisiteConditionsService {
  /**
   * Evaluate whether a prerequisite condition is met for a candidate
   *
   * @param condition - The prerequisite condition to evaluate
   * @param candidate - The candidate to evaluate against (must include facultyRank relation)
   * @returns True if the condition is met, false otherwise
   */
  evaluateCondition(
    condition: PrerequisiteCondition | null | undefined,
    candidate: CandidateWithRank
  ): boolean {
    // If no condition specified, default to 'always' (backward compatibility)
    // This allows prerequisite tasks without explicit conditions to be created
    if (!condition) {
      return true;
    }

    switch (condition) {
      case 'requires_pt':
        return this.requiresPTApproval(candidate);

      case 'always':
        return true;

      default:
        logger.warn(`Unknown prerequisite condition: ${condition}`);
        return false;
    }
  }

  /**
   * Check if candidate's faculty rank requires P&T approval
   *
   * @param candidate - The candidate with facultyRank relation loaded
   * @returns True if the faculty rank requires P&T approval
   */
  private requiresPTApproval(candidate: CandidateWithRank): boolean {
    // If no faculty rank is assigned, P&T is not required
    if (!candidate.facultyRank) {
      return false;
    }

    // Check the requiresPT flag on the faculty rank
    return candidate.facultyRank.requiresPT === true;
  }

  /**
   * Get metadata for all available prerequisite conditions
   *
   * @returns Array of condition metadata for UI display
   */
  getAvailableConditions(): PrerequisiteConditionMetadata[] {
    return [
      {
        condition: 'requires_pt',
        label: 'Requires P&T Approval',
        description: 'Task only created for Associate Professor or higher ranks (ranks with requiresPT flag)'
      },
      {
        condition: 'always',
        label: 'Always Apply',
        description: 'Task always created regardless of candidate attributes'
      }
    ];
  }

  /**
   * Get human-readable label for a prerequisite condition
   *
   * @param condition - The condition to get a label for
   * @returns Human-readable label
   */
  getConditionLabel(condition: PrerequisiteCondition | null | undefined): string {
    const metadata = this.getAvailableConditions().find(m => m.condition === condition);
    return metadata?.label ?? 'Unknown Condition';
  }

  /**
   * Get human-readable description for a prerequisite condition
   *
   * @param condition - The condition to get a description for
   * @returns Human-readable description
   */
  getConditionDescription(condition: PrerequisiteCondition | null | undefined): string {
    const metadata = this.getAvailableConditions().find(m => m.condition === condition);
    return metadata?.description ?? '';
  }
}
