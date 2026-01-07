/**
 * Candidate Stage Repository
 *
 * Repository for managing candidate stage history and template stage snapshots.
 * Handles stage transitions tracking and candidate-specific template stage storage.
 */

import { eq, and, asc, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import {
  candidateStageHistory,
  candidateTemplateStages,
  candidateTasks,
  hiringStages,
  users,
  auditLog,
  type CandidateTemplateStage,
  type InsertCandidateTemplateStage,
} from "@shared/schemas";
import { BaseRepository } from "../base/BaseRepository";

/**
 * Repository for candidate stage-related data operations
 * Extends BaseRepository to inherit common functionality
 */
export class CandidateStageRepository extends BaseRepository {
  /**
   * Get stage history for a candidate
   *
   * Returns a chronological history of all stage transitions for a candidate,
   * including the stage moved to, the stage moved from, and who made the change.
   * Also includes prerequisite task status changes as timeline events.
   *
   * @param candidateId - Candidate ID
   * @returns Array of stage history entries with full stage and user details, plus prerequisite task events
   */
  async getCandidateStageHistory(candidateId: string): Promise<any[]> {
    const fromStages = alias(hiringStages, 'from_hs');

    // Get stage transition history
    const stageTransitions = await this.db
      .select({
        id: candidateStageHistory.id,
        changedAt: candidateStageHistory.changedAt,
        createdAt: candidateStageHistory.createdAt,
        stage: {
          id: hiringStages.id,
          name: hiringStages.name,
          orderIndex: hiringStages.orderIndex
        },
        fromStage: {
          id: fromStages.id,
          name: fromStages.name,
          orderIndex: fromStages.orderIndex
        },
        changedBy: {
          id: users.id,
          firstName: users.firstName,
          lastName: users.lastName
        }
      })
      .from(candidateStageHistory)
      .leftJoin(hiringStages, eq(candidateStageHistory.toStageId, hiringStages.id))
      .leftJoin(fromStages, eq(candidateStageHistory.fromStageId, fromStages.id))
      .leftJoin(users, eq(candidateStageHistory.changedBy, users.id))
      .where(eq(candidateStageHistory.candidateId, candidateId))
      .orderBy(asc(candidateStageHistory.changedAt), asc(hiringStages.orderIndex), asc(candidateStageHistory.createdAt));

    // Get prerequisite task status change events from audit log
    const prerequisiteTaskEvents = await this.db
      .select({
        id: auditLog.id,
        occurredAt: auditLog.occurredAt,
        eventType: auditLog.eventType,
        details: auditLog.details,
        taskTitle: candidateTasks.title,
        taskId: candidateTasks.id,
        actor: {
          id: users.id,
          firstName: users.firstName,
          lastName: users.lastName
        }
      })
      .from(auditLog)
      .innerJoin(candidateTasks, and(
        eq(auditLog.taskId, candidateTasks.id),
        eq(candidateTasks.isPrerequisiteTask, true)
      ))
      .leftJoin(users, eq(auditLog.actorId, users.id))
      .where(and(
        eq(auditLog.candidateId, candidateId),
        eq(auditLog.eventType, 'task_updated'),
        sql`${auditLog.details}::jsonb ? 'changes'`,
        sql`${auditLog.details}::jsonb->'changes' ? 'status'`
      ))
      .orderBy(asc(auditLog.occurredAt));

    // Get LOO events (sent, accepted, declined) from audit log
    const looEvents = await this.db
      .select({
        id: auditLog.id,
        occurredAt: auditLog.occurredAt,
        eventType: auditLog.eventType,
        details: auditLog.details,
        actor: {
          id: users.id,
          firstName: users.firstName,
          lastName: users.lastName
        }
      })
      .from(auditLog)
      .leftJoin(users, eq(auditLog.actorId, users.id))
      .where(and(
        eq(auditLog.candidateId, candidateId),
        eq(auditLog.eventType, 'candidate_updated'),
        sql`${auditLog.details}::jsonb ? 'changes'`,
        sql`(
          ${auditLog.details}::jsonb->'changes' ? 'offerLetterIssuedAt' OR
          ${auditLog.details}::jsonb->'changes' ? 'offerLetterAcceptedAt' OR
          (${auditLog.details}::jsonb->'changes' ? 'status' AND
           ${auditLog.details}::jsonb->'changes'->'status'->>'after' = 'offer_declined')
        )`
      ))
      .orderBy(asc(auditLog.occurredAt));

    // Transform prerequisite task events to match timeline format
    const taskTimelineEvents = prerequisiteTaskEvents.map(event => ({
      id: event.id,
      type: 'prerequisite_task_update',
      changedAt: event.occurredAt,
      createdAt: event.occurredAt,
      taskTitle: event.taskTitle,
      taskId: event.taskId,
      statusChange: (event.details as any)?.changes?.status,
      changedBy: event.actor
    }));

    // Transform LOO events to match timeline format
    const looTimelineEvents = looEvents.map(event => {
      const changes = (event.details as any)?.changes || {};
      let looEventType: 'loo_sent' | 'loo_accepted' | 'loo_declined' | null = null;

      if (changes.offerLetterIssuedAt) {
        looEventType = 'loo_sent';
      } else if (changes.offerLetterAcceptedAt) {
        looEventType = 'loo_accepted';
      } else if (changes.status?.after === 'offer_declined') {
        looEventType = 'loo_declined';
      }

      return {
        id: event.id,
        type: looEventType,
        changedAt: event.occurredAt,
        createdAt: event.occurredAt,
        changedBy: event.actor
      };
    }).filter(event => event.type !== null);

    // Transform stage transitions to timeline format
    const stageTimelineEvents = stageTransitions.map(transition => ({
      ...transition,
      type: 'stage_transition'
    }));

    // Merge and sort by time (newest first for display, but we'll sort in frontend)
    const allEvents = [...stageTimelineEvents, ...taskTimelineEvents, ...looTimelineEvents];

    return allEvents;
  }

  /**
   * Get candidate template stages (snapshot)
   *
   * Returns the candidate's specific template stage configuration.
   * This is a snapshot of the template stages at the time the template was applied.
   *
   * @param candidateId - Candidate ID
   * @returns Array of candidate template stages ordered by orderIndex
   */
  async getCandidateTemplateStages(candidateId: string): Promise<CandidateTemplateStage[]> {
    try {
      return await this.db
        .select()
        .from(candidateTemplateStages)
        .where(eq(candidateTemplateStages.candidateId, candidateId))
        .orderBy(asc(candidateTemplateStages.orderIndex));
    } catch (error) {
      console.warn(`Error fetching candidate template stages for ${candidateId}:`, error);
      // Return empty array instead of throwing to maintain API resilience
      return [];
    }
  }

  /**
   * Create a candidate template stage
   *
   * @param stage - Stage data to insert
   * @returns Created candidate template stage
   */
  async createCandidateTemplateStage(stage: InsertCandidateTemplateStage): Promise<CandidateTemplateStage> {
    const [created] = await this.db
      .insert(candidateTemplateStages)
      .values(stage)
      .returning();

    return created;
  }

  /**
   * Upsert candidate template stages
   *
   * Inserts or updates multiple candidate template stages using UPSERT.
   * This is typically called when applying a template to a candidate.
   *
   * @param candidateId - Candidate ID
   * @param stages - Array of stage data to upsert
   */
  async upsertCandidateTemplateStages(candidateId: string, stages: InsertCandidateTemplateStage[]): Promise<void> {
    // Use UPSERT to handle conflicts on (candidateId, stageId)
    for (const stage of stages) {
      await this.db
        .insert(candidateTemplateStages)
        .values(stage)
        .onConflictDoUpdate({
          target: [candidateTemplateStages.candidateId, candidateTemplateStages.stageId],
          set: {
            stageNameSnapshot: stage.stageNameSnapshot,
            orderIndex: stage.orderIndex,
            updatedAt: new Date()
          }
        });
    }
  }
}
