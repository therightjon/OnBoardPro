/**
 * Template Estimation Service
 *
 * Handles timeline estimation for templates and candidates with applied templates.
 * Provides complex calculations for:
 * - Phase and stage grouping
 * - Business day calculations
 * - Due date estimation with anchor resolution
 * - Progress tracking (for candidates)
 * - Non-estimable task detection
 */

import { eq, and } from "drizzle-orm";
import type { db as DbType } from "../../db/connection";
import type { Candidate } from "@shared/schemas";
import {
  templateTasks,
  templateStages,
  hiringStages,
  candidates,
  candidateTasks,
  taskDefinitions,
} from "@shared/schemas";
import {
  type AnchorKey,
  type AnchorDates,
  MS_PER_DAY,
  ensureDate,
  computeDueFromRule,
  resolveLoiAnchor,
  resolveLooIssuedAnchor,
  resolveLooAcceptedAnchor,
} from "../../utils/date.utils";
import { countBusinessDays } from "../../utils/business-day.utils";
import type { CandidateRepository } from "../../repositories/candidates/CandidateRepository";

/**
 * Options for template estimation
 */
export interface EstimateTemplateOptions {
  /** Letter of intent date (can override candidate's date) - for prerequisite tasks */
  loiDate?: string | null;
  /** Letter of offer date (can override candidate's date) */
  looDate?: string | null;
  /** Start date (can override candidate's date) */
  startDate?: string | null;
  /** Candidate ID to use for anchor dates if looDate/startDate not provided */
  candidateId?: string | null;
  /** Whether to include business days calculation */
  businessDays?: boolean;
}

/**
 * Non-estimable task information
 */
export interface NonEstimableTask {
  taskId: string;
  rule: string | null;
  reason: string;
  missingAnchor?: AnchorKey | null;
  stageId: string;
  stageName: string;
  phase: string | null;
}

/**
 * Per-phase summary for template estimation
 */
export interface PhaseSummary {
  phase: string;
  taskCount: number;
  lastDueDate: string | null;
}

/**
 * Per-stage summary for template estimation
 */
export interface StageSummary {
  stageId: string;
  stageName: string;
  phase: string | null;
  taskCount: number;
  latestOffsetDays: number;
  lastDueDate: string | null;
}

/**
 * Template estimation result
 */
export interface TemplateEstimationResult {
  templateId: string;
  taskCount: number;
  anchors: {
    loi: string | null;
    loo: string | null;
    start: string | null;
  };
  baselineDate: string | null;
  lastDueDate: string | null;
  totalCalendarDays: number;
  totalBusinessDays: number | null;
  nonEstimable: NonEstimableTask[];
  perPhase: PhaseSummary[];
  perStage: StageSummary[];
}

/**
 * Candidate estimation result
 */
export interface CandidateEstimationResult {
  candidateId: string;
  error?: string;
  taskCount: number;
  completedTasks: number;
  remainingTasks: number;
  lastDueDate: string | null;
  totalCalendarDays: number;
  totalBusinessDays: number | null;
  nonEstimable: Array<{
    taskId: string;
    title: string;
    stageName: string;
    reason: string;
  }>;
  perStage: Array<{
    stageId: string;
    stageName: string;
    latestOffsetDays: number;
  }>;
}

/**
 * Template Estimation Service
 *
 * Provides timeline estimation capabilities for templates and candidates.
 * Uses repository pattern for data access and utility functions for calculations.
 */
export class TemplateEstimationService {
  constructor(
    private readonly db: typeof DbType,
    private readonly candidateRepository: CandidateRepository
  ) {}

  /**
   * Estimate timeline for a template
   *
   * Calculates the complete timeline for a template based on:
   * - Anchor dates (LOO and start dates)
   * - Task due date rules
   * - Phase and stage groupings
   *
   * This method handles:
   * - Tasks with different due date rule types (days before/after LOO/start, fixed dates)
   * - Detection of non-estimable tasks (stage-relative, missing anchors, no due date)
   * - Aggregation by phase and stage
   * - Optional business day calculations
   *
   * @param templateId - The template ID to estimate
   * @param options - Estimation options including anchor dates and calculation preferences
   * @returns Complete timeline estimation including task counts, due dates, and summaries
   */
  async estimateTemplate(
    templateId: string,
    options: EstimateTemplateOptions = {}
  ): Promise<TemplateEstimationResult> {
    const { loiDate, looDate, startDate, candidateId, businessDays: includeBusinessDays = false } = options;

    // Resolve anchor dates from options or candidate
    let candidate: Candidate | undefined;
    if ((!loiDate || !looDate || !startDate) && candidateId) {
      candidate = await this.candidateRepository.getCandidate(candidateId) ?? undefined;
    }

    const anchors: AnchorDates = {
      loi: ensureDate(loiDate ?? (candidate ? resolveLoiAnchor(candidate) : null)),
      loo: ensureDate(looDate ?? candidate?.offerLetterAcceptedAt ?? candidate?.offerLetterIssuedAt ?? null),
      loo_issued: ensureDate(looDate ? looDate : candidate?.offerLetterIssuedAt ?? null),
      loo_accepted: ensureDate(looDate ? looDate : candidate?.offerLetterAcceptedAt ?? null),
      start: ensureDate(startDate ?? candidate?.anticipatedStartDate ?? null),
    };

    // Query all non-archived tasks for the template with stage information
    const tasksQuery = await this.db
      .select({
        id: templateTasks.id,
        stageId: templateTasks.stageId,
        templateStageId: templateTasks.templateStageId,
        stageName: hiringStages.name,
        stagePhase: templateStages.phase,
        dueRuleType: templateTasks.dueRuleType,
        dueRuleValue: templateTasks.dueRuleValue,
        fixedDate: templateTasks.fixedDate
      })
      .from(templateTasks)
      .innerJoin(templateStages, eq(templateStages.id, templateTasks.templateStageId))
      .innerJoin(hiringStages, eq(templateStages.stageId, hiringStages.id))
      .where(and(
        eq(templateTasks.templateId, templateId),
        eq(templateTasks.archived, false)
      ));

    // Calculate baseline date (earliest anchor date)
    const baselineCandidates = [anchors.loi, anchors.loo, anchors.start].filter((date): date is Date => !!date);
    const baselineDate = baselineCandidates.length
      ? new Date(Math.min(...baselineCandidates.map(date => date.getTime())))
      : null;

    // Initialize tracking structures
    const nonEstimable: Array<{ taskId: string; rule: string | null; reason: string; missingAnchor?: AnchorKey; stageId: string; stageName: string; phase: string | null }>
      = [];
    const perPhaseMap = new Map<string, { phase: string; taskCount: number; lastDueDate: Date | null }>();
    const perStageMap = new Map<string, { stageId: string; stageName: string; phase: string | null; taskCount: number; latestOffsetDays: number; lastDueDate: Date | null }>();

    let maxCalendarOffset = 0;
    let maxDueDate: Date | null = null;

    // Process each task to calculate due dates and build summaries
    for (const task of tasksQuery) {
      const phaseKey = task.stagePhase ?? "pre_hire";
      const dueComputation = computeDueFromRule(task.dueRuleType, task.dueRuleValue, task.fixedDate, anchors);

      // Detect stage-relative tasks (cannot be estimated without stage dates)
      if (task.dueRuleType === "days_before_stage" || task.dueRuleType === "days_after_stage") {
        nonEstimable.push({
          taskId: task.id,
          rule: task.dueRuleType,
          reason: "stage_relative",
          stageId: task.stageId,
          stageName: task.stageName,
          phase: phaseKey
        });
        continue;
      }

      // Detect tasks with missing anchors
      if (dueComputation.pendingAnchor) {
        nonEstimable.push({
          taskId: task.id,
          rule: task.dueRuleType ?? null,
          reason: "missing_anchor",
          missingAnchor: dueComputation.missingAnchor,
          stageId: task.stageId,
          stageName: task.stageName,
          phase: phaseKey
        });
        continue;
      }

      // Detect tasks with no due date
      if (!dueComputation.dueAt) {
        nonEstimable.push({
          taskId: task.id,
          rule: task.dueRuleType ?? null,
          reason: "no_due_date",
          stageId: task.stageId,
          stageName: task.stageName,
          phase: phaseKey
        });
        continue;
      }

      // Update per-phase summary
      const phaseSummary = perPhaseMap.get(phaseKey) ?? { phase: phaseKey, taskCount: 0, lastDueDate: null };
      phaseSummary.taskCount += 1;
      if (!phaseSummary.lastDueDate || phaseSummary.lastDueDate < dueComputation.dueAt) {
        phaseSummary.lastDueDate = dueComputation.dueAt;
      }
      perPhaseMap.set(phaseKey, phaseSummary);

      // Update per-stage summary
      const stageSummary = perStageMap.get(task.stageId) ?? {
        stageId: task.stageId,
        stageName: task.stageName,
        phase: phaseKey,
        taskCount: 0,
        latestOffsetDays: 0,
        lastDueDate: null
      };
      stageSummary.taskCount += 1;
      if (!stageSummary.lastDueDate || stageSummary.lastDueDate < dueComputation.dueAt) {
        stageSummary.lastDueDate = dueComputation.dueAt;
      }

      // Calculate offset from baseline date
      if (baselineDate) {
        const offset = Math.max(0, Math.ceil((dueComputation.dueAt.getTime() - baselineDate.getTime()) / MS_PER_DAY));
        if (offset > stageSummary.latestOffsetDays) {
          stageSummary.latestOffsetDays = offset;
        }
        if (offset > maxCalendarOffset) {
          maxCalendarOffset = offset;
        }
      }

      perStageMap.set(task.stageId, stageSummary);

      // Track overall maximum due date
      if (!maxDueDate || maxDueDate < dueComputation.dueAt) {
        maxDueDate = dueComputation.dueAt;
      }
    }

    // Convert maps to sorted arrays for output
    const perPhase = Array.from(perPhaseMap.values())
      .sort((a, b) => a.phase.localeCompare(b.phase))
      .map(summary => ({
        phase: summary.phase,
        taskCount: summary.taskCount,
        lastDueDate: summary.lastDueDate ? summary.lastDueDate.toISOString() : null,
      }));

    const perStage = Array.from(perStageMap.values())
      .sort((a, b) => a.latestOffsetDays - b.latestOffsetDays)
      .map(stage => ({
        stageId: stage.stageId,
        stageName: stage.stageName,
        phase: stage.phase,
        taskCount: stage.taskCount,
        latestOffsetDays: stage.latestOffsetDays,
        lastDueDate: stage.lastDueDate ? stage.lastDueDate.toISOString() : null,
      }));

    // Format non-estimable tasks for output
    const formattedNonEstimable = nonEstimable.map(item => ({
      taskId: item.taskId,
      rule: item.rule,
      reason: item.reason,
      missingAnchor: item.missingAnchor ?? null,
      stageId: item.stageId,
      stageName: item.stageName,
      phase: item.phase,
    }));

    // Calculate business days if requested
    let totalBusinessDays: number | null = null;
    if (includeBusinessDays && baselineDate && maxDueDate) {
      totalBusinessDays = countBusinessDays(baselineDate, maxDueDate);
    }

    return {
      templateId,
      taskCount: tasksQuery.length,
      anchors: {
        loi: anchors.loi ? anchors.loi.toISOString() : null,
        loo: anchors.loo ? anchors.loo.toISOString() : null,
        start: anchors.start ? anchors.start.toISOString() : null,
      },
      baselineDate: baselineDate ? baselineDate.toISOString() : null,
      lastDueDate: maxDueDate ? maxDueDate.toISOString() : null,
      totalCalendarDays: maxCalendarOffset,
      totalBusinessDays,
      nonEstimable: formattedNonEstimable,
      perPhase,
      perStage,
    };
  }

  /**
   * Estimate timeline for a candidate with applied template
   *
   * Calculates remaining timeline for a candidate by:
   * - Analyzing all non-archived tasks
   * - Tracking completion status (done/canceled vs remaining)
   * - Calculating offsets from template application or start date
   * - Identifying tasks without due dates
   *
   * This differs from template estimation by:
   * - Focusing on remaining (incomplete) tasks only
   * - Using actual task due dates from candidate tasks
   * - Tracking completion progress
   * - Using template application date as baseline
   *
   * @param candidateId - The candidate ID to estimate
   * @param businessDays - Whether to include business days calculation
   * @returns Timeline estimation including progress, remaining tasks, and stage summaries
   */
  async estimateCandidate(candidateId: string, businessDays: boolean = false): Promise<CandidateEstimationResult> {
    // Get candidate information including template application date
    const candidate = await this.db
      .select({
        id: candidates.id,
        templateAppliedFromId: candidates.templateAppliedFromId,
        templateAppliedAt: candidates.templateAppliedAt,
        templateLocked: candidates.templateLocked,
        anticipatedStartDate: candidates.anticipatedStartDate,
        currentStageId: candidates.currentStageId
      })
      .from(candidates)
      .where(eq(candidates.id, candidateId))
      .limit(1);

    // Validate candidate and template application
    if (!candidate.length || !candidate[0].templateAppliedFromId) {
      return {
        candidateId,
        error: "No template applied to candidate",
        taskCount: 0,
        totalCalendarDays: 0,
        totalBusinessDays: null,
        remainingTasks: 0,
        completedTasks: 0,
        lastDueDate: null,
        nonEstimable: [],
        perStage: []
      };
    }

    const candidateData = candidate[0];
    const startDate = candidateData.templateAppliedAt || candidateData.anticipatedStartDate;

    if (!startDate) {
      return {
        candidateId,
        error: "No anticipated start date available for calculation",
        taskCount: 0,
        totalCalendarDays: 0,
        totalBusinessDays: null,
        remainingTasks: 0,
        completedTasks: 0,
        lastDueDate: null,
        nonEstimable: [],
        perStage: []
      };
    }

    // Get all tasks for this candidate with stage information and completion status
    const tasksQuery = await this.db
      .select({
        id: candidateTasks.id,
        stageId: candidateTasks.stageId,
        stageName: hiringStages.name,
        status: candidateTasks.status,
        dueAt: candidateTasks.dueAt,
        title: taskDefinitions.name
      })
      .from(candidateTasks)
      .innerJoin(hiringStages, eq(candidateTasks.stageId, hiringStages.id))
      .innerJoin(taskDefinitions, eq(candidateTasks.taskDefId, taskDefinitions.id))
      .where(and(
        eq(candidateTasks.candidateId, candidateId),
        eq(candidateTasks.archived, false)
      ));

    const start = new Date(startDate);
    const taskOffsets: any[] = [];
    const nonEstimable: any[] = [];
    const stageMap = new Map<string, { stageId: string; stageName: string; latestOffsetDays: number }>();

    let completedTasks = 0;
    let remainingTasks = 0;
    let maxOffsetDays = 0;

    // Calculate offsets for remaining (incomplete) tasks based on their due dates
    for (const task of tasksQuery) {
      // Treat 'canceled' as non-blocking (equivalent to 'done')
      if (task.status === 'done' || task.status === 'canceled') {
        completedTasks++;
        continue;
      }

      remainingTasks++;

      if (task.dueAt) {
        const dueDate = new Date(task.dueAt);
        const daysDiff = Math.ceil((dueDate.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
        const effectiveOffset = Math.max(daysDiff, 0);

        taskOffsets.push({
          taskId: task.id,
          stageId: task.stageId,
          stageName: task.stageName,
          offset: effectiveOffset,
          title: task.title
        });

        maxOffsetDays = Math.max(maxOffsetDays, effectiveOffset);

        // Track latest offset per stage
        const stageKey = task.stageId;
        if (!stageMap.has(stageKey) || stageMap.get(stageKey)!.latestOffsetDays < effectiveOffset) {
          stageMap.set(stageKey, {
            stageId: task.stageId,
            stageName: task.stageName,
            latestOffsetDays: effectiveOffset
          });
        }
      } else {
        // Track tasks without due dates
        nonEstimable.push({
          taskId: task.id,
          title: task.title,
          stageName: task.stageName,
          reason: "no due date set"
        });
      }
    }

    // Convert stage map to sorted array
    const perStage = Array.from(stageMap.values()).sort((a, b) => a.latestOffsetDays - b.latestOffsetDays);

    let lastDueDate: string | null = null;
    let totalBusinessDays: number | null = null;

    // Calculate final date and business days
    if (maxOffsetDays > 0) {
      const endDate = new Date(start);
      endDate.setDate(endDate.getDate() + maxOffsetDays);
      lastDueDate = endDate.toISOString().split('T')[0];

      if (businessDays) {
        totalBusinessDays = countBusinessDays(start, endDate);
      }
    }

    return {
      candidateId,
      taskCount: tasksQuery.length,
      completedTasks,
      remainingTasks,
      lastDueDate,
      totalCalendarDays: maxOffsetDays,
      totalBusinessDays,
      nonEstimable,
      perStage
    };
  }
}
