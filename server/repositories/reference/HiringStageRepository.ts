/**
 * Hiring Stage Repository
 *
 * Manages CRUD operations for hiring stages (reference/lookup data).
 * Hiring stages represent the different phases in the hiring process
 * (e.g., Applied, Interview, Offer, Onboarding).
 */

import { eq, asc, sql } from "drizzle-orm";
import {
  hiringStages,
  type HiringStage,
  type InsertHiringStage
} from "@shared/schemas";
import { BaseRepository } from "../base/BaseRepository";
import type { db as DbType } from "../../db/connection";
import type { Pool } from "pg";

export class HiringStageRepository extends BaseRepository {
  constructor(db: typeof DbType, pool: Pool) {
    super(db, pool);
  }

  /**
   * Get all hiring stages ordered by their display order index
   *
   * Note: This ordering is for admin UI and selectors only,
   * NOT for template or candidate business logic
   *
   * @returns Promise resolving to array of hiring stages
   */
  async getHiringStages(): Promise<HiringStage[]> {
    // DISPLAY ONLY: This ordering is for admin UI and selectors only,
    // NOT for template or candidate business logic
    return await this.db.select().from(hiringStages).orderBy(asc(hiringStages.orderIndex));
  }

  /**
   * Create a new hiring stage
   *
   * If no orderIndex is provided, it will be set to the next available value
   * (max existing orderIndex + 1)
   *
   * @param insertStage - Hiring stage data to insert
   * @returns Promise resolving to the created hiring stage
   */
  async createHiringStage(insertStage: InsertHiringStage): Promise<HiringStage> {
    // If no orderIndex provided, set it to the next available value
    if (!insertStage.orderIndex) {
      const maxOrderQuery = await this.db
        .select({ maxOrder: sql<number>`max(${hiringStages.orderIndex})` })
        .from(hiringStages);
      const maxOrder = maxOrderQuery[0]?.maxOrder || 0;
      insertStage.orderIndex = maxOrder + 1;
    }

    const [stage] = await this.db
      .insert(hiringStages)
      .values(insertStage)
      .returning();
    return stage;
  }

  /**
   * Update an existing hiring stage
   *
   * Updates the updatedAt timestamp automatically
   *
   * @param id - ID of the hiring stage to update
   * @param data - Partial hiring stage data to update
   * @returns Promise resolving to the updated hiring stage, or undefined if not found
   */
  async updateHiringStage(id: string, data: Partial<HiringStage>): Promise<HiringStage | undefined> {
    const [stage] = await this.db
      .update(hiringStages)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(hiringStages.id, id))
      .returning();
    return stage || undefined;
  }

  /**
   * Delete a hiring stage (soft delete)
   *
   * Sets isActive to false instead of actually deleting the record,
   * preserving historical data integrity
   *
   * @param id - ID of the hiring stage to delete
   * @returns Promise resolving when deletion is complete
   */
  async deleteHiringStage(id: string): Promise<void> {
    // Soft delete by setting isActive to false
    await this.db
      .update(hiringStages)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(hiringStages.id, id));
  }
}
