import { Router } from "express";
import { z } from "zod";
import { sql } from "drizzle-orm";
import { requireAuth, requireRole } from "../middleware/authorization";
import { sensitiveRateLimiter } from "../middleware/rate-limiter";
import { db } from "../db/connection";
import { insertCandidateTaskSchema } from "@shared/schemas";
import {
  fetchTaskWithAccess,
  fetchCandidateWithAccess,
  hasPrivilegedRole,
  hasAnyRole,
  logAuthorizationFailure
} from "../utils/authorization.utils";
import { sanitizeTaskForCandidateUser } from "../utils/sanitization.utils";
import {
  buildActorLabel,
  buildCommentSnippet,
  notifyTaskAssignees,
  notifyCandidateStageChange
} from "../utils/notification.utils";
import {
  advanceStageIfComplete,
  recomputeCandidateStageState
} from "../features/tasks/services/advance-stage.service";
import {
  createNotifications,
  extractMentionKeys,
  resolveMentionedUsers
} from "../features/notifications/services";
import { emitDeadlinesIfNeeded } from "../features/notifications/deadline-helpers";
import { authorizationService } from "../services/authorization";
import { eventBus, candidateStageChanged, taskCreated, taskAssigned, taskStatusChanged, taskCompleted, commentCreated } from "../events";
import { getTaskService, getCommentService, getUserService, getReferenceDataService, getCandidateService } from "../services/service-factory";

const router = Router();

const statusAliasToInternal = (status?: string | null) => {
  if (!status) return undefined;
  const normalized = status.toLowerCase();
  if (normalized === "pending") return "todo";
  if (normalized === "completed") return "done";
  return status;
};

const internalStatusToAlias = (status?: string | null) => {
  if (!status) return status;
  if (status === "todo") return "pending";
  if (status === "done") return "completed";
  return status;
};

// GET /api/tasks - Get tasks with filtering (candidate or assignee required)
router.get("/tasks", sensitiveRateLimiter, requireAuth, async (req, res, next) => {
  try {
    const { candidateId, assigneeId, assigneeUserId } = req.query;
    const authContext = authorizationService.buildContext(req.user);
    const roleSet = authContext.roles;
    const taskService = getTaskService();

    if (!hasPrivilegedRole(req.user) && roleSet.has("candidate")) {
      let tasks = await taskService.getTasks({ assigneeId: req.user!.id }, authContext);
      tasks = tasks.map(sanitizeTaskForCandidateUser);
      return res.json(tasks);
    }

    const filters: any = {};
    if (candidateId && candidateId !== "undefined" && candidateId !== "null") {
      filters.candidateId = candidateId as string;
    }

    const resolvedAssignee = (assigneeUserId as string) || (assigneeId as string);
    if (resolvedAssignee && resolvedAssignee !== "undefined" && resolvedAssignee !== "null") {
      if (resolvedAssignee !== req.user!.id && !hasAnyRole(req.user, ["system_admin", "hr_staff"])) {
        await logAuthorizationFailure({ req, resource: "general", action: "tasks:list:assignee", reason: "assignee_scope" });
        return res.status(403).json({ message: "Insufficient permissions" });
      }
      filters.assigneeId = resolvedAssignee;
    }

    const status = req.query.status as string | undefined;
    if (status) {
      filters.status = statusAliasToInternal(status);
    }

    const overdue = req.query.overdue === "true";
    const dueSoon = req.query.dueSoon === "true";
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;
    const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : 0;
    const sortBy = req.query.sortBy as string | undefined;
    const sortOrder = (req.query.sortOrder as string | undefined)?.toLowerCase() === "desc" ? "desc" : "asc";

    let tasks = await taskService.getTasks(filters, authContext);

    // Deadline filters
    const now = new Date();
    if (overdue) {
      tasks = tasks.filter((task: any) => task.dueAt && new Date(task.dueAt) < now && task.status !== "done" && task.status !== "canceled");
    }
    if (dueSoon) {
      const weekFromNow = new Date();
      weekFromNow.setDate(weekFromNow.getDate() + 7);
      tasks = tasks.filter((task: any) => task.dueAt && new Date(task.dueAt) >= now && new Date(task.dueAt) <= weekFromNow);
    }

    // Sorting
    if (sortBy === "dueDate") {
      tasks.sort((a: any, b: any) => {
        const aDue = a.dueAt ? new Date(a.dueAt).getTime() : Infinity;
        const bDue = b.dueAt ? new Date(b.dueAt).getTime() : Infinity;
        return sortOrder === "asc" ? aDue - bDue : bDue - aDue;
      });
    } else if (sortBy === "status") {
      tasks.sort((a: any, b: any) => {
        const aStatus = internalStatusToAlias(a.status) || "";
        const bStatus = internalStatusToAlias(b.status) || "";
        if (aStatus === bStatus) return 0;
        return sortOrder === "asc" ? (aStatus < bStatus ? -1 : 1) : (aStatus < bStatus ? 1 : -1);
      });
    }

    // Pagination
    if (Number.isFinite(limit)) {
      tasks = tasks.slice(offset ?? 0, (offset ?? 0) + (limit as number));
    }

    // Map status aliases and dueDate response
    tasks = tasks.map((task: any) => ({
      ...task,
      status: internalStatusToAlias(task.status),
      dueDate: task.dueAt ?? null
    }));

    if (!hasPrivilegedRole(req.user)) {
      tasks = tasks.map(sanitizeTaskForCandidateUser);
    }
    res.json(tasks);
  } catch (error) {
    next(error);
  }
});

// GET /api/tasks/mine - Get tasks assigned to current user
router.get("/tasks/mine", sensitiveRateLimiter, requireAuth, async (req, res, next) => {
  try {
    const userId = req.user!.id;

    // Get user preferences to use as defaults
    const userService = getUserService();
    const preferences = await userService.getUserPreferences(userId);
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

    const authContext = authorizationService.buildContext(req.user);
    const taskService = getTaskService();
    let tasks = await taskService.getTasks({
      assigneeId: userId,
      includeClosed,
      showArchived,
      showCanceled,
      showCompleted
    }, authContext);
    if (!hasPrivilegedRole(req.user)) {
      tasks = tasks.map(sanitizeTaskForCandidateUser);
    }
    res.json(tasks);
  } catch (error) {
    next(error);
  }
});

// GET /api/tasks/dashboard - Get all tasks from active/on_hold candidates for KPI calculations
router.get("/tasks/dashboard", requireAuth, async (req, res, next) => {
  try {
    if (!hasAnyRole(req.user, ["system_admin", "hr_staff"])) {
      await logAuthorizationFailure({ req, resource: "general", action: "tasks:dashboard", reason: "role_mismatch" });
      return res.status(403).json({ message: "Insufficient permissions" });
    }
    const taskService = getTaskService();
    const tasks = await taskService.getDashboardTasks();
    res.json(tasks);
  } catch (error) {
    next(error);
  }
});

// GET /api/tasks/:id - Get a specific task by ID
router.get("/tasks/:id", sensitiveRateLimiter, requireAuth, async (req, res, next) => {
  try {
    // Note: fetchTaskWithAccess still uses storage, but it's mainly for authorization check
    // We could refactor this to use service, but keeping it simple for now
    const result = await fetchTaskWithAccess(req, res, req.params.id, "task:read");
    if (!result) return;
    const raw = hasPrivilegedRole(req.user) ? result.task : sanitizeTaskForCandidateUser(result.task);
    const response = {
      ...raw,
      status: internalStatusToAlias((raw as any).status),
      dueDate: (raw as any).dueAt ?? (raw as any).dueDate ?? null
    };
    res.json(response);
  } catch (error) {
    next(error);
  }
});

// POST /api/tasks - Create a new task
router.post("/tasks", requireAuth, async (req, res, next) => {
  try {
    // Validate candidate_id is required
    if (!req.body.candidateId) {
      return res.status(400).json({ message: "candidate_id is required" });
    }

    if (!hasAnyRole(req.user, ["system_admin", "hr_staff"])) {
      await logAuthorizationFailure({ req, resource: "task", resourceId: req.body.candidateId, action: "task:create", reason: "role_mismatch" });
      return res.status(403).json({ message: "Insufficient permissions" });
    }

    const candidateService = getCandidateService();
    const candidate = await candidateService.getCandidate(req.body.candidateId, authorizationService.buildContext(req.user));
    if (!candidate) {
      return res.status(400).json({ message: "Invalid candidate" });
    }

    const body = { ...req.body };
    if (body.assigneeId && !body.assigneeUserId) {
      body.assigneeUserId = body.assigneeId;
    }
    if (body.priorityId && !body.priority) {
      // Map priorityId to enum name if provided
      const refData = getReferenceDataService();
      const priorities = await refData.getTaskPriorities();
      const match = priorities.find((p: any) => p.id === body.priorityId);
      if (match?.name) {
        body.priority = match.name;
      }
    }
    if (!body.priority) {
      body.priority = "medium";
    }
    if (!body.categoryId) {
      const refData = getReferenceDataService();
      const categories = await refData.getTaskCategories();
      if (categories[0]?.id) {
        body.categoryId = categories[0].id;
      }
    }
    if (!body.stageId) {
      body.stageId = (candidate as any).currentStageId || (candidate as any).currentStage?.id || req.body.stageId;
    }
    if (!body.assigneeKind) {
      body.assigneeKind = 'user';
    }
    if (body.status) {
      const mapped = statusAliasToInternal(body.status);
      const allowed = new Set(["todo", "in_progress", "blocked", "done", "canceled"]);
      if (!mapped || !allowed.has(mapped)) {
        return res.status(400).json({ message: "Invalid status value" });
      }
      body.status = mapped;
    }
    if (body.dueDate && !body.dueAt) {
      body.dueAt = new Date(body.dueDate);
    }

    const validatedData = insertCandidateTaskSchema.parse(body);

    if (!validatedData.assigneeKind) {
      validatedData.assigneeKind = 'user';
    }
    if (validatedData.assigneeKind === 'role') {
      validatedData.assigneeRole = validatedData.assigneeRole ?? 'candidate.self';
      if (validatedData.assigneeRole !== 'candidate.self') {
        return res.status(400).json({ message: 'assigneeRole must be candidate.self when assigneeKind is role' });
      }
    } else {
      validatedData.assigneeRole = null;
    }

    // If save_as_definition flag is set, create a task definition first
    if (body.save_as_definition && body.title && !body.taskDefId) {
      const refDataService = getReferenceDataService();
      const taskDef = await refDataService.createTaskDefinition({
        name: body.title,
        description: body.description || null,
        archived: false,
        createdBy: req.user!.id
      });
      validatedData.taskDefId = taskDef.id;
    }

    // Create task using service (handles event publishing)
    const taskService = getTaskService();
    const task = await taskService.createTask({
      data: validatedData,
      actorId: req.user?.id
    });

    // Integration concern: Emit deadline notifications
    try {
      await emitDeadlinesIfNeeded(task.id, { actorId: req.user!.id });
    } catch (notifyError) {
      console.error('Failed to emit deadlines:', notifyError);
    }

    res.status(201).json({
      ...task,
      status: internalStatusToAlias(task.status),
      dueDate: task.dueAt ?? null
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Invalid data", errors: error.errors });
    }
    next(error);
  }
});

// PATCH /api/tasks/:id - Update a task
router.patch("/tasks/:id", requireAuth, async (req, res, next) => {
  try {
    const body = { ...req.body };
    if (body.assigneeId && !body.assigneeUserId) {
      body.assigneeUserId = body.assigneeId;
    }
    if (body.dueDate && !body.dueAt) {
      body.dueAt = new Date(body.dueDate);
    }
    if (body.status) {
      const mapped = statusAliasToInternal(body.status);
      const allowed = new Set(["todo", "in_progress", "blocked", "done", "canceled"]);
      if (!mapped || !allowed.has(mapped)) {
        return res.status(400).json({ message: "Invalid status value" });
      }
      body.status = mapped;
    }

    const access = await fetchTaskWithAccess(req, res, req.params.id, "task:update");
    if (!access) return;
    const existingTask = access.task;
    const candidate = access.candidate;

    const canEdit = hasAnyRole(req.user, ["system_admin", "hr_staff", "department_admin", "division_leader", "manager"]) || existingTask.assigneeUserId === req.user!.id;
    if (!canEdit) {
      await logAuthorizationFailure({ req, resource: "task", resourceId: existingTask.id, action: "task:update", reason: "role_mismatch" });
      return res.status(403).json({ message: "Insufficient permissions to update this task" });
    }

    // Handle status transitions and attributes
    let updateData = { ...body };
    if (body.status === 'done' && !existingTask.completedAt) {
      updateData.completedAt = new Date();
    } else if (body.status !== 'done' && existingTask.completedAt) {
      updateData.completedAt = null;
    }

    // Treat canceled similar to done (non-blocking). Capture cancel_reason and who updated it.
    if (body.status === 'canceled') {
      // Accept both snake_case and camelCase from clients
      const incomingReason = (body.cancel_reason ?? body.cancelReason ?? '').toString();
      const reason = incomingReason.trim();
      if (!reason) {
        return res.status(400).json({ message: 'cancel_reason is required when canceling a task' });
      }
      // RBAC: Only hr_staff or system_admin can cancel required tasks
      if (existingTask.required && !hasAnyRole(req.user, ["hr_staff", "system_admin"])) {
        return res.status(403).json({ message: 'Only HR Staff or System Admin can cancel required tasks' });
      }
      updateData.cancelReason = reason;
      updateData.updatedBy = req.user!.id;
    }

    if (Object.prototype.hasOwnProperty.call(updateData, 'assigneeUserId')) {
      updateData.assigneeKind = updateData.assigneeUserId ? 'user' : 'user';
      updateData.assigneeRole = null;
      updateData.assigneeResolvedAt = updateData.assigneeUserId ? new Date() : null;
    }

    // Update task using service (handles event publishing)
    const taskService = getTaskService();
    const task = await taskService.updateTask({
      id: req.params.id,
      data: updateData,
      actorId: req.user?.id
    });

    if (!task) {
      return res.status(404).json({ message: "Task not found" });
    }

    const statusChanged = body.status && body.status !== existingTask.status;
    const dueChanged = Object.prototype.hasOwnProperty.call(updateData, 'dueAt');
    const completionChanged = Object.prototype.hasOwnProperty.call(updateData, 'completedAt');

    // Audit log on cancellation
    try {
      if (body.status === 'canceled') {
        await db.execute(sql`INSERT INTO audit_log (actor_id, candidate_id, task_id, event_type, details)
          VALUES (${req.user!.id}::uuid, ${existingTask.candidateId}::uuid, ${existingTask.id}::uuid, 'task_canceled', ${JSON.stringify({ reason: updateData.cancelReason })}::jsonb)`);
      }
    } catch (e) {
      console.error('audit log insert failed:', e);
    }

    // Recompute candidate blocked state and possible auto-regression
    let recompute: any = null;
    try {
      recompute = await recomputeCandidateStageState({ candidateId: existingTask.candidateId, invokerUserId: req.user!.id });
    } catch (e) {
      console.error('recomputeCandidateStageState error:', e);
    }

    // Check if stage should advance forward after task status change
    let advancement = null;
    if (body.status) {
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
      const candidateService = getCandidateService();
      updatedCandidate = await candidateService.getCandidate(existingTask.candidateId);
      try {
        // Publish candidateStageChanged event
        await eventBus.publish(candidateStageChanged(existingTask.candidateId, {
          previousStageId: advancement.fromStageId,
          newStageId: advancement.toStageId,
          stageName: advancement.toStageName || 'Unknown',
          automated: true // Stage changed automatically due to task completion
        }, {
          actorId: req.user?.id
        }));
      } catch (notifyError) {
        console.error('Failed to notify stage change:', notifyError);
      }
    }

    const responseTask = {
      ...(hasPrivilegedRole(req.user) ? task : sanitizeTaskForCandidateUser(task)),
      status: req.body.status ? internalStatusToAlias(task.status) : task.status,
      dueDate: (task as any).dueAt ?? (task as any).dueDate ?? null
    };

    res.json(responseTask);

    if (dueChanged || completionChanged || statusChanged) {
      await emitDeadlinesIfNeeded(task.id, { actorId: req.user!.id });
    }
  } catch (error) {
    next(error);
  }
});

// DELETE /api/tasks/:id - Soft delete a task (archive it)
router.delete("/tasks/:id", requireAuth, async (req, res, next) => {
  try {
    const access = await fetchTaskWithAccess(req, res, req.params.id, "task:delete");
    if (!access) return;
    const canDelete = hasAnyRole(req.user, ["system_admin", "hr_staff", "department_admin", "division_leader"]);
    if (!canDelete) {
      await logAuthorizationFailure({ req, resource: "task", resourceId: access.task.id, action: "task:delete", reason: "role_mismatch" });
      return res.status(403).json({ message: "Insufficient permissions" });
    }
    // Soft delete by archiving using service
    const taskService = getTaskService();
    if (typeof taskService.archiveTask === "function") {
      await taskService.archiveTask(req.params.id, req.user?.id);
    } else if (typeof taskService.deleteTask === "function") {
      await taskService.deleteTask(req.params.id);
    }
    res.status(200).json({ deleted: true });
  } catch (error) {
    next(error);
  }
});

// POST /api/tasks/bulk-update - Bulk update tasks
router.post("/tasks/bulk-update", requireAuth, requireRole(["system_admin", "hr_staff"]), async (req, res, next) => {
  try {
    const schema = z.object({
      taskIds: z.array(z.string().uuid()).nonempty(),
      updates: z.object({
        status: z.string().optional(),
        assigneeUserId: z.string().uuid().optional(),
        dueDate: z.string().datetime().optional()
      })
    });
    const parsed = schema.parse(req.body ?? {});
    const taskService = getTaskService();
    let updated = 0;
    for (const id of parsed.taskIds) {
      const existing = await taskService.getTask(id);
      if (!existing) {
        return res.status(400).json({ message: "Invalid task id" });
      }
    }

    for (const id of parsed.taskIds) {
      const data: any = {};
      if (parsed.updates.status) {
        const mapped = statusAliasToInternal(parsed.updates.status);
        const allowed = new Set(["todo", "in_progress", "blocked", "done", "canceled"]);
        if (!mapped || !allowed.has(mapped)) {
          return res.status(400).json({ message: "Invalid status value" });
        }
        data.status = mapped;
      }
      if (parsed.updates.assigneeUserId !== undefined) {
        data.assigneeUserId = parsed.updates.assigneeUserId;
      }
      if (parsed.updates.dueDate) {
        data.dueAt = new Date(parsed.updates.dueDate);
      }
      const task = await taskService.updateTask({ id, data, actorId: req.user?.id });
      if (task) {
        updated += 1;
      }
    }

    res.json({ updated });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Invalid payload", errors: error.errors });
    }
    next(error);
  }
});

// GET /api/tasks/:id/comments - Get comments for a task
router.get("/tasks/:id/comments", sensitiveRateLimiter, requireAuth, async (req: any, res, next) => {
  try {
    const access = await fetchTaskWithAccess(req, res, req.params.id, "task:comments:list");
    if (!access) return;
    const visibility = (req.query.visibility as string) || 'all';
    const cursor = req.query.cursor as string | undefined;
    const commentService = getCommentService();
    const data = await commentService.getTaskComments({ taskId: req.params.id, visibility: visibility as any, role: req.user.role, cursor });
    res.json(data);
  } catch (error) { next(error); }
});

// POST /api/tasks/:id/comments - Create a comment on a task
router.post("/tasks/:id/comments", sensitiveRateLimiter, requireAuth, async (req: any, res, next) => {
  try {
    const access = await fetchTaskWithAccess(req, res, req.params.id, "task:comments:create");
    if (!access) return;
    const { body, visibility, parentId } = req.body || {};
    if (!body || !visibility) return res.status(400).json({ message: 'body and visibility are required' });
    const commentService = getCommentService();
    const created = await commentService.createComment({ entityType: 'task', entityId: req.params.id, authorUserId: req.user.id, role: req.user.role, body, visibility, parentId });

    // Publish domain event
    const mentionKeys = extractMentionKeys(body);
    await eventBus.publish(commentCreated(created.id, {
      entityType: 'task',
      entityId: req.params.id,
      authorUserId: req.user.id,
      commentBody: body,
      visibility,
      mentionedUserKeys: mentionKeys,
      parentId
    }, {
      actorId: req.user?.id
    }));

    // NOTE: Notifications are now handled by the event system (comment.created event)
    // The notification handler in server/events/handlers/notification-handler.ts
    // automatically creates notifications for watchers and mentioned users

    res.status(201).json(created);
  } catch (error: any) { res.status(400).json({ message: error.message || 'Unable to create comment' }); }
});

export default router;
