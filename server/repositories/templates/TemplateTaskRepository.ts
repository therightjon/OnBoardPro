/**
 * Template Task Repository
 *
 * Handles template task management operations including CRUD operations,
 * automatic template stage resolution, and task archiving.
 */

import { eq, and, asc, sql } from "drizzle-orm";
import {
  templateTasks,
  templateStages,
  type TemplateTask,
  type InsertTemplateTask,
} from "@shared/schemas";
import { BaseRepository } from "../base/BaseRepository";

/**
 * Repository for managing template tasks
 */
export class TemplateTaskRepository extends BaseRepository {
  /**
   * Get all non-archived tasks for a template
   * @param templateId - Template ID
   * @returns Array of template tasks ordered by creation date
   */
  async getTemplateTasks(templateId: string): Promise<TemplateTask[]> {
    return await this.db
      .select()
      .from(templateTasks)
      .where(and(
        eq(templateTasks.templateId, templateId),
        eq(templateTasks.archived, false)
      ))
      .orderBy(asc(templateTasks.createdAt));
  }

  /**
   * Get a template task by ID
   * @param id - Template task ID
   * @returns Template task or undefined if not found
   */
  async getTemplateTask(id: string): Promise<TemplateTask | undefined> {
    const [task] = await this.db.select().from(templateTasks).where(eq(templateTasks.id, id));
    return task || undefined;
  }

  /**
   * Create a new template task
   *
   * Automatically resolves the templateStageId if not provided:
   * - Looks up the active template stage for the given templateId and stageId
   * - Assigns the resolved templateStageId to the task
   *
   * @param insertTask - Template task data to insert
   * @returns Created template task
   * @throws Error if template stage not found when templateStageId not provided
   */
  async createTemplateTask(insertTask: InsertTemplateTask): Promise<TemplateTask> {
    let templateStageId = insertTask.templateStageId;
    if (!templateStageId) {
      const [stage] = await this.db
        .select({ id: templateStages.id })
        .from(templateStages)
        .where(and(
          eq(templateStages.templateId, insertTask.templateId),
          eq(templateStages.stageId, insertTask.stageId),
          eq(templateStages.isActive, true)
        ));
      if (!stage) {
        throw new Error("Template stage not found for task creation");
      }
      templateStageId = stage.id;
    }

    const [task] = await this.db
      .insert(templateTasks)
      .values({ ...insertTask, templateStageId })
      .returning();
    return task;
  }

  /**
   * Update a template task
   *
   * Automatically resolves the templateStageId if stageId is provided without templateStageId:
   * - Retrieves the existing task to get the templateId context
   * - Looks up the active template stage for the new stageId
   * - Updates both stageId and templateStageId atomically
   *
   * @param id - Template task ID
   * @param data - Partial template task data to update
   * @returns Updated template task or undefined if not found
   * @throws Error if template stage not found when stageId changes
   * @throws Error if template context required but not available
   */
  async updateTemplateTask(id: string, data: Partial<TemplateTask>): Promise<TemplateTask | undefined> {
    let updateData: Partial<TemplateTask> = { ...data };

    if (data.stageId && !data.templateStageId) {
      const existing = await this.getTemplateTask(id);
      const templateId = existing?.templateId ?? data.templateId;
      if (!templateId) {
        throw new Error("Template context required to update task stage");
      }

      const [stage] = await this.db
        .select({ id: templateStages.id })
        .from(templateStages)
        .where(and(
          eq(templateStages.templateId, templateId),
          eq(templateStages.stageId, data.stageId),
          eq(templateStages.isActive, true)
        ));
      if (!stage) {
        throw new Error("Template stage not found for task stage update");
      }
      updateData = { ...updateData, templateStageId: stage.id };
    }

    const [task] = await this.db
      .update(templateTasks)
      .set({ ...updateData, updatedAt: new Date() })
      .where(eq(templateTasks.id, id))
      .returning();
    return task || undefined;
  }

  /**
   * Archive a template task (hard delete)
   *
   * Note: Template tasks are actually deleted rather than just archived.
   * This allows the database trigger to auto-remove empty stages.
   *
   * @param id - Template task ID
   */
  async archiveTemplateTask(id: string): Promise<void> {
    // For template tasks, we actually delete them rather than just archive
    // This allows the database trigger to auto-remove empty stages
    await this.db
      .delete(templateTasks)
      .where(eq(templateTasks.id, id));
  }

  /**
   * Reorder a template task within a stage or move to a different stage
   * 
   * @param params - Reorder parameters
   * @returns Updated template task or undefined if not found
   */
  async reorderTemplateTask(params: {
    taskId: string;
    targetStageId: string;
    targetTemplateStageId: string;
    newIndex: number;
  }): Promise<TemplateTask | undefined> {
    const { taskId, targetStageId, targetTemplateStageId, newIndex } = params;

    // Get current task
    const currentTask = await this.getTemplateTask(taskId);
    if (!currentTask) return undefined;

    const isMovingStages = currentTask.templateStageId !== targetTemplateStageId;

    // Use a transaction to ensure atomic updates
    return await this.db.transaction(async (tx) => {
      if (isMovingStages) {
        // Moving to a different stage
        // 1. Decrement order_index for tasks after the old position in the old stage
        await tx
          .update(templateTasks)
          .set({ orderIndex: sql`order_index - 1`, updatedAt: new Date() })
          .where(and(
            eq(templateTasks.templateStageId, currentTask.templateStageId),
            eq(templateTasks.archived, false),
            sql`order_index > ${currentTask.orderIndex}`
          ));

        // 2. Increment order_index for tasks at or after the new position in the target stage
        await tx
          .update(templateTasks)
          .set({ orderIndex: sql`order_index + 1`, updatedAt: new Date() })
          .where(and(
            eq(templateTasks.templateStageId, targetTemplateStageId),
            eq(templateTasks.archived, false),
            sql`order_index >= ${newIndex}`
          ));

        // 3. Update the task with new stage and position
        const [updated] = await tx
          .update(templateTasks)
          .set({
            stageId: targetStageId,
            templateStageId: targetTemplateStageId,
            orderIndex: newIndex,
            updatedAt: new Date()
          })
          .where(eq(templateTasks.id, taskId))
          .returning();

        return updated || undefined;
      } else {
        // Reordering within the same stage
        const oldIndex = currentTask.orderIndex;

        if (oldIndex === newIndex) {
          // No change needed
          return currentTask;
        }

        if (oldIndex < newIndex) {
          // Moving down: decrement tasks between old and new position
          await tx
            .update(templateTasks)
            .set({ orderIndex: sql`order_index - 1`, updatedAt: new Date() })
            .where(and(
              eq(templateTasks.templateStageId, targetTemplateStageId),
              eq(templateTasks.archived, false),
              sql`order_index > ${oldIndex}`,
              sql`order_index <= ${newIndex}`
            ));
        } else {
          // Moving up: increment tasks between new and old position
          await tx
            .update(templateTasks)
            .set({ orderIndex: sql`order_index + 1`, updatedAt: new Date() })
            .where(and(
              eq(templateTasks.templateStageId, targetTemplateStageId),
              eq(templateTasks.archived, false),
              sql`order_index >= ${newIndex}`,
              sql`order_index < ${oldIndex}`
            ));
        }

        // Update the task with new position
        const [updated] = await tx
          .update(templateTasks)
          .set({
            orderIndex: newIndex,
            updatedAt: new Date()
          })
          .where(eq(templateTasks.id, taskId))
          .returning();

        return updated || undefined;
      }
    });
  }
}
