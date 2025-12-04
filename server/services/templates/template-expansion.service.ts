/**
 * Template Expansion Service
 *
 * Handles the complex process of applying a template to a candidate, which involves:
 * 1. Validating template exists and is ready for application
 * 2. Validating candidate exists and has no existing template
 * 3. Retrieving all template stages and tasks
 * 4. Resolving anchor dates (LOO, start date) from candidate
 * 5. Creating candidate tasks from template tasks with due date calculations
 * 6. Creating candidate template stage snapshots
 * 7. Updating candidate with template information
 * 8. Recording initial stage history
 *
 * This service encapsulates the ~210 lines of complex logic that was originally
 * in the Storage class expandTemplate method.
 */

import { eq, sql } from "drizzle-orm";
import {
  candidateTasks,
  candidateStageHistory,
  taskPriorities,
  type InsertCandidateTask,
  type TemplateStage,
} from "@shared/schemas";
import type { db as DbType } from "../../db/connection";
import type { Pool } from "pg";
import {
  type AnchorDates,
  resolveLooAnchor,
  resolveStartAnchor,
  computeDueFromRule,
} from "../../utils/date.utils";
import type {
  TemplateExpansionResult,
  TemplateExpansionTask,
} from "../../repositories/base/types";

// Repository imports
import { TemplateRepository } from "../../repositories/templates/TemplateRepository";
import { TemplateStageRepository } from "../../repositories/templates/TemplateStageRepository";
import { TemplateTaskRepository } from "../../repositories/templates/TemplateTaskRepository";
import { CandidateRepository } from "../../repositories/candidates/CandidateRepository";
import { CandidateTaskRepository } from "../../repositories/candidates/CandidateTaskRepository";
import { TaskDefinitionRepository } from "../../repositories/reference/TaskDefinitionRepository";
import { ReferenceDataRepository } from "../../repositories/reference/ReferenceDataRepository";

/**
 * Service for expanding templates into candidate tasks
 *
 * This service is responsible for the complex process of applying a template
 * to a candidate, creating all necessary tasks, stage snapshots, and history records.
 */
export class TemplateExpansionService {
  private readonly db: typeof DbType;
  private readonly pool: Pool;
  private readonly templateRepo: TemplateRepository;
  private readonly templateStageRepo: TemplateStageRepository;
  private readonly templateTaskRepo: TemplateTaskRepository;
  private readonly candidateRepo: CandidateRepository;
  private readonly candidateTaskRepo: CandidateTaskRepository;
  private readonly taskDefinitionRepo: TaskDefinitionRepository;
  private readonly referenceDataRepo: ReferenceDataRepository;

  /**
   * Creates a new TemplateExpansionService
   *
   * @param db - Drizzle database instance
   * @param pool - PostgreSQL connection pool
   * @param templateRepo - Template repository instance
   * @param templateStageRepo - Template stage repository instance
   * @param templateTaskRepo - Template task repository instance
   * @param candidateRepo - Candidate repository instance
   * @param candidateTaskRepo - Candidate task repository instance
   * @param taskDefinitionRepo - Task definition repository instance
   * @param referenceDataRepo - Reference data repository instance
   */
  constructor(
    db: typeof DbType,
    pool: Pool,
    templateRepo: TemplateRepository,
    templateStageRepo: TemplateStageRepository,
    templateTaskRepo: TemplateTaskRepository,
    candidateRepo: CandidateRepository,
    candidateTaskRepo: CandidateTaskRepository,
    taskDefinitionRepo: TaskDefinitionRepository,
    referenceDataRepo: ReferenceDataRepository
  ) {
    this.db = db;
    this.pool = pool;
    this.templateRepo = templateRepo;
    this.templateStageRepo = templateStageRepo;
    this.templateTaskRepo = templateTaskRepo;
    this.candidateRepo = candidateRepo;
    this.candidateTaskRepo = candidateTaskRepo;
    this.taskDefinitionRepo = taskDefinitionRepo;
    this.referenceDataRepo = referenceDataRepo;
  }

  /**
   * Expand a template into candidate tasks
   *
   * This is the main method that orchestrates the entire template expansion process.
   * It performs the following steps in order:
   *
   * 1. **Validation Phase**
   *    - Validates candidate exists and doesn't have a template already applied
   *    - Validates candidate has no existing tasks
   *    - Validates template exists and is active
   *    - Validates template has at least one task defined
   *
   * 2. **Data Retrieval Phase**
   *    - Retrieves all template stages and creates a lookup map
   *    - Retrieves all template tasks
   *    - Retrieves task definitions for all template tasks
   *    - Retrieves task categories for fallback category assignment
   *
   * 3. **Anchor Resolution Phase**
   *    - Resolves LOO (Letter of Offer) anchor date from candidate
   *    - Resolves start date anchor from candidate
   *    - These anchors are used for relative due date calculations
   *
   * 4. **Task Creation Phase**
   *    - For each template task:
   *      - Computes due date based on rule type and anchors
   *      - Resolves task priority from priority ID
   *      - Handles special assignee resolution (e.g., candidate.self)
   *      - Creates InsertCandidateTask payload
   *    - Bulk inserts all candidate tasks
   *
   * 5. **Stage Snapshot Phase**
   *    - Creates candidate_template_stages records (snapshot of template stages)
   *    - Updates candidate_tasks with stage_order_index for efficient sorting
   *
   * 6. **Candidate Update Phase**
   *    - Updates candidate record with template metadata
   *    - Sets templateLocked flag to prevent template changes
   *    - Sets initial stage to first template stage
   *
   * 7. **History Recording Phase**
   *    - Records initial stage transition in candidate_stage_history
   *
   * @param templateId - ID of the template to expand
   * @param candidateId - ID of the candidate to apply template to
   * @param currentUserId - ID of the user performing the expansion
   * @returns Result containing count of created tasks and task details
   * @throws Error if candidate not found
   * @throws Error if candidate already has a template applied
   * @throws Error if candidate already has tasks
   * @throws Error if template not found
   * @throws Error if template is not active
   * @throws Error if template has no tasks defined
   * @throws Error if no default task category is configured
   * @throws Error if template stage is missing for a task
   */
  async expandTemplate(
    templateId: string,
    candidateId: string,
    currentUserId: string
  ): Promise<TemplateExpansionResult> {
    // ========================================================================
    // VALIDATION PHASE
    // ========================================================================

    // Get the candidate
    const candidate = await this.candidateRepo.getCandidate(candidateId);
    if (!candidate) {
      throw new Error("Candidate not found");
    }

    // Check if template was already applied (not just locked for selection)
    // templateLocked means selection is locked, templateAppliedAt means tasks were generated
    if (candidate.templateAppliedAt) {
      throw new Error("Candidate already has a template applied");
    }

    // Check if candidate has existing tasks
    const existingTasks = await this.candidateTaskRepo.getCandidateTasks({ candidateId });
    if (existingTasks.length > 0) {
      throw new Error("Candidate already has tasks. Cannot apply template.");
    }

    // Get the template
    const template = await this.templateRepo.getTemplate(templateId);
    if (!template) {
      throw new Error("Template not found");
    }
    if (!template.isActive) {
      throw new Error("Template is not active");
    }

    // ========================================================================
    // DATA RETRIEVAL PHASE
    // ========================================================================

    const templateStagesList = await this.templateStageRepo.getTemplateStages(templateId);
    const templateStageMap = new Map<string, TemplateStage>();
    for (const stage of templateStagesList) {
      templateStageMap.set(stage.id, stage);
    }

    // Get template tasks
    const templateTasksList = await this.templateTaskRepo.getTemplateTasks(templateId);
    if (templateTasksList.length === 0) {
      throw new Error("Template has no tasks defined");
    }

    // Get task definitions for all template tasks
    const taskDefs = await Promise.all(
      templateTasksList.map((tt) => this.taskDefinitionRepo.getTaskDefinition(tt.taskDefId))
    );

    // ========================================================================
    // ANCHOR RESOLUTION PHASE
    // ========================================================================

    const anchors: AnchorDates = {
      loo: resolveLooAnchor(candidate),
      start: resolveStartAnchor(candidate),
    };

    // ========================================================================
    // TASK CREATION PHASE
    // ========================================================================

    // Calculate due dates and create candidate tasks
    const tasksToCreate: InsertCandidateTask[] = [];
    const taskCategoriesList = await this.referenceDataRepo.getTaskCategories();
    const fallbackCategoryId = taskCategoriesList[0]?.id ?? null;

    if (!fallbackCategoryId && templateTasksList.some((task) => !task.defaultCategoryId)) {
      throw new Error("No default task category configured");
    }

    for (let i = 0; i < templateTasksList.length; i++) {
      const templateTask = templateTasksList[i];
      const taskDef = taskDefs[i];
      const templateStage = templateStageMap.get(templateTask.templateStageId ?? "");
      if (!templateStage) {
        throw new Error(`Template stage missing for task ${templateTask.id}`);
      }

      if (!taskDef) continue;

      const dueComputation = computeDueFromRule(
        templateTask.dueRuleType,
        templateTask.dueRuleValue,
        templateTask.fixedDate,
        anchors
      );

      // Get default priority name
      let priority = "medium";
      if (templateTask.defaultPriorityId) {
        const priorityRecord = await this.db
          .select()
          .from(taskPriorities)
          .where(eq(taskPriorities.id, templateTask.defaultPriorityId));
        if (priorityRecord[0]) {
          priority = priorityRecord[0].name;
        }
      }

      let defaultAssigneeKind = templateTask.defaultAssigneeKind ?? "user";
      let defaultAssigneeUserId =
        defaultAssigneeKind === "user" ? templateTask.defaultAssigneeUserId ?? null : null;
      let defaultAssigneeRole =
        defaultAssigneeKind === "role" ? templateTask.defaultAssigneeRole ?? null : null;

      // Special role resolution: candidate.self resolves to linked user at apply time
      // If the template assigns to candidate.self and the candidate already has a linked user,
      // resolve immediately to that user and mark as resolved.
      let resolvedAt: Date | null = null;
      if (defaultAssigneeKind === "role" && defaultAssigneeRole === "candidate.self") {
        if (candidate.linkedUserId) {
          defaultAssigneeUserId = candidate.linkedUserId;
          defaultAssigneeRole = null;
          defaultAssigneeKind = "user";
          resolvedAt = new Date();
        }
      } else if (defaultAssigneeKind === "user" && defaultAssigneeUserId) {
        resolvedAt = new Date();
      }

      tasksToCreate.push({
        candidateId,
        taskDefId: templateTask.taskDefId,
        title: taskDef.name,
        description: taskDef.description,
        stageId: templateTask.stageId,
        templateStageId: templateTask.templateStageId,
        phaseSnapshot: templateStage.phase ?? null,
        assigneeKind: defaultAssigneeKind,
        assigneeUserId: defaultAssigneeUserId,
        assigneeRole: defaultAssigneeRole,
        assigneeResolvedAt: resolvedAt,
        priority: priority as "low" | "medium" | "high" | "critical",
        categoryId: templateTask.defaultCategoryId || fallbackCategoryId,
        dueAt: dueComputation.dueAt,
        dueRuleType: templateTask.dueRuleType,
        dueRuleValue: templateTask.dueRuleValue ?? null,
        fixedDate: templateTask.fixedDate ?? null,
        pendingAnchor: dueComputation.pendingAnchor,
        status: "todo" as const,
        required: (templateTask as any).isRequired ?? true,
        archived: false,
        dueSoonNotifiedAt: null,
      });
    }

    // Create all tasks first
    let createdTasks: TemplateExpansionTask[] = [];
    if (tasksToCreate.length > 0) {
      createdTasks = await this.db
        .insert(candidateTasks)
        .values(tasksToCreate)
        .returning({
          id: candidateTasks.id,
          candidateId: candidateTasks.candidateId,
          assigneeUserId: candidateTasks.assigneeUserId,
          assigneeKind: candidateTasks.assigneeKind,
          assigneeRole: candidateTasks.assigneeRole,
          title: candidateTasks.title,
          status: candidateTasks.status,
          dueAt: candidateTasks.dueAt,
          pendingAnchor: candidateTasks.pendingAnchor,
        });
    }

    // ========================================================================
    // STAGE SNAPSHOT PHASE
    // ========================================================================

    // Snapshot the template's stage sequence using SQL for efficiency
    await this.db.execute(sql`
      WITH ts AS (
        SELECT ts.stage_id, hs.name AS stage_name, ts.order_index
        FROM template_stages ts
        JOIN hiring_stages hs ON hs.id = ts.stage_id
        WHERE ts.template_id = ${templateId} AND ts.is_active = TRUE
        ORDER BY ts.order_index
      )
      INSERT INTO candidate_template_stages (candidate_id, stage_id, stage_name_snapshot, order_index)
      SELECT ${candidateId}, stage_id, stage_name, order_index FROM ts
      ON CONFLICT (candidate_id, stage_id) DO UPDATE
      SET stage_name_snapshot = EXCLUDED.stage_name_snapshot,
          order_index         = EXCLUDED.order_index,
          updated_at          = now()
    `);

    // Update candidate_tasks with stage_order_index for fast sorting
    await this.db.execute(sql`
      UPDATE candidate_tasks ct
      SET stage_order_index = s.order_index
      FROM candidate_template_stages s
      WHERE s.candidate_id = ct.candidate_id AND s.stage_id = ct.stage_id AND ct.candidate_id = ${candidateId}
    `);

    // ========================================================================
    // CANDIDATE UPDATE PHASE
    // ========================================================================

    // Get template stages to set initial stage
    const initialStage = templateStagesList.length > 0 ? templateStagesList[0] : null;

    // Update candidate to mark template as applied and set initial stage
    await this.candidateRepo.updateCandidate(candidateId, {
      templateAppliedFromId: templateId,
      templateAppliedAt: new Date(),
      templateLocked: true,
      currentStageId: initialStage?.stageId || null,
      templateNameSnapshot: template.name, // Snapshot template name at expansion
      templateVersion: 1, // Version 1 for initial template application
    });

    // ========================================================================
    // HISTORY RECORDING PHASE
    // ========================================================================

    // Record initial stage history if we have an initial stage
    if (initialStage) {
      await this.db.insert(candidateStageHistory).values({
        candidateId: candidateId,
        fromStageId: null,
        toStageId: initialStage.stageId,
        changedAt: new Date(),
        changedBy: currentUserId,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }

    return { createdCount: tasksToCreate.length, createdTasks };
  }
}
