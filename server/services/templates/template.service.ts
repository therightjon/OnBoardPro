/**
 * Template Service
 *
 * Business logic layer for template management
 * Handles template CRUD, cloning, and application to candidates
 */

import type { InsertTemplate, InsertTemplateStage, InsertTemplateTask, Template, TemplateStage, TemplateTask } from "@shared/schemas";
import type { TemplateRepository } from "../../repositories/templates/TemplateRepository";
import type { TemplateStageRepository } from "../../repositories/templates/TemplateStageRepository";
import type { TemplateTaskRepository } from "../../repositories/templates/TemplateTaskRepository";
import { eventBus, templateCreated, templateUpdated, templateCloned, templateApplied } from "../../events";
import { writeAuditLog } from "../shared/audit-logger";

export interface CreateTemplateInput {
  data: InsertTemplate;
  cloneFromTemplateId?: string;
  actorId?: string;
  requestId?: string;
}

export interface UpdateTemplateInput {
  id: string;
  data: Partial<Template>;
  actorId?: string;
  requestId?: string;
}

export interface CloneTemplateInput {
  sourceTemplateId: string;
  newName: string;
  actorId?: string;
  requestId?: string;
}

export interface ApplyTemplateInput {
  templateId: string;
  candidateId: string;
  actorId: string;
}

/**
 * Service for template-related business operations
 */
export class TemplateService {
  constructor(
    private templateRepo: TemplateRepository,
    private stageRepo: TemplateStageRepository,
    private taskRepo: TemplateTaskRepository
  ) {}

  /**
   * Create a new template
   * Can optionally clone from an existing template
   */
  async createTemplate(input: CreateTemplateInput): Promise<Template> {
    const { data, cloneFromTemplateId, actorId } = input;

    // Create the template
    const template = await this.templateRepo.createTemplate(data, cloneFromTemplateId);

    await writeAuditLog({
      actorId,
      resourceType: "template",
      resourceId: template.id,
      action: "create",
      eventType: cloneFromTemplateId ? "template_cloned" : "template_created",
      requestId: input.requestId,
      details: {
        name: template.name,
        cloneFromTemplateId: cloneFromTemplateId ?? null
      }
    });

    // Publish appropriate domain event
    if (cloneFromTemplateId) {
      await eventBus.publish(templateCloned(template.id, {
        originalTemplateId: cloneFromTemplateId,
        newTemplateName: template.name
      }, {
        actorId
      }));
    } else {
      await eventBus.publish(templateCreated(template.id, {
        templateName: template.name,
        description: template.description
      }, {
        actorId
      }));
    }

    return template;
  }

  /**
   * Update a template
   * Publishes templateUpdated event with list of changed fields
   */
  async updateTemplate(input: UpdateTemplateInput): Promise<Template | undefined> {
    const { id, data, actorId } = input;

    // Update the template
    const template = await this.templateRepo.updateTemplate(id, data);

    if (template) {
      await writeAuditLog({
        actorId,
        resourceType: "template",
        resourceId: id,
        action: "update",
        eventType: "template_updated",
        requestId: input.requestId,
        details: { changes: Object.keys(data) }
      });

      // Publish domain event
      await eventBus.publish(templateUpdated(template.id, {
        templateName: template.name,
        changes: Object.keys(data)
      }, {
        actorId
      }));
    }

    return template;
  }

  /**
   * Clone a template with a new name
   */
  async cloneTemplate(input: CloneTemplateInput): Promise<Template> {
    const { sourceTemplateId, newName, actorId } = input;

    // Get the source template to clone its data
    const sourceTemplate = await this.templateRepo.getTemplate(sourceTemplateId);
    if (!sourceTemplate) {
      throw new Error(`Source template ${sourceTemplateId} not found`);
    }

    // Create new template based on source
    const newTemplateData: InsertTemplate = {
      name: newName,
      description: sourceTemplate.description,
      candidateTypeId: sourceTemplate.candidateTypeId,
      isActive: false, // Cloned templates start as inactive
      createdBy: actorId || null
    };

    return this.createTemplate({
      data: newTemplateData,
      cloneFromTemplateId: sourceTemplateId,
      actorId,
      requestId: input.requestId
    });
  }

  /**
   * Apply a template to a candidate
   * Creates all stages and tasks defined in the template
   */
  async applyTemplate(input: ApplyTemplateInput): Promise<{ tasksCreated: number }> {
    const { templateId, candidateId, actorId } = input;

    // TODO: Implement template application logic
    // This requires:
    // 1. Get template stages and tasks
    // 2. Create candidate stages
    // 3. Create candidate tasks from template tasks
    // 4. Publish candidateTemplateApplied event
    // 5. Publish taskCreated events for each task

    // For now, just publish the template applied event
    const template = await this.templateRepo.getTemplate(templateId);
    if (!template) {
      throw new Error(`Template ${templateId} not found`);
    }

    await writeAuditLog({
      actorId,
      resourceType: "template",
      resourceId: templateId,
      action: "update",
      eventType: "template_applied",
      details: { candidateId }
    });

    await eventBus.publish(templateApplied(candidateId, {
      templateId,
      templateName: template.name,
      tasksCreated: 0, // TODO: Get actual count
      stagesCreated: 0  // TODO: Get actual count
    }, {
      actorId
    }));

    return { tasksCreated: 0 }; // TODO: Return actual count
  }

  /**
   * Get a single template by ID
   */
  async getTemplate(id: string): Promise<Template | undefined> {
    return this.templateRepo.getTemplate(id);
  }

  /**
   * Get all templates
   */
  async getTemplates(): Promise<Template[]> {
    return this.templateRepo.getTemplates();
  }

  /**
   * Archive a template (soft delete)
   */
  async archiveTemplate(id: string, actorId?: string): Promise<void> {
    await this.templateRepo.archiveTemplate(id);
    await writeAuditLog({
      actorId,
      resourceType: "template",
      resourceId: id,
      action: "archive",
      eventType: "template_archived"
    });
    // TODO: Publish templateArchived event
  }

   /**
    * Check if a template is ready to be activated
    */
  async checkTemplateReadiness(id: string): Promise<{ ready: boolean; reason?: string }> {
    // Ensure each active stage has at least one active task
    const stages = await this.stageRepo.getTemplateStages(id);
    const stageIdSet = new Set(stages.map(stage => stage.id));

    if (stages.length === 0) {
      return {
        ready: false,
        reason: 'Template must have at least one stage'
      };
    }

    const tasks = await this.taskRepo.getTemplateTasks(id);
    const tasksByStage = new Map<string, number>();

    for (const task of tasks) {
      if (!stageIdSet.has(task.templateStageId)) continue;
      const currentCount = tasksByStage.get(task.templateStageId) ?? 0;
      tasksByStage.set(task.templateStageId, currentCount + 1);
    }

    const stageWithoutTasks = stages.find(stage => (tasksByStage.get(stage.id) ?? 0) === 0);
    if (stageWithoutTasks) {
      return {
        ready: false,
        reason: 'Each stage should have at least one task'
      };
    }

    // Validate required task fields for readiness
    const relativeDueRuleTypes = new Set([
      'days_before_loo',
      'days_after_loo',
      'days_before_start',
      'days_after_start',
      'days_before_stage',
      'days_after_stage'
    ]);

    const missingRequiredFields = tasks.some(task => {
      if (!stageIdSet.has(task.templateStageId)) {
        return false;
      }

      const needsDueValue = relativeDueRuleTypes.has(task.dueRuleType);
      if (needsDueValue && task.dueRuleValue == null) {
        return true;
      }

      if (task.dueRuleType === 'fixed_date' && !task.fixedDate) {
        return true;
      }

      if (task.defaultAssigneeKind === 'user' && !task.defaultAssigneeUserId) {
        return true;
      }

      if (task.defaultAssigneeKind === 'role' && !task.defaultAssigneeRole) {
        return true;
      }

      return false;
    });

    if (missingRequiredFields) {
      return {
        ready: false,
        reason: 'All required fields should be filled'
      };
    }

    return { ready: true };
  }

  /**
   * Activate a template (make it available for use)
   */
  async activateTemplate(id: string, actorId?: string): Promise<Template | undefined> {
    // Check readiness first
    const { ready, reason } = await this.checkTemplateReadiness(id);

    if (!ready) {
      throw new Error(reason || 'Template is not ready to be activated');
    }

    return this.updateTemplate({
      id,
      data: { isActive: true },
      actorId
    });
  }

  /**
   * Deactivate a template
   */
  async deactivateTemplate(id: string, actorId?: string): Promise<Template | undefined> {
    return this.updateTemplate({
      id,
      data: { isActive: false },
      actorId
    });
  }

  // ============================================================================
  // Template Task Methods
  // ============================================================================

  /**
   * Get all tasks for a template (non-archived)
   */
  async getTemplateTasks(templateId: string): Promise<TemplateTask[]> {
    return this.taskRepo.getTemplateTasks(templateId);
  }

  /**
   * Get a single template task by ID
   */
  async getTemplateTask(id: string): Promise<TemplateTask | undefined> {
    return this.taskRepo.getTemplateTask(id);
  }

  /**
   * Create a new template task
   * Auto-resolves templateStageId from stageId if provided
   */
  async createTemplateTask(input: InsertTemplateTask): Promise<TemplateTask> {
    return this.taskRepo.createTemplateTask(input);
  }

  /**
   * Update a template task
   * Auto-resolves templateStageId if stageId is changed
   */
  async updateTemplateTask(id: string, data: Partial<TemplateTask>): Promise<TemplateTask | undefined> {
    return this.taskRepo.updateTemplateTask(id, data);
  }

  /**
   * Archive (delete) a template task
   * Hard deletes to allow DB trigger to auto-remove empty stages
   */
  async archiveTemplateTask(id: string): Promise<void> {
    return this.taskRepo.archiveTemplateTask(id);
  }

  // ============================================================================
  // Template Stage Methods
  // ============================================================================

  /**
   * Get all stages for a template (active only, ordered by orderIndex)
   */
  async getTemplateStages(templateId: string): Promise<TemplateStage[]> {
    return this.stageRepo.getTemplateStages(templateId);
  }

  /**
   * Get a single template stage by ID
   */
  async getTemplateStage(id: string): Promise<TemplateStage | undefined> {
    return this.stageRepo.getTemplateStage(id);
  }

  /**
   * Create a new template stage (upsert if same stageId exists)
   * Auto-activates the template on first stage creation
   */
  async createTemplateStage(input: InsertTemplateStage): Promise<TemplateStage> {
    return this.stageRepo.createTemplateStage(input);
  }

  /**
   * Update a template stage
   */
  async updateTemplateStage(id: string, data: Partial<TemplateStage>): Promise<TemplateStage | undefined> {
    return this.stageRepo.updateTemplateStage(id, data);
  }

  /**
   * Delete a template stage (soft delete - marks as inactive)
   */
  async deleteTemplateStage(id: string): Promise<void> {
    return this.stageRepo.deleteTemplateStage(id);
  }

  /**
   * Reorder template stages
   * @param templateId - The template containing the stages
   * @param stageIdsInOrder - Array of stage IDs in the desired order
   */
  async reorderTemplateStages(templateId: string, stageIdsInOrder: string[]): Promise<void> {
    return this.stageRepo.reorderTemplateStages(templateId, stageIdsInOrder);
  }

  /**
   * Reorder a template task (within stage or move to different stage)
   */
  async reorderTemplateTask(input: {
    taskId: string;
    targetStageId: string;
    targetTemplateStageId: string;
    newIndex: number;
    actorId?: string;
  }): Promise<TemplateTask | undefined> {
    const { taskId, targetStageId, targetTemplateStageId, newIndex, actorId } = input;
    
    // Get the task to check if it's moving stages
    const task = await this.taskRepo.getTemplateTask(taskId);
    if (!task) return undefined;

    const isMovingStages = task.templateStageId !== targetTemplateStageId;

    // Reorder tasks in the repository
    const updatedTask = await this.taskRepo.reorderTemplateTask({
      taskId,
      targetStageId,
      targetTemplateStageId,
      newIndex
    });

    if (updatedTask && actorId) {
      await writeAuditLog({
        actorId,
        resourceType: "template_task",
        resourceId: taskId,
        action: "update",
        eventType: "crud",
        details: {
          action: isMovingStages ? "moved_to_stage" : "reordered",
          targetStageId,
          newIndex
        }
      });
    }

    return updatedTask;
  }

  // ============================================================================
  // Template Readiness & Estimation
  // ============================================================================

  /**
   * Get template readiness information (stage and task counts)
   */
  async getTemplateReadiness(id: string): Promise<{
    active_stage_count: number;
    active_task_count: number;
    assigned_task_count: number;
  }> {
    return this.templateRepo.getTemplateReadiness(id);
  }

}

