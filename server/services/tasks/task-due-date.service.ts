/**
 * Task Due Date Service
 *
 * Service for recalculating task due dates based on candidate anchor dates.
 * When a candidate's LOO (Letter of Offer) or start date changes, this service
 * updates all related task due dates according to their due date rules.
 */

import { eq } from "drizzle-orm";
import { candidateTasks } from "@shared/schemas";
import type { db as DbType } from "../../db/connection";
import type { CandidateRepository } from "../../repositories/candidates/CandidateRepository";
import type { CandidateTaskRepository } from "../../repositories/candidates/CandidateTaskRepository";
import {
  type AnchorDates,
  resolveLoiAnchor,
  resolveLooAnchor,
  resolveLooIssuedAnchor,
  resolveLooAcceptedAnchor,
  resolveStartAnchor,
  computeDueFromRule
} from "../../utils/date.utils";

export class TaskDueDateService {
  constructor(
    private readonly db: typeof DbType,
    private readonly candidateRepository: CandidateRepository,
    private readonly candidateTaskRepository: CandidateTaskRepository
  ) {}

  /**
   * Recompute all task due dates for a candidate based on current anchor dates
   *
   * This method:
   * 1. Retrieves the candidate to get current anchor dates (LOO, start)
   * 2. Fetches all non-archived tasks for the candidate
   * 3. Recalculates due dates based on each task's due date rule
   * 4. Updates only tasks where the due date or pending anchor status changed
   * 5. Performs all updates in a transaction for atomicity
   *
   * Due date rules supported:
   * - on_loo_date - Due on the LOO date
   * - days_before_loo - Due N days before LOO date
   * - days_after_loo - Due N days after LOO date
   * - on_start_date - Due on the start date
   * - days_before_start - Due N days before start date
   * - days_after_start - Due N days after start date
   * - fixed_date - Due on a specific fixed date
   * - days_before_stage / days_after_stage - Stage-relative (computed elsewhere)
   *
   * @param candidateId - ID of the candidate whose task due dates should be recalculated
   * @returns Object with count of updated tasks
   * @throws Error if candidate not found
   *
   * @example
   * ```typescript
   * // After updating a candidate's anticipated start date
   * await candidate.updateCandidate(candidateId, {
   *   anticipatedStartDate: new Date('2024-03-01')
   * });
   *
   * // Recalculate all task due dates
   * const result = await dueDateService.recomputeCandidateDueDates(candidateId);
   * console.log(`Updated ${result.updated} task due dates`);
   * ```
   */
  async recomputeCandidateDueDates(candidateId: string): Promise<{ updated: number }> {
    // Get candidate to retrieve anchor dates
    const candidate = await this.candidateRepository.getCandidate(candidateId);
    if (!candidate) {
      throw new Error("Candidate not found");
    }

    // Resolve anchor dates from candidate
    const anchors: AnchorDates = {
      loi: resolveLoiAnchor(candidate),
      loo: resolveLooAnchor(candidate),
      loo_issued: resolveLooIssuedAnchor(candidate),
      loo_accepted: resolveLooAcceptedAnchor(candidate),
      start: resolveStartAnchor(candidate),
    };

    // Get all tasks for this candidate
    const tasks = await this.db
      .select({
        id: candidateTasks.id,
        dueRuleType: candidateTasks.dueRuleType,
        dueRuleValue: candidateTasks.dueRuleValue,
        fixedDate: candidateTasks.fixedDate,
        pendingAnchor: candidateTasks.pendingAnchor,
        dueAt: candidateTasks.dueAt,
        archived: candidateTasks.archived,
      })
      .from(candidateTasks)
      .where(eq(candidateTasks.candidateId, candidateId));

    // Calculate which tasks need updates
    const updates = [] as Array<{ id: string; dueAt: Date | null; pendingAnchor: boolean }>;
    for (const task of tasks) {
      if (task.archived) continue;

      // Compute new due date based on rule
      const dueComputation = computeDueFromRule(
        task.dueRuleType,
        task.dueRuleValue,
        task.fixedDate,
        anchors
      );

      // Check if due date or pending anchor status changed
      const currentDueAt = task.dueAt ? new Date(task.dueAt) : null;
      const newDueAt = dueComputation.dueAt;
      const dueChanged =
        currentDueAt && newDueAt
          ? currentDueAt.getTime() !== newDueAt.getTime()
          : currentDueAt !== newDueAt;

      if (dueChanged || task.pendingAnchor !== dueComputation.pendingAnchor) {
        updates.push({
          id: task.id,
          dueAt: newDueAt,
          pendingAnchor: dueComputation.pendingAnchor,
        });
      }
    }

    // No updates needed
    if (!updates.length) {
      return { updated: 0 };
    }

    // Perform updates in transaction
    const now = new Date();
    await this.db.transaction(async (tx) => {
      for (const update of updates) {
        await tx
          .update(candidateTasks)
          .set({ dueAt: update.dueAt, pendingAnchor: update.pendingAnchor, updatedAt: now })
          .where(eq(candidateTasks.id, update.id));
      }
    });

    return { updated: updates.length };
  }
}
