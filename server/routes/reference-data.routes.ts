import { Router } from "express";
import { getReferenceDataService } from "../services/service-factory";
import { requireAuth, requireRole } from "../middleware/authorization";
import { validateBody } from "../middleware/validation";
import {
  insertHiringStageSchema,
  insertTaskDefinitionSchema
} from "@shared/schemas";

const router = Router();

// Task Definitions routes
router.get("/task-definitions", requireAuth, requireRole(["system_admin", "hr_staff"]), async (req, res, next) => {
  try {
    const referenceDataService = getReferenceDataService();
    const taskDefs = await referenceDataService.getTaskDefinitions();
    res.json(taskDefs);
  } catch (error) {
    next(error);
  }
});

router.post("/task-definitions", requireAuth, requireRole(["system_admin", "hr_staff"]), validateBody(insertTaskDefinitionSchema), async (req, res, next) => {
  try {
    const validatedData = req.validatedBody as typeof insertTaskDefinitionSchema._type;
    const referenceDataService = getReferenceDataService();
    const taskDef = await referenceDataService.createTaskDefinition({
      name: validatedData.name,
      description: validatedData.description,
      createdBy: req.user?.id
    });
    res.status(201).json(taskDef);
  } catch (error) {
    next(error);
  }
});

router.patch("/task-definitions/:id", requireAuth, requireRole(["system_admin", "hr_staff"]), async (req, res, next) => {
  try {
    const referenceDataService = getReferenceDataService();
    const taskDef = await referenceDataService.updateTaskDefinition({
      id: req.params.id,
      ...req.body
    });
    if (!taskDef) {
      return res.status(404).json({ message: "Task definition not found" });
    }
    res.json(taskDef);
  } catch (error) {
    next(error);
  }
});

// Hiring Stages routes
router.get("/hiring-stages", requireAuth, async (req, res, next) => {
  try {
    const referenceDataService = getReferenceDataService();
    const stages = await referenceDataService.getHiringStages();
    res.json(stages);
  } catch (error) {
    next(error);
  }
});

router.post("/hiring-stages", requireAuth, requireRole(["system_admin", "hr_staff"]), validateBody(insertHiringStageSchema), async (req, res, next) => {
  try {
    const validatedData = req.validatedBody as typeof insertHiringStageSchema._type;
    const referenceDataService = getReferenceDataService();
    const stage = await referenceDataService.createHiringStage({
      name: validatedData.name,
      description: validatedData.description,
      orderIndex: validatedData.orderIndex,
      isActive: validatedData.isActive
    });
    res.status(201).json(stage);
  } catch (error) {
    next(error);
  }
});

router.patch("/hiring-stages/:id", requireAuth, requireRole(["system_admin", "hr_staff"]), async (req, res, next) => {
  try {
    const referenceDataService = getReferenceDataService();
    const stage = await referenceDataService.updateHiringStage({
      id: req.params.id,
      ...req.body
    });
    if (!stage) {
      return res.status(404).json({ message: "Hiring stage not found" });
    }
    res.json(stage);
  } catch (error) {
    next(error);
  }
});

router.delete("/hiring-stages/:id", requireAuth, requireRole(["system_admin", "hr_staff"]), async (req, res, next) => {
  try {
    const referenceDataService = getReferenceDataService();
    await referenceDataService.deleteHiringStage(req.params.id);
    res.sendStatus(204);
  } catch (error) {
    next(error);
  }
});

// Task Categories route
router.get("/task-categories", requireAuth, async (req, res, next) => {
  try {
    const referenceDataService = getReferenceDataService();
    const categories = await referenceDataService.getTaskCategories();
    res.json(categories);
  } catch (error) {
    next(error);
  }
});

// Task Priorities route
router.get("/task-priorities", requireAuth, async (req, res, next) => {
  try {
    const referenceDataService = getReferenceDataService();
    const priorities = await referenceDataService.getTaskPriorities();
    res.json(priorities);
  } catch (error) {
    next(error);
  }
});

// Candidate Types route
router.get("/candidate-types", requireAuth, async (req, res, next) => {
  try {
    const referenceDataService = getReferenceDataService();
    const types = await referenceDataService.getCandidateTypes();
    res.json(types);
  } catch (error) {
    next(error);
  }
});

// Faculty Ranks route
router.get("/faculty-ranks", requireAuth, requireRole(["system_admin", "hr_staff", "department_admin"]), async (req, res, next) => {
  try {
    const referenceDataService = getReferenceDataService();
    const ranks = await referenceDataService.getFacultyRanks();
    res.json(ranks);
  } catch (error) {
    next(error);
  }
});

export default router;
