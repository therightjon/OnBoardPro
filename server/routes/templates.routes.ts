import { Router } from "express";
import { z } from "zod";
import { storage } from "../db/storage"; // Keep for estimateTemplate only
import { requireAuth, requireRole } from "../middleware/authorization";
import {
  insertTemplateSchema,
  insertTemplateStageSchema
} from "@shared/schemas";
import { logAuthorizationFailure } from "../utils/authorization.utils";
import { eventBus, templateCreated, templateUpdated, templateCloned } from "../events";
import { getTemplateService, getReferenceDataService } from "../services/service-factory";

const router = Router();

// Helper function for template access control
async function fetchTemplateWithAccess(req: any, res: any, templateId: string, action: string) {
  const templateService = getTemplateService();
  const template = await templateService.getTemplate(templateId);
  if (!template) {
    await logAuthorizationFailure({ req, resource: "template", resourceId: templateId, action, reason: "not_found" });
    res.status(404).json({ message: "Template not found" });
    return null;
  }
  return template;
}

// Templates routes
router.get("/templates", requireAuth, requireRole(["system_admin", "hr_staff"]), async (req, res, next) => {
  try {
    const templateService = getTemplateService();
    const templates = await templateService.getTemplates();
    res.json(templates);
  } catch (error) {
    next(error);
  }
});

router.get("/templates/:id", requireAuth, requireRole(["system_admin", "hr_staff"]), async (req, res, next) => {
  try {
    const templateService = getTemplateService();
    const template = await templateService.getTemplate(req.params.id);
    if (!template) {
      await logAuthorizationFailure({ req, resource: "template", resourceId: req.params.id, action: "template:read", reason: "not_found" });
      return res.status(404).json({ message: "Template not found" });
    }
    res.json(template);
  } catch (error) {
    next(error);
  }
});

router.post("/templates", requireAuth, requireRole(["system_admin", "hr_staff"]), async (req, res, next) => {
  try {
    const { cloneFromTemplateId, ...templateData } = req.body;
    const validatedData = insertTemplateSchema.parse(templateData);

    // Create template using service (handles event publishing)
    const templateService = getTemplateService();
    const template = await templateService.createTemplate({
      data: validatedData,
      cloneFromTemplateId,
      actorId: req.user?.id
    });

    res.status(201).json(template);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Invalid data", errors: error.errors });
    }
    next(error);
  }
});

router.patch("/templates/:id", requireAuth, requireRole(["system_admin", "hr_staff"]), async (req, res, next) => {
  try {
    // Update template using service (handles event publishing)
    const templateService = getTemplateService();
    const template = await templateService.updateTemplate({
      id: req.params.id,
      data: req.body,
      actorId: req.user?.id
    });

    if (!template) {
      await logAuthorizationFailure({ req, resource: "template", resourceId: req.params.id, action: "template:update", reason: "not_found" });
      return res.status(404).json({ message: "Template not found" });
    }

    res.json(template);
  } catch (error: any) {
    // Handle template activation constraint violation
    if (error.code === '23514' || error.message?.includes('Template cannot be activated')) {
      return res.status(400).json({
        message: "Each stage must contain at least one task before you can activate this template."
      });
    }
    next(error);
  }
});

router.delete("/templates/:id", requireAuth, requireRole(["system_admin", "hr_staff"]), async (req, res, next) => {
  try {
    const templateService = getTemplateService();
    const template = await templateService.getTemplate(req.params.id);
    if (!template) {
      await logAuthorizationFailure({ req, resource: "template", resourceId: req.params.id, action: "template:delete", reason: "not_found" });
      return res.status(404).json({ message: "Template not found" });
    }
    await templateService.archiveTemplate(req.params.id, req.user?.id);
    res.sendStatus(204);
  } catch (error) {
    next(error);
  }
});

// Template readiness endpoint
router.get("/templates/:id/readiness", requireAuth, requireRole(["system_admin", "hr_staff"]), async (req, res, next) => {
  try {
    const templateService = getTemplateService();
    const template = await templateService.getTemplate(req.params.id);
    if (!template) {
      await logAuthorizationFailure({ req, resource: "template", resourceId: req.params.id, action: "template:readiness", reason: "not_found" });
      return res.status(404).json({ message: "Template not found" });
    }

    // Use service to check readiness
    const readinessCheck = await templateService.checkTemplateReadiness(req.params.id);

    // Get detailed readiness info from service for backward compatibility
    const readinessDetails = await templateService.getTemplateReadiness(req.params.id);

    res.json({ ...readinessDetails, ...readinessCheck });
  } catch (error) {
    next(error);
  }
});

// Template status update endpoint
router.patch("/templates/:id/status", requireAuth, requireRole(["system_admin", "hr_staff"]), async (req, res, next) => {
  try {
    const { status } = req.body;
    if (!status || !["draft", "active", "archived"].includes(status)) {
      return res.status(400).json({ message: "Invalid status. Must be draft, active, or archived." });
    }

    const templateService = getTemplateService();
    let template;

    // Use service methods for activation/deactivation
    switch (status) {
      case "draft":
        template = await templateService.deactivateTemplate(req.params.id, req.user?.id);
        break;
      case "active":
        template = await templateService.activateTemplate(req.params.id, req.user?.id);
        break;
      case "archived":
        template = await templateService.updateTemplate({
          id: req.params.id,
          data: { archived: true, isActive: false },
          actorId: req.user?.id
        });
        break;
    }

    if (!template) {
      await logAuthorizationFailure({ req, resource: "template", resourceId: req.params.id, action: "template:status", reason: "not_found" });
      return res.status(404).json({ message: "Template not found" });
    }

    res.json(template);
  } catch (error: any) {
    // Handle template readiness constraint violation
    if (error.message?.includes('Template cannot be set to Active') || error.message?.includes('Template is not ready')) {
      return res.status(400).json({
        code: 'TEMPLATE_NOT_READY',
        message: error.message || 'At least one stage is required.'
      });
    }
    next(error);
  }
});

// Template estimation endpoint
router.get("/templates/:id/estimate", requireAuth, requireRole(["system_admin", "hr_staff"]), async (req, res, next) => {
  try {
    const template = await fetchTemplateWithAccess(req, res, req.params.id, "template:estimate");
    if (!template) return;
    const { looDate, startDate, candidateId, businessDays } = req.query;
    const estimate = await storage.estimateTemplate(req.params.id, {
      looDate: looDate as string | undefined,
      startDate: startDate as string | undefined,
      candidateId: candidateId as string | undefined,
      businessDays: businessDays === 'true',
    });
    res.json(estimate);
  } catch (error) {
    next(error);
  }
});

// Template Tasks routes
router.get("/templates/:id/template-tasks", requireAuth, requireRole(["system_admin", "hr_staff"]), async (req, res, next) => {
  try {
    const templateId = req.params.id;
    if (!templateId || templateId === "undefined") {
      return res.status(400).json({ message: "Invalid template ID" });
    }
    if (!(await fetchTemplateWithAccess(req, res, templateId, "template-tasks:list"))) return;
    const templateService = getTemplateService();
    const tasks = await templateService.getTemplateTasks(templateId);
    res.json(tasks);
  } catch (error) {
    next(error);
  }
});

router.post("/templates/:id/template-tasks", requireAuth, requireRole(["system_admin", "hr_staff"]), async (req, res, next) => {
  try {
    if (!(await fetchTemplateWithAccess(req, res, req.params.id, "template-tasks:create"))) return;

    if (!req.body.taskDefId) {
      return res.status(400).json({ message: "task_def_id is required" });
    }
    if (!req.body.stageId) {
      return res.status(400).json({ message: "stage_id is required" });
    }

    // Check if stage exists for this template
    const templateService = getTemplateService();
    const templateStages = await templateService.getTemplateStages(req.params.id);
    const templateStage = templateStages.find(ts => ts.stageId === req.body.stageId && ts.isActive);

    if (!templateStage) {
      return res.status(400).json({ message: "Add a stage to this template before adding tasks." });
    }

    const relativeStartRules = ['days_before_start', 'days_after_start'];
    const relativeLooRules = ['days_before_loo', 'days_after_loo'];
    const relativeStageRules = ['days_before_stage', 'days_after_stage'];
    const zeroValueRules = ['on_start_date', 'on_loo_date'];

    // Enforce database constraint rules for due_rule_type combinations
    let dueRuleValue = req.body.dueRuleValue ?? null;
    let fixedDate = req.body.fixedDate ?? null;

    if (zeroValueRules.includes(req.body.dueRuleType)) {
      // on_start_date/on_loo_date require both due_rule_value and fixed_date to be null
      dueRuleValue = null;
      fixedDate = null;
    } else if (req.body.dueRuleType === 'fixed_date') {
      // fixed_date requires due_rule_value to be null
      dueRuleValue = null;
    } else if ([...relativeStartRules, ...relativeLooRules, ...relativeStageRules].includes(req.body.dueRuleType)) {
      // relative types require fixed_date to be null
      fixedDate = null;
    }

    const defaultAssigneeKind = (req.body.defaultAssigneeKind as 'user' | 'role' | undefined) ?? 'user';
    const defaultAssigneeUserId = req.body.defaultAssigneeUserId ?? req.body.defaultAssigneeId ?? null;
    const defaultAssigneeRole = req.body.defaultAssigneeRole ?? null;

    if (!['user', 'role'].includes(defaultAssigneeKind)) {
      return res.status(400).json({ message: 'Invalid defaultAssigneeKind' });
    }

    if (defaultAssigneeKind === 'role' && defaultAssigneeRole !== 'candidate.self') {
      return res.status(400).json({ message: 'defaultAssigneeRole must be candidate.self when kind is role' });
    }

    const templateTask = await templateService.createTemplateTask({
      templateId: req.params.id,
      taskDefId: req.body.taskDefId,
      stageId: req.body.stageId,
      templateStageId: templateStage.id,
      dueRuleType: req.body.dueRuleType,
      dueRuleValue,
      fixedDate,
      defaultAssigneeKind,
      defaultAssigneeUserId: defaultAssigneeKind === 'user' ? defaultAssigneeUserId : null,
      defaultAssigneeRole: defaultAssigneeKind === 'role' ? defaultAssigneeRole : null,
      defaultPriorityId: req.body.defaultPriorityId || null,
      defaultCategoryId: req.body.defaultCategoryId || null,
      isRequired: req.body.isRequired === true
    });
    res.status(201).json(templateTask);
  } catch (error) {
    next(error);
  }
});

router.patch("/template-tasks/:id", requireAuth, requireRole(["system_admin", "hr_staff"]), async (req, res, next) => {
  try {
    // Clean the data to prevent database errors with empty strings
    const body = req.body ?? {};
    const defaultAssigneeKindPatch = (body.defaultAssigneeKind as 'user' | 'role' | undefined) ?? 'user';
    const defaultAssigneeUserIdPatch = body.defaultAssigneeUserId ?? body.defaultAssigneeId ?? null;
    const defaultAssigneeRolePatch = body.defaultAssigneeRole ?? null;

    if (!['user', 'role'].includes(defaultAssigneeKindPatch)) {
      return res.status(400).json({ message: 'Invalid defaultAssigneeKind' });
    }

    if (defaultAssigneeKindPatch === 'role' && defaultAssigneeRolePatch !== 'candidate.self') {
      return res.status(400).json({ message: 'defaultAssigneeRole must be candidate.self when kind is role' });
    }

    let cleanedData = {
      ...body,
      dueRuleValue: body.dueRuleValue === "" ? null : body.dueRuleValue,
      fixedDate: body.fixedDate === "" ? null : body.fixedDate,
      defaultAssigneeKind: defaultAssigneeKindPatch,
      defaultAssigneeUserId: defaultAssigneeKindPatch === 'user' ? (defaultAssigneeUserIdPatch === "" ? null : defaultAssigneeUserIdPatch) : null,
      defaultAssigneeRole: defaultAssigneeKindPatch === 'role' ? defaultAssigneeRolePatch : null,
      defaultPriorityId: body.defaultPriorityId === "" ? null : body.defaultPriorityId,
      defaultCategoryId: body.defaultCategoryId === "" ? null : body.defaultCategoryId,
      isRequired: body.isRequired === true,
    };

    // Enforce database constraint rules for due_rule_type combinations
    const relativeStartRules = ['days_before_start', 'days_after_start'];
    const relativeLooRules = ['days_before_loo', 'days_after_loo'];
    const relativeStageRules = ['days_before_stage', 'days_after_stage'];
    const zeroValueRules = ['on_start_date', 'on_loo_date'];

    if (zeroValueRules.includes(cleanedData.dueRuleType)) {
      cleanedData.dueRuleValue = null;
      cleanedData.fixedDate = null;
    } else if (cleanedData.dueRuleType === 'fixed_date') {
      cleanedData.dueRuleValue = null;
    } else if ([...relativeStartRules, ...relativeLooRules, ...relativeStageRules].includes(cleanedData.dueRuleType)) {
      cleanedData.fixedDate = null;
    }

    const templateService = getTemplateService();
    const task = await templateService.updateTemplateTask(req.params.id, cleanedData);
    if (!task) {
      await logAuthorizationFailure({ req, resource: "template", resourceId: null, action: "template-tasks:update", reason: "not_found" });
      return res.status(404).json({ message: "Template task not found" });
    }
    res.json(task);
  } catch (error) {
    next(error);
  }
});

router.delete("/template-tasks/:id", requireAuth, requireRole(["system_admin", "hr_staff"]), async (req, res, next) => {
  try {
    const templateService = getTemplateService();
    // Get template task details before deletion to check if it was the last in its stage
    const taskToDelete = await templateService.getTemplateTask(req.params.id);
    if (!taskToDelete) {
      await logAuthorizationFailure({ req, resource: "template", resourceId: null, action: "template-tasks:delete", reason: "not_found" });
      return res.status(404).json({ message: "Template task not found" });
    }

    // Check if this is the last task in its stage
    const allTasks = await templateService.getTemplateTasks(taskToDelete.templateId);
    const tasksInStage = allTasks.filter(t => t.stageId === taskToDelete.stageId);
    const isLastTaskInStage = tasksInStage.length === 1;

    let removedStage = null;
    if (isLastTaskInStage) {
      // Get stage info before it gets deleted by the trigger
      const templateStages = await templateService.getTemplateStages(taskToDelete.templateId);
      const stageToRemove = templateStages.find(s => s.stageId === taskToDelete.stageId);
      if (stageToRemove) {
        removedStage = { stageId: stageToRemove.stageId };
      }
    }

    // Delete the task (trigger will auto-remove stage if it was the last task)
    await templateService.archiveTemplateTask(req.params.id);

    // Return result with optional removed stage info
    const result = {
      deletedTaskId: req.params.id,
      ...(removedStage && { removedStage })
    };

    res.json(result);
  } catch (error) {
    next(error);
  }
});

// Template Stages routes
router.get("/templates/:id/template-stages", requireAuth, requireRole(["system_admin", "hr_staff"]), async (req, res, next) => {
  try {
    const templateId = req.params.id;
    if (!templateId || templateId === "undefined") {
      return res.status(400).json({ message: "Invalid template ID" });
    }
    if (!(await fetchTemplateWithAccess(req, res, templateId, "template-stages:list"))) return;
    const templateService = getTemplateService();
    const stages = await templateService.getTemplateStages(templateId);
    res.json(stages);
  } catch (error) {
    next(error);
  }
});

router.post("/templates/:id/template-stages", requireAuth, requireRole(["system_admin", "hr_staff"]), async (req, res, next) => {
  try {
    if (!(await fetchTemplateWithAccess(req, res, req.params.id, "template-stages:create"))) return;
    if (!req.body.stageId) {
      return res.status(400).json({ message: "stage_id is required" });
    }

    const phaseInput = req.body.phase;
    const phase = phaseInput === 'onboarding' ? 'onboarding'
      : phaseInput === 'pre_hire' ? 'pre_hire'
      : 'pre_hire';

    const templateService = getTemplateService();
    const templateStage = await templateService.createTemplateStage({
      templateId: req.params.id,
      stageId: req.body.stageId,
      orderIndex: req.body.orderIndex || 0,
      isActive: true,
      phase
    });
    res.status(201).json(templateStage);
  } catch (error) {
    next(error);
  }
});

router.patch("/template-stages/:id", requireAuth, requireRole(["system_admin", "hr_staff"]), async (req, res, next) => {
  try {
    const templateService = getTemplateService();
    const stage = await templateService.updateTemplateStage(req.params.id, req.body);
    if (!stage) {
      await logAuthorizationFailure({ req, resource: "template", resourceId: null, action: "template-stages:update", reason: "not_found" });
      return res.status(404).json({ message: "Template stage not found" });
    }
    res.json(stage);
  } catch (error) {
    next(error);
  }
});

router.delete("/template-stages/:id", requireAuth, requireRole(["system_admin", "hr_staff"]), async (req, res, next) => {
  try {
    const templateService = getTemplateService();
    const stage = await templateService.getTemplateStage(req.params.id);
    if (!stage) {
      await logAuthorizationFailure({ req, resource: "template", resourceId: null, action: "template-stages:delete", reason: "not_found" });
      return res.status(404).json({ message: "Template stage not found" });
    }
    await templateService.deleteTemplateStage(req.params.id);
    res.sendStatus(204);
  } catch (error) {
    next(error);
  }
});

// Template stages reordering endpoint
router.patch("/templates/:id/stages/reorder", requireAuth, requireRole(["system_admin", "hr_staff"]), async (req, res, next) => {
  try {
    const templateId = req.params.id;
    const { stageIdsInOrder } = req.body;

    if (!Array.isArray(stageIdsInOrder)) {
      return res.status(400).json({ message: "stageIdsInOrder must be an array" });
    }

    if (!(await fetchTemplateWithAccess(req, res, templateId, "template-stages:reorder"))) return;
    const templateService = getTemplateService();
    await templateService.reorderTemplateStages(templateId, stageIdsInOrder);
    res.json({ ok: true });
  } catch (error: any) {
    if (error.message?.includes("stage count mismatch") || error.message?.includes("Invalid stage")) {
      return res.status(400).json({ message: error.message });
    }
    next(error);
  }
});

// Atomic endpoint: create stage with tasks
router.post("/templates/:id/stages/create-with-task", requireAuth, requireRole(["system_admin", "hr_staff"]), async (req, res, next) => {
  try {
    const templateId = req.params.id;
    const { stageId, taskDefIds, priorityId, categoryId, assigneeId, dueRuleType, dueRuleValue, phase } = req.body;

    // Validate required fields
    if (!stageId) {
      return res.status(400).json({ message: "stageId is required" });
    }
    if (!Array.isArray(taskDefIds) || taskDefIds.length === 0) {
      return res.status(400).json({ message: "At least one task must be provided" });
    }

    // Validate that the stage exists and is active
    const referenceDataService = getReferenceDataService();
    const hiringStages = await referenceDataService.getHiringStages();
    const validStage = hiringStages.find(hs => hs.id === stageId && hs.isActive);
    if (!validStage) {
      return res.status(400).json({ message: "Invalid or inactive stage" });
    }

    // Get existing template stages to compute next order index
    const templateService = getTemplateService();
    const templateStages = await templateService.getTemplateStages(templateId);
    const maxOrderIndex = Math.max(0, ...templateStages.map(ts => ts.orderIndex || 0));

    // Create the template stage (will upsert if exists)
    const stagePhase = phase === 'onboarding' ? 'onboarding'
      : phase === 'pre_hire' ? 'pre_hire'
      : 'pre_hire';

    const templateStage = await templateService.createTemplateStage({
      templateId,
      stageId,
      orderIndex: maxOrderIndex + 1,
      isActive: true,
      phase: stagePhase
    });

    // Create all template tasks for this stage
    const createdTasks = [];
    const defaultAssigneeKind = (req.body.defaultAssigneeKind as 'user' | 'role' | undefined) ?? 'user';
    const defaultAssigneeUserId = req.body.defaultAssigneeUserId ?? assigneeId ?? null;
    const defaultAssigneeRole = req.body.defaultAssigneeRole ?? null;

    if (!['user', 'role'].includes(defaultAssigneeKind)) {
      return res.status(400).json({ message: 'Invalid defaultAssigneeKind' });
    }

    if (defaultAssigneeKind === 'role' && defaultAssigneeRole !== 'candidate.self') {
      return res.status(400).json({ message: 'defaultAssigneeRole must be candidate.self when kind is role' });
    }
    const relativeStartRules = ['days_before_start', 'days_after_start'];
    const relativeLooRules = ['days_before_loo', 'days_after_loo'];
    const relativeStageRules = ['days_before_stage', 'days_after_stage'];
    const zeroValueRules = ['on_start_date', 'on_loo_date'];

    for (const taskDefId of taskDefIds) {
      // Clean and validate due rule data like the existing endpoint
      let cleanDueRuleValue = dueRuleValue || null;
      let fixedDate = null;

      if (zeroValueRules.includes(dueRuleType)) {
        cleanDueRuleValue = null;
        fixedDate = null;
      } else if (dueRuleType === 'fixed_date') {
        cleanDueRuleValue = null;
        fixedDate = dueRuleValue; // For fixed_date, dueRuleValue contains the date
      } else if ([...relativeStartRules, ...relativeLooRules, ...relativeStageRules].includes(dueRuleType)) {
        fixedDate = null;
      }

      const templateTask = await templateService.createTemplateTask({
        templateId,
        taskDefId,
        stageId,
        templateStageId: templateStage.id,
        dueRuleType: dueRuleType || 'on_start_date',
        dueRuleValue: cleanDueRuleValue,
        fixedDate,
        defaultAssigneeKind,
        defaultAssigneeUserId: defaultAssigneeKind === 'user' ? defaultAssigneeUserId : null,
        defaultAssigneeRole: defaultAssigneeKind === 'role' ? defaultAssigneeRole : null,
        defaultPriorityId: priorityId || null,
        defaultCategoryId: categoryId || null
      });

      createdTasks.push(templateTask);
    }

    res.status(201).json({
      stage: {
        stageId: templateStage.stageId,
        orderIndex: templateStage.orderIndex,
        name: validStage.name
      },
      tasks: createdTasks
    });

  } catch (error) {
    next(error);
  }
});

export default router;
