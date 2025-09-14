import { db } from "../../../db/connection";
import { candidates, candidateStageHistory, hiringStages, candidateTasks, templateStages } from "@shared/schemas";
import { eq, desc, and, sql, inArray } from "drizzle-orm";
import { systemSettings, readToggleEnabled } from "@shared/schemas";

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
    const autoRegress = readToggleEnabled(settingsRows, 'auto_regress_on_prior_open', false);
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

    // Loop advance: keep advancing while the current stage has no open required tasks
    let fromStageId = currentStageId;
    let toStageId = currentStageId;
    let toStageName = stages.find(s => s.id === toStageId)?.name;
    let madeProgress = false;
    let curIndex = stages.findIndex(s => s.id === currentStageId);

    const now = new Date();
    const transitions: Array<{ from: string | null; to: string }> = [];

    while (curIndex !== -1 && curIndex < stages.length) {
      const stageId = stages[curIndex].id;

      // Check if this stage has any open required tasks
      const openReq = await db
        .select({ count: sql<number>`count(*)` })
        .from(candidateTasks)
        .where(
          and(
            eq(candidateTasks.candidateId, candidateId),
            eq(candidateTasks.stageId, stageId),
            eq(candidateTasks.required, true),
            eq(candidateTasks.archived, false),
            sql`${candidateTasks.status} NOT IN ('done','canceled')`
          )
        );

      if (openReq[0].count > 0) {
        // Stop at the first stage that has required work remaining
        break;
      }

      // If at final stage and it's clear, no further move
      if (curIndex === stages.length - 1) {
        break;
      }

      // Advance to the next stage
      const next = stages[curIndex + 1];
      transitions.push({ from: stages[curIndex].id, to: next.id });
      curIndex = curIndex + 1;
      toStageId = next.id;
      toStageName = next.name;
      madeProgress = true;
    }

    if (!madeProgress) {
      return { advanced: false, reason: "Required tasks not complete" };
    }

    // Apply all transitions in a single transaction
    await db.transaction(async (trx) => {
      await trx.update(candidates)
        .set({ currentStageId: toStageId, updatedAt: now })
        .where(eq(candidates.id, candidateId));

      if (transitions.length > 0) {
        // Ensure deterministic chronological order by slightly incrementing changedAt
        const values = transitions.map((t, idx) => {
          const ts = new Date(now.getTime() + idx); // +1ms per hop
          return {
            candidateId,
            fromStageId: t.from,
            toStageId: t.to,
            changedAt: ts,
            changedBy: invokerUserId,
            createdAt: ts,
            updatedAt: ts,
          } as any;
        });
        await trx.insert(candidateStageHistory).values(values);
      }
    });

    return { advanced: true, fromStageId, toStageId, toStageName };
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
  const autoRegress = readToggleEnabled(settingsRows, 'auto_regress_on_prior_open', false);

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
      const base: any = {
        candidateId,
        toStageId: nextStageId,
        changedAt: new Date(),
        changedBy: invokerUserId,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      if (cand.currentStageId) base.fromStageId = cand.currentStageId;
      await trx.insert(candidateStageHistory).values(base);
    }
  });

  return { updated: true, isBlocked, autoRegress, regressed, blockerSummary } as any;
}
