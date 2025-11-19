/**
 * Candidate Stage Repository
 *
 * Repository for managing candidate stage history and template stage snapshots.
 * Handles stage transitions tracking and candidate-specific template stage storage.
 */

import { eq, and, asc } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import {
  candidateStageHistory,
  candidateTemplateStages,
  hiringStages,
  users,
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
   *
   * @param candidateId - Candidate ID
   * @returns Array of stage history entries with full stage and user details
   */
  async getCandidateStageHistory(candidateId: string): Promise<any[]> {
    const fromStages = alias(hiringStages, 'from_hs');

    const rows = await this.db
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

    return rows;
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
