/**
 * Template Repository
 *
 * Handles template management operations including CRUD operations,
 * template cloning, archiving, and readiness checks.
 */

import { eq, and, asc, sql } from "drizzle-orm";
import {
  templates,
  templateStages,
  templateTasks,
  type Template,
  type InsertTemplate,
} from "@shared/schemas";
import { BaseRepository } from "../base/BaseRepository";

/**
 * Repository for managing templates
 */
export class TemplateRepository extends BaseRepository {
  /**
   * Get all non-archived templates
   * @returns Array of templates
   */
  async getTemplates(): Promise<Template[]> {
    return await this.db.select().from(templates).where(eq(templates.archived, false));
  }

  /**
   * Get a template by ID
   * @param id - Template ID
   * @returns Template or undefined if not found
   */
  async getTemplate(id: string): Promise<Template | undefined> {
    const [template] = await this.db.select().from(templates).where(eq(templates.id, id));
    return template || undefined;
  }

  /**
   * Create a new template, optionally cloning stages and tasks from another template
   *
   * When cloning from another template, this method:
   * 1. Creates the new template
   * 2. Copies all active template stages from the source template
   * 3. Maps old stage IDs to new stage IDs
   * 4. Copies all template tasks, updating their stage references
   *
   * @param insertTemplate - Template data to insert
   * @param cloneFromTemplateId - Optional template ID to clone stages and tasks from
   * @returns Created template
   * @throws Error if stage mapping fails during cloning
   */
  async createTemplate(insertTemplate: InsertTemplate, cloneFromTemplateId?: string): Promise<Template> {
    const [template] = await this.db
      .insert(templates)
      .values(insertTemplate)
      .returning();

    // If cloning from another template, copy its template stages and tasks
    if (cloneFromTemplateId) {
      // First, copy template stages
      const sourceStages = await this.db
        .select()
        .from(templateStages)
        .where(and(
          eq(templateStages.templateId, cloneFromTemplateId),
          eq(templateStages.isActive, true)
        ))
        .orderBy(asc(templateStages.orderIndex));

      const stageIdMap = new Map<string, string>();
      if (sourceStages.length > 0) {
        const stagesToClone = sourceStages.map(stage => ({
          templateId: template.id,
          stageId: stage.stageId,
          orderIndex: stage.orderIndex,
          isActive: true,
          phase: stage.phase ?? 'pre_hire'
        }));

        const clonedStages = await this.db
          .insert(templateStages)
          .values(stagesToClone)
          .returning({ id: templateStages.id });

        clonedStages.forEach((clonedStage, index) => {
          const sourceStage = sourceStages[index];
          if (sourceStage?.id && clonedStage?.id) {
            stageIdMap.set(sourceStage.id, clonedStage.id);
          }
        });
      }

      // Then copy template tasks (now stage IDs will be valid)
      const sourceTasks = await this.db
        .select()
        .from(templateTasks)
        .where(and(
          eq(templateTasks.templateId, cloneFromTemplateId),
          eq(templateTasks.archived, false)
        ));

      if (sourceTasks.length > 0) {
        const tasksToClone = sourceTasks.map(task => {
          const mappedTemplateStageId = stageIdMap.get(task.templateStageId ?? "");
          if (!mappedTemplateStageId) {
            throw new Error("Failed to map template stage while cloning template tasks");
          }
          return {
            templateId: template.id,
            taskDefId: task.taskDefId,
            stageId: task.stageId,
            templateStageId: mappedTemplateStageId,
            dueRuleType: task.dueRuleType,
            dueRuleValue: task.dueRuleValue,
            fixedDate: task.fixedDate,
            defaultAssigneeKind: task.defaultAssigneeKind ?? 'user',
            defaultAssigneeUserId: task.defaultAssigneeUserId,
            defaultAssigneeRole: task.defaultAssigneeRole,
            defaultPriorityId: task.defaultPriorityId,
            defaultCategoryId: task.defaultCategoryId,
            archived: false
          };
        });

        await this.db.insert(templateTasks).values(tasksToClone);
      }
    }

    return template;
  }

  /**
   * Update a template
   * @param id - Template ID
   * @param data - Partial template data to update
   * @returns Updated template or undefined if not found
   */
  async updateTemplate(id: string, data: Partial<Template>): Promise<Template | undefined> {
    const [template] = await this.db
      .update(templates)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(templates.id, id))
      .returning();
    return template || undefined;
  }

  /**
   * Archive a template (soft delete)
   *
   * Archives the template by setting archived=true and isActive=false.
   * Appends the current date (MM-DD-YYYY) to the template name to avoid conflicts.
   * Only archives templates that aren't already archived.
   *
   * @param id - Template ID
   * @throws Error if template not found or already archived
   */
  async archiveTemplate(id: string): Promise<void> {
    // Get the current template to access its name
    const template = await this.getTemplate(id);
    if (!template || template.archived) {
      throw new Error("Template not found or already archived");
    }

    // Format current date as MM-DD-YYYY
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const year = now.getFullYear();
    const dateString = `${month}-${day}-${year}`;

    // Append date to template name
    const archivedName = `${template.name} - ${dateString}`;

    const result = await this.db
      .update(templates)
      .set({
        name: archivedName,
        archived: true,
        isActive: false,
        updatedAt: now
      })
      .where(and(eq(templates.id, id), eq(templates.archived, false)))
      .returning({ id: templates.id });

    if (result.length === 0) {
      throw new Error("Template not found or already archived");
    }
  }

  /**
   * Get template readiness status
   *
   * Checks if the template has active stages configured.
   * A template with at least one active stage is considered "ready".
   *
   * @param id - Template ID
   * @returns Object with active_stage_count
   */
  async getTemplateReadiness(id: string): Promise<{
    active_stage_count: number;
    active_task_count: number;
    assigned_task_count: number;
  }> {
    const [result] = await this.db
      .select({
        active_stage_count: sql<number>`COUNT(DISTINCT ${templateStages.id}) FILTER (WHERE ${templateStages.isActive} = true)`,
        active_task_count: sql<number>`COUNT(${templateTasks.id}) FILTER (WHERE ${templateTasks.id} IS NOT NULL)`,
        assigned_task_count: sql<number>`COUNT(${templateTasks.id}) FILTER (
          WHERE ${templateTasks.id} IS NOT NULL
            AND ${templateTasks.defaultAssigneeKind} = 'user'
            AND ${templateTasks.defaultAssigneeUserId} IS NOT NULL
        )`
      })
      .from(templates)
      .leftJoin(templateStages, eq(templateStages.templateId, templates.id))
      .leftJoin(
        templateTasks,
        and(
          eq(templateTasks.templateStageId, templateStages.id),
          eq(templateTasks.archived, false)
        )
      )
      .where(eq(templates.id, id))
      .groupBy(templates.id);

    return result || { active_stage_count: 0, active_task_count: 0, assigned_task_count: 0 };
  }
}
