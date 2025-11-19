import { Router } from "express";
import { z } from "zod";
import { sql } from "drizzle-orm";
import { requireAuth, requireRole } from "../middleware/authorization";
import { sensitiveRateLimiter } from "../middleware/rate-limiter";
import { storage } from "../db/storage";
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
import { eventBus, taskAssigned, taskStatusChanged, taskCompleted, commentCreated } from "../events";

const router = Router();

// GET /api/tasks - Get tasks with filtering (candidate or assignee required)
router.get("/tasks", sensitiveRateLimiter, requireAuth, async (req, res, next) => {
  try {
    const { candidateId, assigneeId } = req.query;
    const authContext = storage.buildAuthorizationContext(req.user);
    const roleSet = authContext.roles;

    if (!hasPrivilegedRole(req.user) && roleSet.has("candidate")) {
      let tasks = await storage.getCandidateTasks({ assigneeId: req.user!.id }, authContext);
      tasks = tasks.map(sanitizeTaskForCandidateUser);
      return res.json(tasks);
    }

    if (!candidateId && !assigneeId) {
      return res.status(400).json({ message: "candidateId or assigneeId parameter is required" });
    }

    if (candidateId && (candidateId === 'undefined' || candidateId === 'null')) {
      return res.status(400).json({ message: "Invalid candidateId" });
    }
    if (assigneeId && (assigneeId === 'undefined' || assigneeId === 'null')) {
      return res.status(400).json({ message: "Invalid assigneeId" });
    }

    const filters: any = {};
    if (candidateId) {
      const candidate = await storage.getCandidate(candidateId as string, authContext);
      if (!candidate) {
        await logAuthorizationFailure({ req, resource: "candidate", resourceId: candidateId as string, action: "tasks:list", reason: "scope_mismatch" });
        return res.status(403).json({ message: "Insufficient permissions" });
      }
      filters.candidateId = candidateId as string;
    }

    if (assigneeId) {
      if (assigneeId !== req.user!.id && !hasAnyRole(req.user, ["system_admin", "hr_staff"])) {
        await logAuthorizationFailure({ req, resource: "general", action: "tasks:list:assignee", reason: "assignee_scope" });
        return res.status(403).json({ message: "Insufficient permissions" });
      }
      filters.assigneeId = assigneeId as string;
    }

    let tasks = await storage.getCandidateTasks(filters, authContext);
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

    const authContext = storage.buildAuthorizationContext(req.user);
    let tasks = await storage.getCandidateTasks({
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
    const tasks = await storage.getDashboardTasks();
    res.json(tasks);
  } catch (error) {
    next(error);
  }
});

// GET /api/tasks/:id - Get a specific task by ID
router.get("/tasks/:id", sensitiveRateLimiter, requireAuth, async (req, res, next) => {
  try {
    const result = await fetchTaskWithAccess(req, res, req.params.id, "task:read");
    if (!result) return;
    const response = hasPrivilegedRole(req.user) ? result.task : sanitizeTaskForCandidateUser(result.task);
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

    if (!hasPrivilegedRole(req.user)) {
      await logAuthorizationFailure({ req, resource: "task", resourceId: req.body.candidateId, action: "task:create", reason: "role_mismatch" });
      return res.status(403).json({ message: "Insufficient permissions" });
    }

    if (!(await fetchCandidateWithAccess(req, res, req.body.candidateId, "task:create"))) return;

    const body = { ...req.body };
    if (body.assigneeId && !body.assigneeUserId) {
      body.assigneeUserId = body.assigneeId;
    }
    if (!body.assigneeKind) {
      body.assigneeKind = 'user';
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
      const taskDef = await storage.createTaskDefinition({
        name: body.title,
        description: body.description || null,
        archived: false,
        createdBy: req.user!.id
      });
      validatedData.taskDefId = taskDef.id;
    }

    const task = await storage.createCandidateTask(validatedData);

    try {
      await notifyTaskAssignees(task, req.user!, 'assignment');
      await emitDeadlinesIfNeeded(task.id, { actorId: req.user!.id });
    } catch (notifyError) {
      console.error('Failed to dispatch task assignment notification:', notifyError);
    }

    res.status(201).json(task);
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

    const task = await storage.updateCandidateTask(req.params.id, updateData);
    if (!task) {
      return res.status(404).json({ message: "Task not found" });
    }

    const assignmentChanged = Boolean(task.assigneeKind === 'user' && task.assigneeUserId && task.assigneeUserId !== existingTask.assigneeUserId);
    const statusChanged = body.status && body.status !== existingTask.status;
    const dueChanged = Object.prototype.hasOwnProperty.call(updateData, 'dueAt');
    const completionChanged = Object.prototype.hasOwnProperty.call(updateData, 'completedAt');

    if (assignmentChanged) {
      try {
        await notifyTaskAssignees(task, req.user!, 'assignment', { previousAssigneeId: existingTask.assigneeUserId });

        // Publish taskAssigned event
        if (task.assigneeUserId) {
          await eventBus.publish(taskAssigned(task.id, {
            candidateId: task.candidateId,
            taskTitle: task.title,
            assigneeUserId: task.assigneeUserId,
            previousAssigneeId: existingTask.assigneeUserId,
            dueAt: task.dueAt
          }, {
            actorId: req.user?.id
          }));
        }
      } catch (notifyError) {
        console.error('Failed to notify assignment change:', notifyError);
      }
    }

    if (statusChanged) {
      try {
        await notifyTaskAssignees(task, req.user!, 'status_change', {
          previousStatus: existingTask.status,
          newStatus: task.status
        });

        // Publish taskStatusChanged event
        await eventBus.publish(taskStatusChanged(task.id, {
          candidateId: task.candidateId,
          taskTitle: task.title,
          previousStatus: existingTask.status,
          newStatus: task.status,
          assigneeUserId: task.assigneeUserId
        }, {
          actorId: req.user?.id
        }));

        // Publish taskCompleted event if status changed to done
        if (task.status === 'done' && task.completedAt) {
          const wasOverdue = !!(task.dueAt && task.dueAt < task.completedAt);
          await eventBus.publish(taskCompleted(task.id, {
            candidateId: task.candidateId,
            taskTitle: task.title,
            completedBy: req.user!.id,
            completedAt: task.completedAt,
            dueAt: task.dueAt,
            wasOverdue
          }, {
            actorId: req.user?.id
          }));
        }
      } catch (notifyError) {
        console.error('Failed to notify task status change:', notifyError);
      }
    }

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
      updatedCandidate = await storage.getCandidate(existingTask.candidateId);
      try {
        await notifyCandidateStageChange({
          candidateId: existingTask.candidateId,
          actor: req.user!,
          fromStageId: advancement.fromStageId,
          toStageId: advancement.toStageId,
          toStageName: advancement.toStageName
        });
      } catch (notifyError) {
        console.error('Failed to notify stage change:', notifyError);
      }
    }

    // Return comprehensive response with task, candidate state, and advancement info
    res.json({
      task: hasPrivilegedRole(req.user) ? task : sanitizeTaskForCandidateUser(task),
      candidate: hasPrivilegedRole(req.user) && updatedCandidate ? {
        id: updatedCandidate.id,
        current_stage_id: updatedCandidate.currentStageId,
        updated_at: updatedCandidate.updatedAt
      } : null,
      advancement: advancement?.advanced ? {
        advanced: true,
        fromStageId: advancement.fromStageId,
        toStageId: advancement.toStageId,
        toStageName: advancement.toStageName
      } : { advanced: false },
      recompute: hasPrivilegedRole(req.user) && recompute ? {
        isBlocked: !!recompute.isBlocked,
        autoRegress: !!recompute.autoRegress,
        regressed: !!recompute.regressed
      } : null
    });

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
    const canDelete = hasAnyRole(req.user, ["system_admin", "hr_staff", "department_admin", "division_leader", "manager"]) || access.task.assigneeUserId === req.user!.id;
    if (!canDelete) {
      await logAuthorizationFailure({ req, resource: "task", resourceId: access.task.id, action: "task:delete", reason: "role_mismatch" });
      return res.status(403).json({ message: "Insufficient permissions" });
    }
    // Soft delete by archiving
    await storage.archiveCandidateTask(req.params.id);
    res.sendStatus(204);
  } catch (error) {
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
    const data = await storage.getTaskComments({ taskId: req.params.id, visibility: visibility as any, role: req.user.role, cursor });
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
    const created = await storage.createComment({ entityType: 'task', entityId: req.params.id, authorUserId: req.user.id, role: req.user.role, body, visibility, parentId });

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
