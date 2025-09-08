import { db } from "../../../db/connection";
import { candidates, candidateStageHistory, hiringStages, candidateTasks, templateStages } from "@shared/schemas";
import { eq, desc, and, sql, inArray } from "drizzle-orm";
import { systemSettings } from "@shared/schemas";

export async function advanceStageIfComplete({
  candidateId,
  invokerUserId
}: {
  candidateId: string;
  invokerUserId: string;
}) {
  try {
    // Load candidate with current stage
    const candidate = await db
      .select()
      .from(candidates)
      .where(eq(candidates.id, candidateId))
      .limit(1);

    if (!candidate.length) {
      return { advanced: false, error: "Candidate not found" };
    }

    const candidateRecord = candidate[0];

    // Guardrail: if blocked by prior stage and auto-regress disabled, do not advance
    const settingsRows = await db.select().from(systemSettings);
    const autoRegress = Boolean(settingsRows.find(r => r.key === 'auto_regress_on_prior_open')?.value?.enabled ?? false);
    if (candidateRecord.isBlockedByPriorStage && !autoRegress) {
      return { advanced: false, blocked: true, blockers: candidateRecord.blockerSummary } as any;
    }

    // Get template-specific stages if candidate has a template applied
    let stages;
    if (candidateRecord.templateAppliedFromId) {
      // Use template-specific stage ordering
      stages = await db
        .select({
          id: hiringStages.id,
          name: hiringStages.name,
          orderIndex: templateStages.orderIndex,
          templateStageId: templateStages.id
        })
        .from(templateStages)
        .innerJoin(hiringStages, eq(templateStages.stageId, hiringStages.id))
        .where(and(
          eq(templateStages.templateId, candidateRecord.templateAppliedFromId),
          eq(templateStages.isActive, true)
        ))
        .orderBy(templateStages.orderIndex);
    } else {
      // ERROR: Candidates without templates cannot advance stages automatically
      // They must have a template applied first to define stage ordering
      return { 
        advanced: false, 
        error: "Cannot advance stage for candidate without template. Apply a template first to define stage progression." 
      };
    }

    if (!stages.length) {
      return { advanced: false, error: "No hiring stages found" };
    }

    // Determine current stage:
    // 1) Prefer candidates.current_stage_id if set
    // 2) Else infer from the latest candidate_stage_history.to_stage_id
    // 3) Else default to the first stage by order_index
    let currentStageId = candidateRecord.currentStageId;

    if (!currentStageId) {
      const lastHistory = await db
        .select()
        .from(candidateStageHistory)
        .where(eq(candidateStageHistory.candidateId, candidateId))
        .orderBy(desc(candidateStageHistory.changedAt))
        .limit(1);

      currentStageId = lastHistory.length ? lastHistory[0].toStageId : stages[0].id;

      // Persist for faster next time
      if (!candidateRecord.currentStageId) {
        await db
          .update(candidates)
          .set({ currentStageId: currentStageId })
          .where(eq(candidates.id, candidateId));
      }
    }

    // Check if current stage is complete - required tasks only
    const openRequiredTasks = await db
      .select({ count: sql<number>`count(*)` })
      .from(candidateTasks)
      .where(
        and(
          eq(candidateTasks.candidateId, candidateId),
          eq(candidateTasks.stageId, currentStageId),
          eq(candidateTasks.required, true),
          eq(candidateTasks.archived, false),
          sql`${candidateTasks.status} <> 'done'`
        )
      );

    if (openRequiredTasks[0].count > 0) {
      return { advanced: false, reason: "Required tasks not complete" };
    }

    // Find next stage
    const currentStageIndex = stages.findIndex(s => s.id === currentStageId);
    if (currentStageIndex === -1 || currentStageIndex === stages.length - 1) {
      return { advanced: false, reason: "Already at final stage or stage not found" };
    }

    const nextStage = stages[currentStageIndex + 1];

    // Advance in a transaction
    await db.transaction(async (trx) => {
      // Update candidate's current stage
      await trx
        .update(candidates)
        .set({ 
          currentStageId: nextStage.id, 
          updatedAt: new Date() 
        })
        .where(eq(candidates.id, candidateId));

      // Record stage history
      await trx
        .insert(candidateStageHistory)
        .values({
          candidateId: candidateId,
          fromStageId: currentStageId,
          toStageId: nextStage.id,
          changedAt: new Date(),
          changedBy: invokerUserId,
          createdAt: new Date(),
          updatedAt: new Date()
        });
    });

    return { 
      advanced: true, 
      fromStageId: currentStageId,
      toStageId: nextStage.id,
      toStageName: nextStage.name
    };
  } catch (error) {
    console.error("Error in advanceStageIfComplete:", error);
    return { advanced: false, error: "Internal error" };
  }
}

// Recompute candidate blocked state and optionally regress stage
export async function recomputeCandidateStageState({
  candidateId,
  invokerUserId
}: {
  candidateId: string;
  invokerUserId: string;
}) {
  // Fetch candidate
  const [cand] = await db.select().from(candidates).where(eq(candidates.id, candidateId)).limit(1);
  if (!cand) return { updated: false } as any;

  // Resolve stage ordering for this candidate: template-specific if applied, else global
  let stages: Array<{ id: string; name: string; orderIndex: number }>; 
  if (cand.templateAppliedFromId) {
    const rows = await db
      .select({ id: hiringStages.id, name: hiringStages.name, orderIndex: templateStages.orderIndex })
      .from(templateStages)
      .innerJoin(hiringStages, eq(templateStages.stageId, hiringStages.id))
      .where(and(eq(templateStages.templateId, cand.templateAppliedFromId), eq(templateStages.isActive, true)))
      .orderBy(templateStages.orderIndex);
    stages = rows as any;
  } else {
    const rows = await db
      .select({ id: hiringStages.id, name: hiringStages.name, orderIndex: hiringStages.orderIndex })
      .from(hiringStages)
      .orderBy(hiringStages.orderIndex);
    stages = rows as any;
  }
  if (!stages.length) return { updated: false } as any;

  const currentIdx = stages.findIndex(s => s.id === cand.currentStageId) ?? 0;

  // Find open tasks for this candidate
  const openTasks = await db
    .select({
      id: candidateTasks.id,
      title: candidateTasks.title,
      stageId: candidateTasks.stageId,
      status: candidateTasks.status,
      required: candidateTasks.required,
      dueAt: candidateTasks.dueAt
    })
    .from(candidateTasks)
    .where(and(
      eq(candidateTasks.candidateId, candidateId),
      eq(candidateTasks.archived, false),
      inArray(candidateTasks.status, ['todo', 'in_progress', 'blocked'] as any)
    ));

  const stageOrderMap = new Map(stages.map((s) => [s.id, s.orderIndex] as const));
  const tasksWithStage = openTasks.map(t => ({
    ...t,
    stageOrder: stageOrderMap.get(t.stageId as any) ?? Number.MAX_SAFE_INTEGER,
    stageName: stages.find(s => s.id === t.stageId)?.name || 'Unknown Stage'
  }));

  const priorOpen = tasksWithStage.filter(t => (stageOrderMap.get(cand.currentStageId as any) ?? Number.MAX_SAFE_INTEGER) > (t.stageOrder ?? Number.MAX_SAFE_INTEGER));
  const isBlocked = priorOpen.length > 0;

  // Build blocker summary
  const earliest = priorOpen.sort((a, b) => (a.stageOrder - b.stageOrder))[0];
  const blockerSummary = isBlocked ? {
    computedAt: new Date().toISOString(),
    earliestPriorStage: earliest ? { id: earliest.stageId, name: earliest.stageName, orderIndex: earliest.stageOrder } : null,
    priorOpenTasks: priorOpen.map(t => ({ id: t.id, title: t.title, stageId: t.stageId, stageName: t.stageName, status: t.status, required: t.required, dueAt: t.dueAt }))
  } : null;

  // Read settings
  const settingsRows = await db.select().from(systemSettings);
  const autoRegress = Boolean(settingsRows.find(r => r.key === 'auto_regress_on_prior_open')?.value?.enabled ?? false);

  // Determine updates
  let nextStageId = cand.currentStageId;
  let regressed = false;
  if (autoRegress && earliest && earliest.stageId && earliest.stageId !== cand.currentStageId) {
    nextStageId = earliest.stageId as any;
    regressed = true;
  }

  await db.transaction(async (trx) => {
    await trx.update(candidates)
      .set({
        isBlockedByPriorStage: isBlocked,
        blockerSummary: blockerSummary as any,
        ...(regressed ? { currentStageId: nextStageId, updatedAt: new Date() } : { updatedAt: new Date() })
      })
      .where(eq(candidates.id, candidateId));

    if (regressed) {
      await trx.insert(candidateStageHistory).values({
        candidateId,
        fromStageId: cand.currentStageId,
        toStageId: nextStageId,
        changedAt: new Date(),
        changedBy: invokerUserId,
        createdAt: new Date(),
        updatedAt: new Date()
      });
    }
  });

  return { updated: true, isBlocked, autoRegress, regressed, blockerSummary } as any;
}
