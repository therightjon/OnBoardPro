import { db } from "../db";
import { candidates, candidateStageHistory, hiringStages, candidateTasks, templateStages } from "../../shared/schema";
import { eq, desc, and, sql } from "drizzle-orm";

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