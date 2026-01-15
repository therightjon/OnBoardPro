/**
 * Stage Advancement Functions
 *
 * Backward-compatible exports that delegate to the new StageAdvancementService.
 * The service uses proper repository patterns instead of direct database access.
 * 
 * @deprecated Use getStageAdvancementService() from service-factory instead for new code.
 */

import { getStageAdvancementService } from "../../../services/service-factory";

/**
 * Advance candidate stage if all required tasks in current stage are complete
 *
 * @deprecated Use getStageAdvancementService().advanceStageIfComplete() instead
 */
export async function advanceStageIfComplete({
  candidateId,
  invokerUserId
}: {
  candidateId: string;
  invokerUserId: string;
}) {
  return getStageAdvancementService().advanceStageIfComplete({ candidateId, invokerUserId });
}

/**
 * Recompute candidate blocked state and optionally regress stage
 * 
 * @deprecated Use getStageAdvancementService().recomputeCandidateStageState() instead
 */
export async function recomputeCandidateStageState({
  candidateId,
  invokerUserId
}: {
  candidateId: string;
  invokerUserId: string;
}) {
  return getStageAdvancementService().recomputeCandidateStageState({ candidateId, invokerUserId });
}
