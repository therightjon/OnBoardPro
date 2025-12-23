/**
 * Template Stage Repository
 *
 * Handles template stage management operations including CRUD operations,
 * stage reordering with validation, and automatic template activation.
 */

import { eq, and, asc, sql } from "drizzle-orm";
import {
  templateStages,
  templates,
  type TemplateStage,
  type InsertTemplateStage,
} from "@shared/schemas";
import { BaseRepository } from "../base/BaseRepository";

/**
 * Repository for managing template stages
 */
export class TemplateStageRepository extends BaseRepository {
  /**
   * Get all active template stages for a template
   * @param templateId - Template ID
   * @returns Array of template stages ordered by order index
   */
  async getTemplateStages(templateId: string): Promise<TemplateStage[]> {
    return await this.db
      .select()
      .from(templateStages)
      .where(and(
        eq(templateStages.templateId, templateId),
        eq(templateStages.isActive, true)
      ))
      .orderBy(asc(templateStages.orderIndex));
  }

  /**
   * Get a template stage by ID
   * @param id - Template stage ID
   * @returns Template stage or undefined if not found
   */
  async getTemplateStage(id: string): Promise<TemplateStage | undefined> {
    const [stage] = await this.db.select().from(templateStages).where(eq(templateStages.id, id));
    return stage || undefined;
  }

  /**
   * Create or reactivate a template stage
   *
   * Uses upsert logic to handle duplicate stage assignments:
   * - If the stage already exists for this template, it reactivates it
   * - If not, it creates a new template stage
   * - Automatically activates the template when it gets its first active stage
   *
   * @param insertStage - Template stage data to insert
   * @returns Created or reactivated template stage
   */
  async createTemplateStage(insertStage: InsertTemplateStage): Promise<TemplateStage> {
    // (a) Upsert the stage using the exact SQL from requirements
    await this.db.execute(sql`
      INSERT INTO template_stages (template_id, stage_id, order_index, is_active, phase, created_at, updated_at)
      VALUES (${insertStage.templateId}, ${insertStage.stageId}, COALESCE(${insertStage.orderIndex || 0}, 0), TRUE, ${insertStage.phase ?? 'pre_hire'}, now(), now())
      ON CONFLICT (template_id, stage_id)
      DO UPDATE SET
        is_active   = TRUE,
        order_index = COALESCE(EXCLUDED.order_index, template_stages.order_index),
        phase       = EXCLUDED.phase,
        updated_at  = now()
    `);

    // (b) If this template now has exactly 1 active stage, auto-activate template
    const result = await this.db.execute(sql`
      WITH s AS (
        SELECT COUNT(*) AS cnt
        FROM template_stages
        WHERE template_id = ${insertStage.templateId} AND is_active = TRUE
      )
      UPDATE templates t
      SET is_active = TRUE, updated_at = now()
      FROM s
      WHERE t.id = ${insertStage.templateId}
        AND s.cnt = 1
        AND t.is_active = FALSE
      RETURNING t.id, t.is_active
    `);

    // Log for debugging
    if (result.rowCount && result.rowCount > 0) {
      console.log(`Auto-activated template ${insertStage.templateId}`);
    }

    // Return the created/updated stage
    const [stage] = await this.db
      .select()
      .from(templateStages)
      .where(and(
        eq(templateStages.templateId, insertStage.templateId),
        eq(templateStages.stageId, insertStage.stageId)
      ));

    return stage;
  }

  /**
   * Update a template stage
   * @param id - Template stage ID
   * @param data - Partial template stage data to update
   * @returns Updated template stage or undefined if not found
   */
  async updateTemplateStage(id: string, data: Partial<TemplateStage>): Promise<TemplateStage | undefined> {
    const [stage] = await this.db
      .update(templateStages)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(templateStages.id, id))
      .returning();
    return stage || undefined;
  }

  /**
   * Delete a template stage (soft delete)
   *
   * Marks the stage as inactive rather than physically deleting it.
   *
   * @param id - Template stage ID
   */
  async deleteTemplateStage(id: string): Promise<void> {
    await this.db
      .delete(templateStages)
      .where(eq(templateStages.id, id));
  }

  /**
   * Reorder template stages
   *
   * Performs comprehensive validation before reordering:
   * - Validates all stages belong to the specified template
   * - Validates all stages are active
   * - Validates the count matches existing active stages
   * - Validates no invalid stage IDs are provided
   *
   * Updates are performed in a transaction to ensure atomicity.
   *
   * @param templateId - Template ID
   * @param stageIdsInOrder - Array of stage IDs in the desired order
   * @throws Error if stage count mismatch
   * @throws Error if invalid stage ID provided
   */
  async reorderTemplateStages(templateId: string, stageIdsInOrder: string[]): Promise<void> {
    await this.db.transaction(async (trx) => {
      // First, validate that all stages belong to this template and are active
      const existingStages = await trx
        .select({ stageId: templateStages.stageId })
        .from(templateStages)
        .where(and(
          eq(templateStages.templateId, templateId),
          eq(templateStages.isActive, true)
        ));

      const existingStageIds = existingStages.map(s => s.stageId);

      // Check that the count matches
      if (stageIdsInOrder.length !== existingStageIds.length) {
        throw new Error(`stage count mismatch: expected ${existingStageIds.length}, got ${stageIdsInOrder.length}`);
      }

      // Check that all provided stages exist in the template
      for (const stageId of stageIdsInOrder) {
        if (!existingStageIds.includes(stageId)) {
          throw new Error(`Invalid stage ${stageId} for template ${templateId}`);
        }
      }

      // Update each stage with its new order index
      for (let i = 0; i < stageIdsInOrder.length; i++) {
        await trx
          .update(templateStages)
          .set({
            orderIndex: i + 1,
            updatedAt: new Date()
          })
          .where(and(
            eq(templateStages.templateId, templateId),
            eq(templateStages.stageId, stageIdsInOrder[i])
          ));
      }
    });
  }
}
