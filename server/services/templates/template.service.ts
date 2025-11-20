/**
 * Template Service
 *
 * Business logic layer for template management
 * Handles template CRUD, cloning, and application to candidates
 */

import type { InsertTemplate, Template } from "@shared/schemas";
import type { TemplateRepository } from "../../repositories/templates/TemplateRepository";
import type { TemplateStageRepository } from "../../repositories/templates/TemplateStageRepository";
import type { TemplateTaskRepository } from "../../repositories/templates/TemplateTaskRepository";
import { eventBus, templateCreated, templateUpdated, templateCloned, templateApplied } from "../../events";

export interface CreateTemplateInput {
  data: InsertTemplate;
  cloneFromTemplateId?: string;
  actorId?: string;
}

export interface UpdateTemplateInput {
  id: string;
  data: Partial<Template>;
  actorId?: string;
}

export interface CloneTemplateInput {
  sourceTemplateId: string;
  newName: string;
  actorId?: string;
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
      actorId
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
    // TODO: Publish templateArchived event
  }

  /**
   * Check if a template is ready to be activated
   */
  async checkTemplateReadiness(id: string): Promise<{ ready: boolean; reason?: string }> {
    const readiness = await this.templateRepo.getTemplateReadiness(id);

    if (readiness.active_stage_count === 0) {
      return {
        ready: false,
        reason: 'Template must have at least one stage'
      };
    }

    // TODO: Add more readiness checks
    // - Each stage should have at least one task
    // - All required fields should be filled

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
}
