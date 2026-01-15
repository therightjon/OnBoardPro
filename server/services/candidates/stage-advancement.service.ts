/**
 * Stage Advancement Service
 *
 * Handles automatic stage advancement and blocked state computation for candidates.
 * Extracted from advance-stage.service.ts to use repository pattern instead of direct db access.
 */

import type { CandidateRepository } from "../../repositories/candidates/CandidateRepository";
import type { CandidateTaskRepository } from "../../repositories/candidates/CandidateTaskRepository";
import type { CandidateStageRepository } from "../../repositories/candidates/CandidateStageRepository";
import type { TemplateStageRepository } from "../../repositories/templates/TemplateStageRepository";
import type { HiringStageRepository } from "../../repositories/reference/HiringStageRepository";
import type { SystemSettingsService } from "../settings/system-settings.service";
import type { db as DbType } from "../../db/connection";

export interface AdvanceStageResult {
  advanced: boolean;
  fromStageId?: string | null;
  toStageId?: string;
  toStageName?: string;
  error?: string;
  reason?: string;
  blocked?: boolean;
  blockers?: Record<string, unknown> | null;
}

export interface RecomputeStageStateResult {
  updated: boolean;
  isBlocked?: boolean;
  autoRegress?: boolean;
  regressed?: boolean;
  blockerSummary?: Record<string, unknown> | null;
}

export class StageAdvancementService {
  constructor(
    private db: typeof DbType,
    private candidateRepo: CandidateRepository,
    private candidateTaskRepo: CandidateTaskRepository,
    private candidateStageRepo: CandidateStageRepository,
    private templateStageRepo: TemplateStageRepository,
    private hiringStageRepo: HiringStageRepository,
    private systemSettingsService: SystemSettingsService
  ) {}

  /**
   * Advance candidate stage if all required tasks in current stage are complete
   *
   * Loop advances through stages until reaching one with open required tasks.
   * Respects template-specific stage ordering if a template is applied.
   */
  async advanceStageIfComplete({
    candidateId,
    invokerUserId
  }: {
    candidateId: string;
    invokerUserId: string;
  }): Promise<AdvanceStageResult> {
    try {
      // Load candidate with current stage
      const candidateRecord = await this.candidateRepo.getCandidateForStageAdvancement(candidateId);
      if (!candidateRecord) {
        return { advanced: false, error: "Candidate not found" };
      }

      // Guardrail: if blocked by prior stage and auto-regress disabled, do not advance
      const settings = await this.systemSettingsService.getSystemSettings();
      const autoRegress = settings.auto_regress_on_prior_open;
      if (candidateRecord.isBlockedByPriorStage && !autoRegress) {
        return { advanced: false, blocked: true, blockers: candidateRecord.blockerSummary };
      }

      // Guardrail: Do not advance if template is selected but not yet applied
      if (candidateRecord.templateAppliedFromId && !candidateRecord.templateAppliedAt) {
        return {
          advanced: false,
          reason: "Template selected but not yet applied. Stage advancement will resume after Letter of Offer acceptance and template expansion."
        };
      }

      // Get template-specific stages if candidate has a template applied
      let stages: Array<{ id: string; name: string; orderIndex: number; templateStageId: string }>;
      if (candidateRecord.templateAppliedFromId) {
        stages = await this.templateStageRepo.getTemplateStagesWithHiringInfo(candidateRecord.templateAppliedFromId);
      } else {
        // Candidates without templates cannot advance stages automatically
        return {
          advanced: false,
          error: "Cannot advance stage for candidate without template. Apply a template first to define stage progression."
        };
      }

      if (!stages.length) {
        return { advanced: false, error: "No hiring stages found" };
      }

      // Determine current stage
      let currentStageId = candidateRecord.currentStageId;

      if (!currentStageId) {
        const lastHistory = await this.candidateStageRepo.getLastStageHistory(candidateId);
        currentStageId = lastHistory?.toStageId ?? stages[0].id;

        // Persist for faster next time
        if (!candidateRecord.currentStageId) {
          await this.candidateRepo.updateCandidateStage(candidateId, currentStageId);
        }
      }

      // Loop advance: keep advancing while the current stage has no open required tasks
      const fromStageId = currentStageId;
      let toStageId = currentStageId;
      let toStageName = stages.find(s => s.id === toStageId)?.name;
      let madeProgress = false;
      let curIndex = stages.findIndex(s => s.id === currentStageId);

      const now = new Date();
      const transitions: Array<{ fromStageId: string | null; toStageId: string }> = [];

      while (curIndex !== -1 && curIndex < stages.length) {
        const stageId = stages[curIndex].id;

        // Check if this stage has any open required tasks
        const openReqCount = await this.candidateTaskRepo.getOpenRequiredTaskCount(candidateId, stageId);

        if (openReqCount > 0) {
          // Stop at the first stage that has required work remaining
          break;
        }

        // If at final stage and it's clear, no further move
        if (curIndex === stages.length - 1) {
          break;
        }

        // Advance to the next stage
        const next = stages[curIndex + 1];
        transitions.push({ fromStageId: stages[curIndex].id, toStageId: next.id });
        curIndex = curIndex + 1;
        toStageId = next.id;
        toStageName = next.name;
        madeProgress = true;
      }

      if (!madeProgress) {
        return { advanced: false, reason: "Required tasks not complete" };
      }

      // Apply all transitions using repositories
      await this.candidateRepo.updateCandidateStage(candidateId, toStageId, now);
      if (transitions.length > 0) {
        await this.candidateStageRepo.recordStageTransitions(candidateId, transitions, invokerUserId, now);
      }

      return { advanced: true, fromStageId, toStageId, toStageName };
    } catch (error) {
      console.error("Error in advanceStageIfComplete:", error);
      return { advanced: false, error: "Internal error" };
    }
  }

  /**
   * Recompute candidate blocked state and optionally regress stage
   */
  async recomputeCandidateStageState({
    candidateId,
    invokerUserId
  }: {
    candidateId: string;
    invokerUserId: string;
  }): Promise<RecomputeStageStateResult> {
    // Fetch candidate
    const cand = await this.candidateRepo.getCandidateForStageAdvancement(candidateId);
    if (!cand) return { updated: false };

    // Resolve stage ordering for this candidate
    let stages: Array<{ id: string; name: string; orderIndex: number }>;
    if (cand.templateAppliedFromId) {
      stages = await this.templateStageRepo.getTemplateStagesWithHiringInfo(cand.templateAppliedFromId);
    } else {
      const hiringStages = await this.hiringStageRepo.getHiringStages();
      stages = hiringStages.map(s => ({ id: s.id, name: s.name, orderIndex: s.orderIndex }));
    }

    if (!stages.length) return { updated: false };

    // Find open tasks for this candidate
    const openTasks = await this.candidateTaskRepo.getOpenTasksForBlockerCalculation(candidateId);

    const stageOrderMap = new Map(stages.map((s) => [s.id, s.orderIndex] as const));
    const tasksWithStage = openTasks.map(t => ({
      ...t,
      stageOrder: stageOrderMap.get(t.stageId as string) ?? Number.MAX_SAFE_INTEGER,
      stageName: stages.find(s => s.id === t.stageId)?.name || 'Unknown Stage'
    }));

    const currentOrder = stageOrderMap.get(cand.currentStageId as string) ?? Number.MAX_SAFE_INTEGER;
    const priorOpen = tasksWithStage.filter(t => currentOrder > t.stageOrder);
    const isBlocked = priorOpen.length > 0;

    // Build blocker summary
    const earliest = priorOpen.sort((a, b) => a.stageOrder - b.stageOrder)[0];
    const blockerSummary = isBlocked ? {
      computedAt: new Date().toISOString(),
      earliestPriorStage: earliest ? { id: earliest.stageId, name: earliest.stageName, orderIndex: earliest.stageOrder } : null,
      priorOpenTasks: priorOpen.map(t => ({
        id: t.id,
        title: t.title,
        stageId: t.stageId,
        stageName: t.stageName,
        status: t.status,
        required: t.required,
        dueAt: t.dueAt
      }))
    } : null;

    // Read settings
    const settings = await this.systemSettingsService.getSystemSettings();
    const autoRegress = settings.auto_regress_on_prior_open;

    // Determine updates
    let nextStageId = cand.currentStageId;
    let regressed = false;
    if (autoRegress && earliest && earliest.stageId && earliest.stageId !== cand.currentStageId) {
      nextStageId = earliest.stageId;
      regressed = true;
    }

    // Update candidate state
    await this.candidateRepo.updateCandidateBlockedState(
      candidateId,
      isBlocked,
      blockerSummary,
      regressed ? (nextStageId ?? undefined) : undefined
    );

    // Record stage history if regressed
    if (regressed && nextStageId) {
      await this.candidateStageRepo.recordStageTransitions(
        candidateId,
        [{ fromStageId: cand.currentStageId, toStageId: nextStageId }],
        invokerUserId
      );
    }

    return { updated: true, isBlocked, autoRegress, regressed, blockerSummary };
  }
}
