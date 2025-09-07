import type { Express } from "express";
import { createServer, type Server } from "http";
import { setupAuth } from "./features/auth/services/auth.service";
import { storage } from "./db/storage";
import { 
  insertCandidateSchema,
  insertCandidateTaskSchema,
  insertTemplateSchema,
  insertTemplateStageSchema,
  insertTaskDefinitionSchema,
  insertDepartmentSchema,
  insertDivisionSchema,
  insertHiringStageSchema,
  insertUserPreferencesSchema
} from "@shared/schemas";
import { z } from "zod";
import { advanceStageIfComplete } from "./features/tasks/services/advance-stage.service";

function requireAuth(req: any, res: any, next: any) {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ message: "Authentication required" });
  }
  next();
}

function requireRole(roles: string[]) {
  return (req: any, res: any, next: any) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ message: "Insufficient permissions" });
    }
    next();
  };
}

export async function registerRoutes(app: Express): Promise<Server> {
  await setupAuth(app);

  // Divisions routes (single handler; supports departmentId search and includeArchived)
  app.get("/api/divisions", requireAuth, requireRole(["system_admin", "hr_staff", "department_admin", "division_leader", "manager"]), async (req, res, next) => {
    try {
      const { departmentId, q, limit = 20, offset = 0 } = req.query;
      const includeArchived = req.query.includeArchived === 'true';
      
      // If departmentId is provided, use the specific method with search/pagination
      if (departmentId) {
        const divisions = await storage.getDivisionsByDepartment(
          departmentId as string, 
          q as string, 
          parseInt(limit as string), 
          parseInt(offset as string)
        );
        res.json(divisions);
      } else {
        // If no departmentId, fetch all divisions (for settings page) honoring includeArchived
        const divisions = await storage.getDivisions(undefined, includeArchived);
        res.json(divisions);
      }
    } catch (error) {
      next(error);
    }
  });

  // User preferences routes
  app.get("/api/me/preferences", requireAuth, async (req, res, next) => {
    try {
      const userId = req.user!.id;
      const preferences = await storage.getUserPreferences(userId);
      
      // If no preferences exist, return defaults
      if (!preferences) {
        return res.json({
          mytasksShowArchived: false,
          mytasksShowCanceled: false,
          mytasksShowCompleted: false
        });
      }
      
      res.json({
        mytasksShowArchived: preferences.mytasksShowArchived,
        mytasksShowCanceled: preferences.mytasksShowCanceled,
        mytasksShowCompleted: preferences.mytasksShowCompleted
      });
    } catch (error) {
      next(error);
    }
  });

  app.patch("/api/me/preferences", requireAuth, async (req, res, next) => {
    try {
      const userId = req.user!.id;
      const updateSchema = insertUserPreferencesSchema.partial().extend({
        userId: z.string().optional()
      });
      
      const validatedData = updateSchema.parse(req.body);
      
      // Merge with userId
      const preferencesToUpdate = {
        userId,
        ...validatedData
      };
      
      const updatedPreferences = await storage.upsertUserPreferences(preferencesToUpdate);
      
      res.json({
        mytasksShowArchived: updatedPreferences.mytasksShowArchived,
        mytasksShowCanceled: updatedPreferences.mytasksShowCanceled,
        mytasksShowCompleted: updatedPreferences.mytasksShowCompleted
      });
    } catch (error) {
      next(error);
    }
  });

  // Managers routes
  app.get("/api/users/managers", requireAuth, requireRole(["system_admin", "hr_staff", "department_admin", "division_leader", "manager"]), async (req, res, next) => {
    try {
      const { departmentId, divisionId, q, limit = 20, offset = 0 } = req.query;
      
      if (!departmentId) {
        return res.status(400).json({ message: "departmentId is required" });
      }
      
      const managers = await storage.getManagersByDepartment(
        departmentId as string,
        divisionId as string,
        q as string,
        parseInt(limit as string),
        parseInt(offset as string)
      );
      res.json(managers);
    } catch (error) {
      next(error);
    }
  });

  // Candidates routes
  app.get("/api/candidates", requireAuth, async (req, res, next) => {
    try {
      const { includeArchived } = req.query;
      const filters = { 
        includeArchived: includeArchived === 'true' 
      };
      const candidates = await storage.getCandidates(filters);
      res.json(candidates);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/candidates/:id", requireAuth, async (req, res, next) => {
    try {
      const candidate = await storage.getCandidate(req.params.id);
      if (!candidate) {
        return res.status(404).json({ message: "Candidate not found" });
      }
      res.json(candidate);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/candidates/:id/tasks", requireAuth, async (req, res, next) => {
    try {
      const { id } = req.params;
      const tasks = await storage.getCandidateTasks({ candidateId: id });
      res.json(tasks);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/candidates/:id/stages", requireAuth, async (req, res, next) => {
    try {
      const { id } = req.params;
      const stages = await storage.getCandidateTemplateStages(id);
      
      // Return empty array if no snapshots found instead of throwing
      if (!stages || stages.length === 0) {
        console.warn(`No stage snapshots found for candidate ${id}`);
        return res.json([]);
      }
      
      res.json(stages);
    } catch (error) {
      console.error(`Error fetching candidate stages for ${req.params.id}:`, error);
      // Return empty array instead of crashing
      res.json([]);
    }
  });

  app.get("/api/candidates/:id/stage-history", requireAuth, async (req, res, next) => {
    try {
      const { id } = req.params;
      const history = await storage.getCandidateStageHistory(id);
      res.json({ history });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/candidates", requireAuth, requireRole(["system_admin", "hr_staff", "department_admin", "division_leader", "manager"]), async (req, res, next) => {
    try {
      const user = req.user!;
      
      // Role-based validation
      if (user.role === "department_admin" && req.body.departmentId !== user.departmentId) {
        return res.status(403).json({ message: "Department admin can only create candidates in their own department" });
      }
      
      if (user.role === "division_leader") {
        if (req.body.divisionId !== user.divisionId) {
          return res.status(403).json({ message: "Division leader can only create candidates in their own division" });
        }
      }
      
      if (user.role === "manager" && req.body.departmentId !== user.departmentId) {
        return res.status(403).json({ message: "Manager can only create candidates in their own department" });
      }

      // Check for duplicate email in the same department
      const existingCandidates = await storage.getCandidates();
      const duplicateEmail = existingCandidates.find(
        (c: any) => c.email.toLowerCase() === req.body.email.toLowerCase() && 
                    c.departmentId === req.body.departmentId
      );
      
      if (duplicateEmail) {
        return res.status(400).json({ message: "Email already exists in this department" });
      }

      // Faculty rank validation for faculty candidate types
      const candidateTypes = await storage.getCandidateTypes();
      const candidateType = candidateTypes.find(type => type.id === req.body.candidateTypeId);
      
      if (candidateType && (candidateType.name === 'Faculty' || candidateType.name === 'Faculty Clinical')) {
        if (!req.body.facultyRankId) {
          return res.status(400).json({ message: "Faculty Rank is required for Faculty and Faculty Clinical candidate types" });
        }
      }

      const validatedData = insertCandidateSchema.parse(req.body);
      const candidateData = {
        ...validatedData,
        status: "active" as const
      };
      
      const candidate = await storage.createCandidate(candidateData);
      res.status(201).json(candidate);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      next(error);
    }
  });

  app.patch("/api/candidates/:id", requireAuth, requireRole(["system_admin", "hr_staff"]), async (req, res, next) => {
    try {
      // Define allowed editable fields
      const allowedFields = ['salutation', 'firstName', 'lastName', 'email', 'departmentId', 'divisionId', 'managerId', 'facultyRankId', 'status'];
      const immutableFields = ['templateAppliedFromId', 'candidateTypeId', 'startDate'];
      
      // Check for attempts to change immutable fields
      for (const field of immutableFields) {
        if (req.body[field] !== undefined) {
          return res.status(400).json({ 
            message: `Cannot modify ${field}. This field is immutable after candidate creation.` 
          });
        }
      }
      
      // Filter to only allowed fields
      const updateData: any = {};
      for (const field of allowedFields) {
        if (req.body[field] !== undefined) {
          updateData[field] = req.body[field];
        }
      }
      
      // Handle status-based archiving
      if (req.body.status === 'archived') {
        updateData.archived = true;
        updateData.archivedAt = new Date();
        updateData.archivedBy = req.user!.id;
      } else if (req.body.status === 'active' && req.body.status !== undefined) {
        updateData.archived = false;
        updateData.archivedAt = null;
        updateData.archivedBy = null;
      }
      
      if (Object.keys(updateData).length === 0) {
        return res.status(400).json({ message: "No valid fields provided for update" });
      }
      
      const candidate = await storage.updateCandidate(req.params.id, updateData);
      if (!candidate) {
        return res.status(404).json({ message: "Candidate not found" });
      }
      
      // Return the full candidate with joined data
      const fullCandidate = await storage.getCandidate(req.params.id);
      res.json(fullCandidate);
    } catch (error) {
      next(error);
    }
  });

  // Archive candidate (soft delete)
  app.delete("/api/candidates/:id", requireAuth, requireRole(["system_admin", "hr_staff"]), async (req, res, next) => {
    try {
      const updateData = {
        archived: true,
        archivedAt: new Date(),
        archivedBy: req.user!.id,
        status: 'archived' as const
      };
      
      const candidate = await storage.updateCandidate(req.params.id, updateData);
      if (!candidate) {
        return res.status(404).json({ message: "Candidate not found" });
      }
      
      res.json({
        id: candidate.id,
        archived: true,
        archivedAt: updateData.archivedAt
      });
    } catch (error) {
      next(error);
    }
  });

  // Restore archived candidate  
  app.post("/api/candidates/:id/restore", requireAuth, requireRole(["system_admin", "hr_staff"]), async (req, res, next) => {
    try {
      const updateData = {
        archived: false,
        archivedAt: null,
        archivedBy: null,
        status: 'active' as const
      };
      
      const candidate = await storage.updateCandidate(req.params.id, updateData);
      if (!candidate) {
        return res.status(404).json({ message: "Candidate not found" });
      }
      
      // Return the full candidate with joined data
      const fullCandidate = await storage.getCandidate(req.params.id);
      res.json(fullCandidate);
    } catch (error) {
      next(error);
    }
  });

  // Apply template to candidate
  app.post("/api/candidates/:id/apply-template", requireAuth, requireRole(["system_admin", "hr_staff", "department_admin", "division_leader", "manager"]), async (req, res, next) => {
    try {
      const { template_id } = req.body;
      
      console.log('Applying template:', { candidateId: req.params.id, template_id, userId: req.user!.id });
      
      if (!template_id) {
        console.log('Template application failed: template_id is required');
        return res.status(400).json({ message: "template_id is required" });
      }

      const taskCount = await storage.expandTemplate(template_id, req.params.id, req.user!.id);
      console.log('Template applied successfully:', { taskCount });
      res.json({ message: "Template applied successfully", tasksCreated: taskCount });
    } catch (error: any) {
      console.error('Template application failed:', error);
      if (error.message) {
        return res.status(400).json({ message: error.message });
      }
      next(error);
    }
  });

  // Tasks routes - restrict to specific candidate or assignee
  app.get("/api/tasks", requireAuth, async (req, res, next) => {
    try {
      const { candidateId, assigneeId } = req.query;
      
      // Require either candidateId or assigneeId to prevent fetching all tasks globally
      if (!candidateId && !assigneeId) {
        return res.status(400).json({ message: "candidateId or assigneeId parameter is required" });
      }
      
      // Validate UUIDs to prevent 'undefined' strings being passed
      if (candidateId && (candidateId === 'undefined' || candidateId === 'null')) {
        return res.status(400).json({ message: "Invalid candidateId" });
      }
      if (assigneeId && (assigneeId === 'undefined' || assigneeId === 'null')) {
        return res.status(400).json({ message: "Invalid assigneeId" });
      }
      
      const filters: any = {};
      if (candidateId) filters.candidateId = candidateId as string;
      if (assigneeId) filters.assigneeId = assigneeId as string;
      
      const tasks = await storage.getCandidateTasks(filters);
      res.json(tasks);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/tasks/mine", requireAuth, async (req, res, next) => {
    try {
      const userId = req.user!.id;
      
      // Get user preferences to use as defaults
      const preferences = await storage.getUserPreferences(userId);
      const defaultShowArchived = preferences?.mytasksShowArchived ?? false;
      const defaultShowCanceled = preferences?.mytasksShowCanceled ?? false;
      const defaultShowCompleted = preferences?.mytasksShowCompleted ?? false;
      
      // Query parameters override stored preferences
      const showArchived = req.query.showArchived !== undefined 
        ? req.query.showArchived === '1' || req.query.showArchived === 'true'
        : defaultShowArchived;
      const showCanceled = req.query.showCanceled !== undefined 
        ? req.query.showCanceled === '1' || req.query.showCanceled === 'true'
        : defaultShowCanceled;
      const showCompleted = req.query.showCompleted !== undefined 
        ? req.query.showCompleted === '1' || req.query.showCompleted === 'true'
        : defaultShowCompleted;
      
      // For backward compatibility, handle includeClosed parameter
      const includeClosed = req.query.includeClosed === 'true';
      
      const tasks = await storage.getCandidateTasks({ 
        assigneeId: userId,
        includeClosed,
        showArchived,
        showCanceled,
        showCompleted
      });
      res.json(tasks);
    } catch (error) {
      next(error);
    }
  });

  // Dashboard tasks endpoint - returns all tasks from active/on_hold candidates for KPI calculations
  app.get("/api/tasks/dashboard", requireAuth, async (req, res, next) => {
    try {
      const tasks = await storage.getDashboardTasks();
      res.json(tasks);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/tasks/:id", requireAuth, async (req, res, next) => {
    try {
      const task = await storage.getCandidateTask(req.params.id);
      if (!task) {
        return res.status(404).json({ message: "Task not found" });
      }
      res.json(task);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/tasks", requireAuth, async (req, res, next) => {
    try {
      // Validate candidate_id is required
      if (!req.body.candidateId) {
        return res.status(400).json({ message: "candidate_id is required" });
      }

      const validatedData = insertCandidateTaskSchema.parse(req.body);
      
      // If save_as_definition flag is set, create a task definition first
      if (req.body.save_as_definition && req.body.title && !req.body.taskDefId) {
        const taskDef = await storage.createTaskDefinition({
          name: req.body.title,
          description: req.body.description || null,
          archived: false,
          createdBy: req.user!.id
        });
        validatedData.taskDefId = taskDef.id;
      }
      
      const task = await storage.createCandidateTask(validatedData);
      res.status(201).json(task);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      next(error);
    }
  });

  app.patch("/api/tasks/:id", requireAuth, async (req, res, next) => {
    try {
      // Get task first to check permissions
      const existingTask = await storage.getCandidateTask(req.params.id);
      if (!existingTask) {
        return res.status(404).json({ message: "Task not found" });
      }

      // Get candidate to check RBAC
      const candidate = await storage.getCandidate(existingTask.candidateId);
      if (!candidate) {
        return res.status(404).json({ message: "Candidate not found" });
      }

      // Check RBAC - allow if user has permission to edit tasks or is assigned to the task
      const allowedRoles = ["system_admin", "hr_staff", "department_admin", "division_leader", "manager"];
      const canEdit = allowedRoles.includes(req.user!.role) || existingTask.assigneeId === req.user!.id;
      
      if (!canEdit) {
        return res.status(403).json({ message: "Insufficient permissions to update this task" });
      }

      // Handle completed_at field based on status
      let updateData = { ...req.body };
      if (req.body.status === 'done' && !existingTask.completedAt) {
        updateData.completedAt = new Date();
      } else if (req.body.status !== 'done' && existingTask.completedAt) {
        updateData.completedAt = null;
      }

      const task = await storage.updateCandidateTask(req.params.id, updateData);
      if (!task) {
        return res.status(404).json({ message: "Task not found" });
      }

      // Check if stage should advance after task status change
      let advancement = null;
      if (req.body.status) {
        advancement = await advanceStageIfComplete({
          candidateId: existingTask.candidateId,
          invokerUserId: req.user!.id
        });
        
        // Log advancement for debugging (optional)
        if (advancement.advanced) {
          console.log(`Candidate ${existingTask.candidateId} advanced to stage ${advancement.toStageName}`);
        }
      }

      // Get updated candidate data if stage advanced
      let updatedCandidate = null;
      if (advancement?.advanced) {
        updatedCandidate = await storage.getCandidate(existingTask.candidateId);
      }

      // Return comprehensive response with task, candidate state, and advancement info
      res.json({
        task,
        candidate: updatedCandidate ? {
          id: updatedCandidate.id,
          current_stage_id: updatedCandidate.currentStageId,
          updated_at: updatedCandidate.updatedAt
        } : null,
        advancement: advancement?.advanced ? {
          advanced: true,
          fromStageId: advancement.fromStageId,
          toStageId: advancement.toStageId,
          toStageName: advancement.toStageName
        } : { advanced: false }
      });
    } catch (error) {
      next(error);
    }
  });

  app.delete("/api/tasks/:id", requireAuth, async (req, res, next) => {
    try {
      // Soft delete by archiving
      await storage.archiveCandidateTask(req.params.id);
      res.sendStatus(204);
    } catch (error) {
      next(error);
    }
  });

  // Templates routes
  app.get("/api/templates", requireAuth, requireRole(["system_admin", "hr_staff"]), async (req, res, next) => {
    try {
      const templates = await storage.getTemplates();
      res.json(templates);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/templates/:id", requireAuth, requireRole(["system_admin", "hr_staff"]), async (req, res, next) => {
    try {
      const template = await storage.getTemplate(req.params.id);
      if (!template) {
        return res.status(404).json({ message: "Template not found" });
      }
      res.json(template);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/templates", requireAuth, requireRole(["system_admin", "hr_staff"]), async (req, res, next) => {
    try {
      const { cloneFromTemplateId, ...templateData } = req.body;
      const validatedData = insertTemplateSchema.parse(templateData);
      const template = await storage.createTemplate(validatedData, cloneFromTemplateId);
      res.status(201).json(template);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      next(error);
    }
  });

  app.patch("/api/templates/:id", requireAuth, requireRole(["system_admin", "hr_staff"]), async (req, res, next) => {
    try {
      const template = await storage.updateTemplate(req.params.id, req.body);
      if (!template) {
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

  app.delete("/api/templates/:id", requireAuth, requireRole(["system_admin", "hr_staff"]), async (req, res, next) => {
    try {
      await storage.archiveTemplate(req.params.id);
      res.sendStatus(204);
    } catch (error) {
      next(error);
    }
  });

  // Template readiness endpoint
  app.get("/api/templates/:id/readiness", requireAuth, requireRole(["system_admin", "hr_staff"]), async (req, res, next) => {
    try {
      const readiness = await storage.getTemplateReadiness(req.params.id);
      res.json(readiness);
    } catch (error) {
      next(error);
    }
  });

  // Template status update endpoint
  app.patch("/api/templates/:id/status", requireAuth, requireRole(["system_admin", "hr_staff"]), async (req, res, next) => {
    try {
      const { status } = req.body;
      if (!status || !["draft", "active", "archived"].includes(status)) {
        return res.status(400).json({ message: "Invalid status. Must be draft, active, or archived." });
      }
      
      // Map status to database columns
      let updateData: { isActive?: boolean; archived?: boolean } = {};
      switch (status) {
        case "draft":
          updateData = { isActive: false, archived: false };
          break;
        case "active":
          updateData = { isActive: true, archived: false };
          break;
        case "archived":
          updateData = { archived: true, isActive: false };
          break;
      }
      
      const template = await storage.updateTemplate(req.params.id, updateData);
      if (!template) {
        return res.status(404).json({ message: "Template not found" });
      }
      res.json(template);
    } catch (error: any) {
      // Handle template readiness constraint violation
      if (error.message?.includes('Template cannot be set to Active until it has at least one stage')) {
        return res.status(400).json({ 
          code: 'TEMPLATE_NOT_READY',
          message: 'At least one stage is required.' 
        });
      }
      next(error);
    }
  });

  // Template estimation endpoint
  app.get("/api/templates/:id/estimate", requireAuth, requireRole(["system_admin", "hr_staff"]), async (req, res, next) => {
    try {
      const { startDate, businessDays } = req.query;
      const estimate = await storage.estimateTemplate(
        req.params.id,
        startDate as string,
        businessDays === 'true'
      );
      res.json(estimate);
    } catch (error) {
      next(error);
    }
  });

  // Candidate pipeline duration estimation endpoint
  app.get("/api/candidates/:id/estimate", requireAuth, async (req, res, next) => {
    try {
      const candidateId = req.params.id;
      const { businessDays } = req.query;
      const estimate = await storage.estimateCandidate(
        candidateId,
        businessDays === 'true'
      );
      res.json(estimate);
    } catch (error) {
      next(error);
    }
  });

  // Search API endpoints
  app.get("/api/search/departments", requireAuth, async (req, res, next) => {
    try {
      const { q } = req.query;
      const query = typeof q === 'string' ? q : '';
      
      console.log('Searching departments with query:', query);
      const results = await storage.searchDepartments(query);
      console.log('Department search results:', results.length, 'items');
      res.json({ items: results, query });
    } catch (error) {
      console.error('search departments error:', error);
      res.status(500).json({ error: 'SEARCH_DEPARTMENTS_FAILED', message: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.get("/api/search/divisions", requireAuth, async (req, res, next) => {
    try {
      const { q, departmentId } = req.query;
      const query = typeof q === 'string' ? q : '';
      
      console.log('Searching divisions with query:', query, 'departmentId:', departmentId);
      const results = await storage.searchDivisions(query, typeof departmentId === 'string' ? departmentId : undefined);
      console.log('Division search results:', results.length, 'items');
      res.json({ items: results, query });
    } catch (error) {
      console.error('search divisions error:', error);
      res.status(500).json({ error: 'SEARCH_DIVISIONS_FAILED', message: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.get("/api/search/users", requireAuth, async (req, res, next) => {
    try {
      const q = (req.query.q ?? '').toString().trim();
      const role = (req.query.role ?? '').toString().trim();
      
      console.log('Searching users with query:', q, 'role:', role);
      const results = await storage.searchUsers(q, role || undefined);
      console.log('User search results:', results.length, 'items');
      res.setHeader('Content-Type', 'application/json');
      res.status(200).json({ items: results, query: q });
    } catch (error) {
      console.error('search users error:', error);
      res.status(500).json({ error: 'SEARCH_USERS_FAILED', message: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Candidate status update endpoint
  app.patch("/api/candidates/:id/status", requireAuth, requireRole(["system_admin", "hr_staff"]), async (req, res, next) => {
    try {
      const { status, closeOpenTasks } = req.body;
      
      // Validate status is provided
      if (!status) {
        return res.status(400).json({ message: "Status is required" });
      }

      // Validate status is valid enum value
      const validStatuses = ['draft', 'active', 'on_hold', 'completed', 'canceled', 'archived'];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ message: "Invalid status value" });
      }

      // Update candidate status with validation
      const result = await storage.updateCandidateStatus(
        req.params.id,
        status,
        req.user!.id,
        closeOpenTasks === true
      );

      if (!result.success) {
        const statusCode = result.code === 'CANDIDATE_NOT_FOUND' ? 404 : 400;
        return res.status(statusCode).json({
          message: result.error,
          code: result.code,
          ...(result.remainingTasks && { remainingTasks: result.remainingTasks })
        });
      }

      // Return updated candidate data
      const updatedCandidate = await storage.getCandidate(req.params.id);
      res.json(updatedCandidate);
    } catch (error) {
      next(error);
    }
  });

  // Template Tasks routes
  app.get("/api/templates/:id/template-tasks", requireAuth, requireRole(["system_admin", "hr_staff"]), async (req, res, next) => {
    try {
      const templateId = req.params.id;
      if (!templateId || templateId === "undefined") {
        return res.status(400).json({ message: "Invalid template ID" });
      }
      const tasks = await storage.getTemplateTasks(templateId);
      res.json(tasks);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/templates/:id/template-tasks", requireAuth, requireRole(["system_admin", "hr_staff"]), async (req, res, next) => {
    try {
      if (!req.body.taskDefId) {
        return res.status(400).json({ message: "task_def_id is required" });
      }
      if (!req.body.stageId) {
        return res.status(400).json({ message: "stage_id is required" });
      }
      
      // Check if stage exists for this template
      const templateStages = await storage.getTemplateStages(req.params.id);
      const stageExists = templateStages.some(ts => ts.stageId === req.body.stageId && ts.isActive);
      
      if (!stageExists) {
        return res.status(400).json({ message: "Add a stage to this template before adding tasks." });
      }
      
      // Enforce database constraint rules for due_rule_type combinations
      let dueRuleValue = req.body.dueRuleValue || null;
      let fixedDate = req.body.fixedDate || null;
      
      if (req.body.dueRuleType === 'on_start_date') {
        // on_start_date requires both due_rule_value and fixed_date to be null
        dueRuleValue = null;
        fixedDate = null;
      } else if (req.body.dueRuleType === 'fixed_date') {
        // fixed_date requires due_rule_value to be null
        dueRuleValue = null;
      } else if (['days_before_start', 'days_after_start', 'days_before_stage', 'days_after_stage'].includes(req.body.dueRuleType)) {
        // relative types require fixed_date to be null
        fixedDate = null;
      }
      
      const templateTask = await storage.createTemplateTask({
        templateId: req.params.id,
        taskDefId: req.body.taskDefId,
        stageId: req.body.stageId,
        dueRuleType: req.body.dueRuleType,
        dueRuleValue,
        fixedDate,
        defaultAssigneeId: req.body.defaultAssigneeId || null,
        defaultPriorityId: req.body.defaultPriorityId || null,
        defaultCategoryId: req.body.defaultCategoryId || null
      });
      res.status(201).json(templateTask);
    } catch (error) {
      next(error);
    }
  });

  app.patch("/api/template-tasks/:id", requireAuth, requireRole(["system_admin", "hr_staff"]), async (req, res, next) => {
    try {
      // Clean the data to prevent database errors with empty strings
      let cleanedData = {
        ...req.body,
        dueRuleValue: req.body.dueRuleValue === "" ? null : req.body.dueRuleValue,
        fixedDate: req.body.fixedDate === "" ? null : req.body.fixedDate,
        defaultAssigneeId: req.body.defaultAssigneeId === "" ? null : req.body.defaultAssigneeId,
        defaultPriorityId: req.body.defaultPriorityId === "" ? null : req.body.defaultPriorityId,
        defaultCategoryId: req.body.defaultCategoryId === "" ? null : req.body.defaultCategoryId,
      };
      
      // Enforce database constraint rules for due_rule_type combinations
      if (cleanedData.dueRuleType === 'on_start_date') {
        // on_start_date requires both due_rule_value and fixed_date to be null
        cleanedData.dueRuleValue = null;
        cleanedData.fixedDate = null;
      } else if (cleanedData.dueRuleType === 'fixed_date') {
        // fixed_date requires due_rule_value to be null
        cleanedData.dueRuleValue = null;
      } else if (['days_before_start', 'days_after_start', 'days_before_stage', 'days_after_stage'].includes(cleanedData.dueRuleType)) {
        // relative types require fixed_date to be null
        cleanedData.fixedDate = null;
      }
      
      const task = await storage.updateTemplateTask(req.params.id, cleanedData);
      if (!task) {
        return res.status(404).json({ message: "Template task not found" });
      }
      res.json(task);
    } catch (error) {
      next(error);
    }
  });

  app.delete("/api/template-tasks/:id", requireAuth, requireRole(["system_admin", "hr_staff"]), async (req, res, next) => {
    try {
      // Get template task details before deletion to check if it was the last in its stage
      const taskToDelete = await storage.getTemplateTask(req.params.id);
      if (!taskToDelete) {
        return res.status(404).json({ message: "Template task not found" });
      }
      
      // Check if this is the last task in its stage
      const allTasks = await storage.getTemplateTasks(taskToDelete.templateId);
      const tasksInStage = allTasks.filter(t => t.stageId === taskToDelete.stageId);
      const isLastTaskInStage = tasksInStage.length === 1;
      
      let removedStage = null;
      if (isLastTaskInStage) {
        // Get stage info before it gets deleted by the trigger
        const templateStages = await storage.getTemplateStages(taskToDelete.templateId);
        const stageToRemove = templateStages.find(s => s.stageId === taskToDelete.stageId);
        if (stageToRemove) {
          removedStage = { stageId: stageToRemove.stageId };
        }
      }
      
      // Delete the task (trigger will auto-remove stage if it was the last task)
      await storage.archiveTemplateTask(req.params.id);
      
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
  app.get("/api/templates/:id/template-stages", requireAuth, requireRole(["system_admin", "hr_staff"]), async (req, res, next) => {
    try {
      const templateId = req.params.id;
      if (!templateId || templateId === "undefined") {
        return res.status(400).json({ message: "Invalid template ID" });
      }
      const stages = await storage.getTemplateStages(templateId);
      res.json(stages);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/templates/:id/template-stages", requireAuth, requireRole(["system_admin", "hr_staff"]), async (req, res, next) => {
    try {
      if (!req.body.stageId) {
        return res.status(400).json({ message: "stage_id is required" });
      }
      
      const templateStage = await storage.createTemplateStage({
        templateId: req.params.id,
        stageId: req.body.stageId,
        orderIndex: req.body.orderIndex || 0,
        isActive: true
      });
      res.status(201).json(templateStage);
    } catch (error) {
      next(error);
    }
  });

  app.patch("/api/template-stages/:id", requireAuth, requireRole(["system_admin", "hr_staff"]), async (req, res, next) => {
    try {
      const stage = await storage.updateTemplateStage(req.params.id, req.body);
      if (!stage) {
        return res.status(404).json({ message: "Template stage not found" });
      }
      res.json(stage);
    } catch (error) {
      next(error);
    }
  });

  app.delete("/api/template-stages/:id", requireAuth, requireRole(["system_admin", "hr_staff"]), async (req, res, next) => {
    try {
      await storage.deleteTemplateStage(req.params.id);
      res.sendStatus(204);
    } catch (error) {
      next(error);
    }
  });

  // Template stages reordering endpoint
  app.patch("/api/templates/:id/stages/reorder", requireAuth, requireRole(["system_admin", "hr_staff"]), async (req, res, next) => {
    try {
      const templateId = req.params.id;
      const { stageIdsInOrder } = req.body;
      
      if (!Array.isArray(stageIdsInOrder)) {
        return res.status(400).json({ message: "stageIdsInOrder must be an array" });
      }
      
      await storage.reorderTemplateStages(templateId, stageIdsInOrder);
      res.json({ ok: true });
    } catch (error: any) {
      if (error.message?.includes("stage count mismatch") || error.message?.includes("Invalid stage")) {
        return res.status(400).json({ message: error.message });
      }
      next(error);
    }
  });

  // Atomic endpoint: create stage with tasks
  app.post("/api/templates/:id/stages/create-with-task", requireAuth, requireRole(["system_admin", "hr_staff"]), async (req, res, next) => {
    try {
      const templateId = req.params.id;
      const { stageId, taskDefIds, priorityId, categoryId, assigneeId, dueRuleType, dueRuleValue } = req.body;
      
      // Validate required fields
      if (!stageId) {
        return res.status(400).json({ message: "stageId is required" });
      }
      if (!Array.isArray(taskDefIds) || taskDefIds.length === 0) {
        return res.status(400).json({ message: "At least one task must be provided" });
      }
      
      // Validate that the stage exists and is active
      const hiringStages = await storage.getHiringStages();
      const validStage = hiringStages.find(hs => hs.id === stageId && hs.isActive);
      if (!validStage) {
        return res.status(400).json({ message: "Invalid or inactive stage" });
      }
      
      // Get existing template stages to compute next order index
      const templateStages = await storage.getTemplateStages(templateId);
      const maxOrderIndex = Math.max(0, ...templateStages.map(ts => ts.orderIndex || 0));
      
      // Create the template stage (will upsert if exists)
      const templateStage = await storage.createTemplateStage({
        templateId,
        stageId,
        orderIndex: maxOrderIndex + 1,
        isActive: true
      });
      
      // Create all template tasks for this stage
      const createdTasks = [];
      for (const taskDefId of taskDefIds) {
        // Clean and validate due rule data like the existing endpoint
        let cleanDueRuleValue = dueRuleValue || null;
        let fixedDate = null;
        
        if (dueRuleType === 'on_start_date') {
          cleanDueRuleValue = null;
          fixedDate = null;
        } else if (dueRuleType === 'fixed_date') {
          cleanDueRuleValue = null;
          fixedDate = dueRuleValue; // For fixed_date, dueRuleValue contains the date
        } else if (['days_before_start', 'days_after_start', 'days_before_stage', 'days_after_stage'].includes(dueRuleType)) {
          fixedDate = null;
        }
        
        const templateTask = await storage.createTemplateTask({
          templateId,
          taskDefId,
          stageId,
          dueRuleType: dueRuleType || 'on_start_date',
          dueRuleValue: cleanDueRuleValue,
          fixedDate,
          defaultAssigneeId: assigneeId || null,
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

  // Task Definitions routes
  app.get("/api/task-definitions", requireAuth, requireRole(["system_admin", "hr_staff"]), async (req, res, next) => {
    try {
      const taskDefs = await storage.getTaskDefinitions();
      res.json(taskDefs);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/task-definitions", requireAuth, requireRole(["system_admin", "hr_staff"]), async (req, res, next) => {
    try {
      const validatedData = insertTaskDefinitionSchema.parse(req.body);
      const taskDef = await storage.createTaskDefinition(validatedData);
      res.status(201).json(taskDef);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      next(error);
    }
  });

  app.patch("/api/task-definitions/:id", requireAuth, requireRole(["system_admin", "hr_staff"]), async (req, res, next) => {
    try {
      const taskDef = await storage.updateTaskDefinition(req.params.id, req.body);
      if (!taskDef) {
        return res.status(404).json({ message: "Task definition not found" });
      }
      res.json(taskDef);
    } catch (error) {
      next(error);
    }
  });



  // Departments and Divisions routes
  app.get("/api/departments", requireAuth, async (req, res, next) => {
    try {
      const includeArchived = req.query.includeArchived === 'true';
      const departments = await storage.getDepartments(includeArchived);
      res.json(departments);
    } catch (error) {
      next(error);
    }
  });

  // (Removed duplicate /api/divisions route that previously ignored includeArchived)

  app.post("/api/departments", requireAuth, requireRole(["system_admin", "hr_staff"]), async (req, res, next) => {
    try {
      const validatedData = insertDepartmentSchema.parse(req.body);
      const department = await storage.createDepartment(validatedData);
      res.status(201).json(department);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      next(error);
    }
  });

  app.patch("/api/departments/:id", requireAuth, requireRole(["system_admin", "hr_staff"]), async (req, res, next) => {
    try {
      const { id } = req.params;
      const validatedData = insertDepartmentSchema.partial().parse(req.body);
      const department = await storage.updateDepartment(id, validatedData);
      
      if (!department) {
        return res.status(404).json({ message: "Department not found" });
      }
      
      res.json(department);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      next(error);
    }
  });

  app.delete("/api/departments/:id", requireAuth, requireRole(["system_admin", "hr_staff"]), async (req, res, next) => {
    try {
      const { id } = req.params;
      const department = await storage.updateDepartment(id, { archived: true, updatedAt: new Date() });
      
      if (!department) {
        return res.status(404).json({ message: "Department not found" });
      }
      
      res.json({ message: "Department archived successfully", department });
    } catch (error) {
      next(error);
    }
  });

  // Restore Department
  app.post("/api/departments/:id/restore", requireAuth, requireRole(["system_admin", "hr_staff"]), async (req, res, next) => {
    try {
      const { id } = req.params;
      const department = await storage.updateDepartment(id, { archived: false, updatedAt: new Date() });
      if (!department) {
        return res.status(404).json({ message: "Department not found" });
      }
      res.json({ message: "Department restored successfully", department });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/divisions", requireAuth, requireRole(["system_admin", "hr_staff"]), async (req, res, next) => {
    try {
      const validatedData = insertDivisionSchema.parse(req.body);
      const division = await storage.createDivision(validatedData);
      res.status(201).json(division);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      next(error);
    }
  });

  app.patch("/api/divisions/:id", requireAuth, requireRole(["system_admin", "hr_staff"]), async (req, res, next) => {
    try {
      const { id } = req.params;
      const validatedData = insertDivisionSchema.partial().parse(req.body);
      const division = await storage.updateDivision(id, validatedData);
      
      if (!division) {
        return res.status(404).json({ message: "Division not found" });
      }
      
      res.json(division);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      next(error);
    }
  });

  app.delete("/api/divisions/:id", requireAuth, requireRole(["system_admin", "hr_staff"]), async (req, res, next) => {
    try {
      const { id } = req.params;
      const division = await storage.updateDivision(id, { archived: true, updatedAt: new Date() });
      
      if (!division) {
        return res.status(404).json({ message: "Division not found" });
      }
      
      res.json({ message: "Division archived successfully", division });
    } catch (error) {
      next(error);
    }
  });

  // Restore Division
  app.post("/api/divisions/:id/restore", requireAuth, requireRole(["system_admin", "hr_staff"]), async (req, res, next) => {
    try {
      const { id } = req.params;
      const division = await storage.updateDivision(id, { archived: false, updatedAt: new Date() });
      if (!division) {
        return res.status(404).json({ message: "Division not found" });
      }
      res.json({ message: "Division restored successfully", division });
    } catch (error) {
      next(error);
    }
  });

  // Reference data routes
  app.get("/api/hiring-stages", requireAuth, async (req, res, next) => {
    try {
      const stages = await storage.getHiringStages();
      res.json(stages);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/hiring-stages", requireAuth, requireRole(["system_admin", "hr_staff"]), async (req, res, next) => {
    try {
      const validatedData = insertHiringStageSchema.parse(req.body);
      const stage = await storage.createHiringStage(validatedData);
      res.status(201).json(stage);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      next(error);
    }
  });

  app.patch("/api/hiring-stages/:id", requireAuth, requireRole(["system_admin", "hr_staff"]), async (req, res, next) => {
    try {
      const stage = await storage.updateHiringStage(req.params.id, req.body);
      if (!stage) {
        return res.status(404).json({ message: "Hiring stage not found" });
      }
      res.json(stage);
    } catch (error) {
      next(error);
    }
  });

  app.delete("/api/hiring-stages/:id", requireAuth, requireRole(["system_admin", "hr_staff"]), async (req, res, next) => {
    try {
      await storage.deleteHiringStage(req.params.id);
      res.sendStatus(204);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/task-categories", requireAuth, async (req, res, next) => {
    try {
      const categories = await storage.getTaskCategories();
      res.json(categories);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/task-priorities", requireAuth, async (req, res, next) => {
    try {
      const priorities = await storage.getTaskPriorities();
      res.json(priorities);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/candidate-types", requireAuth, async (req, res, next) => {
    try {
      const types = await storage.getCandidateTypes();
      res.json(types);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/faculty-ranks", requireAuth, requireRole(["system_admin", "hr_staff", "department_admin"]), async (req, res, next) => {
    try {
      const ranks = await storage.getFacultyRanks();
      res.json(ranks);
    } catch (error) {
      next(error);
    }
  });

  // User Management - Admin only endpoints
  app.get("/api/users", requireAuth, requireRole(["system_admin", "hr_staff"]), async (req, res, next) => {
    try {
      const { status, role, departmentId, divisionId, search } = req.query;
      
      const filters: any = {};
      if (status) filters.status = status as string;
      if (role) filters.role = role as string;
      if (departmentId) filters.departmentId = departmentId as string;
      if (divisionId) filters.divisionId = divisionId as string;
      if (search) filters.search = search as string;
      
      const users = await storage.getAllUsers(filters);
      res.json(users);
    } catch (error) {
      next(error);
    }
  });

  // Get assignable users (active users only for task assignment)
  app.get("/api/users/assignable", requireAuth, async (req, res, next) => {
    try {
      const { role, departmentId, divisionId, search } = req.query;
      
      const filters: any = {
        status: 'active' // Only return active users for assignment
      };
      if (role) filters.role = role as string;
      if (departmentId) filters.departmentId = departmentId as string;
      if (divisionId) filters.divisionId = divisionId as string;
      if (search) filters.search = search as string;
      
      const users = await storage.getAllUsers(filters);
      res.json(users);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/users", requireAuth, requireRole(["system_admin", "hr_staff"]), async (req, res, next) => {
    try {
      const userData = req.body;
      
      // Check if email already exists
      const existingUser = await storage.getUserByEmail(userData.email);
      if (existingUser) {
        return res.status(400).json({ message: "Email already exists" });
      }
      
      // Hash password if provided using the same method as auth.ts
      if (userData.passwordHash) {
        const { scrypt, randomBytes } = await import('crypto');
        const { promisify } = await import('util');
        const scryptAsync = promisify(scrypt);
        
        const salt = randomBytes(16).toString("hex");
        const buf = (await scryptAsync(userData.passwordHash, salt, 64)) as Buffer;
        userData.passwordHash = `${buf.toString("hex")}.${salt}`;
      }
      
      const user = await storage.createUser(userData);
      
      // Set roles if provided
      if (userData.roles && Array.isArray(userData.roles)) {
        await storage.setUserRoles(user.id, userData.roles);
      }
      
      res.status(201).json(user);
    } catch (error) {
      if (error instanceof Error && error.message.includes('duplicate key')) {
        return res.status(400).json({ message: "Email already exists" });
      }
      next(error);
    }
  });

  app.patch("/api/users/:id", requireAuth, requireRole(["system_admin", "hr_staff"]), async (req, res, next) => {
    try {
      const { id } = req.params;
      const updateData = req.body;
      
      // Hash password if being updated using the same method as auth.ts
      if (updateData.passwordHash) {
        const { scrypt, randomBytes } = await import('crypto');
        const { promisify } = await import('util');
        const scryptAsync = promisify(scrypt);
        
        const salt = randomBytes(16).toString("hex");
        const buf = (await scryptAsync(updateData.passwordHash, salt, 64)) as Buffer;
        updateData.passwordHash = `${buf.toString("hex")}.${salt}`;
      }
      
      const user = await storage.updateUser(id, updateData);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      res.json(user);
    } catch (error) {
      next(error);
    }
  });

  app.patch("/api/users/:id/roles", requireAuth, requireRole(["system_admin", "hr_staff"]), async (req, res, next) => {
    try {
      const { id } = req.params;
      const { roles } = req.body;
      
      if (!Array.isArray(roles)) {
        return res.status(400).json({ message: "Roles must be an array" });
      }
      
      const userRoles = await storage.setUserRoles(id, roles);
      res.json({ userRoles });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/users/:id/disable", requireAuth, requireRole(["system_admin", "hr_staff"]), async (req, res, next) => {
    try {
      const { id } = req.params;
      const { reassignOpenTasksTo } = req.body;
      
      // Get task count before disabling
      const taskCount = await storage.getUserOpenTaskCount(id);
      
      const result = await storage.disableUser(id, reassignOpenTasksTo);
      
      res.json({
        success: result.success,
        tasksReassigned: result.tasksReassigned,
        taskCount
      });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/users/:id/enable", requireAuth, requireRole(["system_admin", "hr_staff"]), async (req, res, next) => {
    try {
      const { id } = req.params;
      
      const user = await storage.enableUser(id);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      res.json(user);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/users/:id/task-count", requireAuth, requireRole(["system_admin", "hr_staff"]), async (req, res, next) => {
    try {
      const { id } = req.params;
      const taskCount = await storage.getUserOpenTaskCount(id);
      res.json(taskCount);
    } catch (error) {
      next(error);
    }
  });

  // Helper functions for provider management
  function checkProviderConfiguration(providerId: string): boolean {
    switch (providerId) {
      case 'local':
        return true; // Local is always configured
      case 'ldap':
        return !!(process.env.LDAP_URL && process.env.LDAP_BIND_DN);
      case 'google':
        return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
      case 'azuread':
        return !!(process.env.AZURE_CLIENT_ID && process.env.AZURE_CLIENT_SECRET && process.env.AZURE_TENANT_ID);
      default:
        return false;
    }
  }

  function maskId(s?: string): string | undefined {
    if (!s) return undefined;
    return `${"x".repeat(Math.max(0, s.length - 4))}${s.slice(-4)}`;
  }

  function getProviderDetails(providerId: string) {
    switch (providerId) {
      case 'local':
        return {
          clientIdMasked: undefined,
          callbackUrl: undefined,
          notes: 'Built-in password authentication'
        };
      case 'ldap':
        return {
          clientIdMasked: maskId(process.env.LDAP_BIND_DN),
          callbackUrl: process.env.LDAP_URL,
          notes: 'Active Directory/LDAP authentication'
        };
      case 'google':
        return {
          clientIdMasked: maskId(process.env.GOOGLE_CLIENT_ID),
          callbackUrl: process.env.GOOGLE_CALLBACK_URL || `${process.env.BASE_URL || 'http://localhost:5000'}/auth/google/callback`,
          notes: 'Google OAuth 2.0 authentication'
        };
      case 'azuread':
        return {
          clientIdMasked: maskId(process.env.AZURE_CLIENT_ID),
          callbackUrl: process.env.AZURE_CALLBACK_URL || `${process.env.BASE_URL || 'http://localhost:5000'}/auth/azuread/callback`,
          notes: 'Microsoft Azure Active Directory authentication'
        };
      default:
        return {
          clientIdMasked: undefined,
          callbackUrl: undefined,
          notes: 'Unknown provider'
        };
    }
  }

  // Provider management endpoints
  app.get("/api/auth/providers", requireAuth, requireRole(["system_admin", "hr_staff"]), async (req, res, next) => {
    try {
      const dbProviders = await storage.getAllAuthProviders();
      
      const providerInfos = dbProviders.map(dbProvider => {
        const configured = checkProviderConfiguration(dbProvider.id);
        const details = getProviderDetails(dbProvider.id);
        
        return {
          id: dbProvider.id as "local" | "ldap" | "google" | "azuread",
          name: dbProvider.name,
          enabled: dbProvider.enabled,
          configured,
          effectiveEnabled: Boolean(dbProvider.enabled && configured),
          canEnable: Boolean(configured),
          ...details
        };
      });
      
      res.json(providerInfos);
    } catch (error) {
      next(error);
    }
  });

  app.patch("/api/auth/providers/:id", requireAuth, requireRole(["system_admin", "hr_staff"]), async (req, res, next) => {
    try {
      const { id } = req.params;
      const { enabled } = req.body;
      
      if (typeof enabled !== 'boolean') {
        return res.status(400).json({ message: "enabled field must be a boolean" });
      }
      
      // Validate provider ID
      if (!['local', 'ldap', 'google', 'azuread'].includes(id)) {
        return res.status(404).json({ message: "Provider not found" });
      }
      
      // Check if trying to enable an unconfigured provider
      const configured = checkProviderConfiguration(id);
      if (enabled && !configured) {
        return res.status(400).json({ 
          message: "Provider is not configured. Set required environment variables first." 
        });
      }

      // Don't allow disabling local provider if it's the only enabled AND configured one
      if (id === 'local' && !enabled) {
        const allProviders = await storage.getAllAuthProviders();
        const otherViableProviders = allProviders.filter(p => 
          p.id !== 'local' && 
          p.enabled && 
          checkProviderConfiguration(p.id)
        );
        
        if (otherViableProviders.length === 0) {
          return res.status(400).json({ 
            message: "Cannot disable local authentication when no other configured providers are enabled" 
          });
        }
      }
      
      const updatedProvider = await storage.updateAuthProvider(id, { enabled });
      
      if (!updatedProvider) {
        return res.status(404).json({ message: "Provider not found" });
      }
      
      const details = getProviderDetails(id);
      
      const result = {
        id: updatedProvider.id as "local" | "ldap" | "google" | "azuread",
        name: updatedProvider.name,
        enabled: updatedProvider.enabled,
        configured,
        effectiveEnabled: Boolean(updatedProvider.enabled && configured),
        canEnable: Boolean(configured),
        ...details
      };
      
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
