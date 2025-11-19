import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRole } from "../middleware/authorization";
import { sensitiveRateLimiter } from "../middleware/rate-limiter";
import { storage } from "../db/storage";
import { db } from "../db/connection";
import { insertCandidateSchema } from "@shared/schemas";
import {
  fetchCandidateWithAccess,
  hasPrivilegedRole,
  hasAnyRole,
  logAuthorizationFailure,
} from "../utils/authorization.utils";
import {
  sanitizeCandidateForCandidateUser,
  sanitizeTaskForCandidateUser,
} from "../utils/sanitization.utils";
import {
  buildActorLabel,
  buildCommentSnippet,
  gatherCandidateNotificationContext,
  gatherCandidateAssigneeIds,
  notifyCandidateStageChange,
  notifyTaskAssignees,
} from "../utils/notification.utils";
import {
  createNotifications,
  extractMentionKeys,
  resolveMentionedUsers,
} from "../features/notifications/services";
import { emitDeadlinesIfNeeded } from "../features/notifications/deadline-helpers";
import { emitOwnerChanged } from "../features/notifications/owner-change";
import { authorizationService } from "../services/authorization";
import { eventBus, candidateCreated, candidateStatusChanged, candidateStageChanged } from "../events";

const router = Router();

// GET /api/candidates - List all candidates with authorization scope
router.get("/candidates", sensitiveRateLimiter, requireAuth, async (req, res, next) => {
  try {
    const includeArchived = req.query.includeArchived === "true";
    const filters: Record<string, any> = { includeArchived };
    const authContext = storage.buildAuthorizationContext(req.user);

    if (!authContext.privileged && authContext.roles.size === 0) {
      await logAuthorizationFailure({ req, resource: "candidate", action: "candidate:list", reason: "no_scope" });
      return res.status(403).json({ message: "Insufficient permissions" });
    }

    const candidates = await storage.getCandidates(filters, authContext);
    const response = hasPrivilegedRole(req.user)
      ? candidates
      : candidates.map(sanitizeCandidateForCandidateUser);
    res.json(response);
  } catch (error) {
    next(error);
  }
});

// GET /api/candidates/:id - Get a single candidate by ID
router.get("/candidates/:id", sensitiveRateLimiter, requireAuth, async (req, res, next) => {
  try {
    // Build authorization context
    const authContext = authorizationService.buildContext(req.user);

    // Fetch candidate (no auth check yet)
    const candidate = await storage.getCandidate(req.params.id);
    if (!candidate) {
      return res.status(404).json({ message: "Candidate not found" });
    }

    // Authorize access using AuthorizationService
    const authorized = await authorizationService.authorizeCandidateOrRespond(
      req, res, authContext, candidate, "view"
    );

    if (!authorized) {
      return; // Response already sent
    }

    // Sanitize response if candidate viewing their own record
    const response = authContext.isCandidate && authContext.userId === candidate.linkedUserId
      ? sanitizeCandidateForCandidateUser(candidate)
      : candidate;

    res.json(response);
  } catch (error) {
    next(error);
  }
});

// POST /api/candidates - Create a new candidate
router.post("/candidates", requireAuth, requireRole(["system_admin", "hr_staff", "department_admin", "division_leader", "manager"]), async (req, res, next) => {
  try {
    // Build authorization context
    const authContext = authorizationService.buildContext(req.user);

    // Check scope-based permissions
    if (authContext.roles.has("department_admin") || authContext.roles.has("manager")) {
      if (!req.body.departmentId || !authContext.departmentIds.has(req.body.departmentId)) {
        return res.status(403).json({ message: "Insufficient department scope to create candidate" });
      }
    }

    if (authContext.roles.has("division_leader")) {
      if (!req.body.divisionId || !authContext.divisionIds.has(req.body.divisionId)) {
        return res.status(403).json({ message: "Insufficient division scope to create candidate" });
      }
    }

    // Check for duplicate email in the same department
    const existingCandidates = await storage.getCandidates({ departmentId: req.body.departmentId }, authContext);
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
      status: "active" as const,
      primaryOwnerId: req.user!.id
    };

    const candidate = await storage.createCandidate(candidateData);

    // Publish candidateCreated event
    await eventBus.publish(candidateCreated(candidate.id, {
      firstName: candidate.firstName,
      lastName: candidate.lastName,
      email: candidate.email,
      departmentId: candidate.departmentId,
      divisionId: candidate.divisionId,
      managerId: candidate.managerId
    }, {
      actorId: req.user?.id
    }));

    res.status(201).json(candidate);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Invalid data", errors: error.errors });
    }
    next(error);
  }
});

// PATCH /api/candidates/:id - Update a candidate
router.patch("/candidates/:id", requireAuth, requireRole(["system_admin", "hr_staff"]), async (req, res, next) => {
  try {
    const previousCandidate = await storage.getCandidate(req.params.id);
    // Define allowed editable fields
    const allowedFields = [
      'salutation',
      'firstName',
      'lastName',
      'email',
      'departmentId',
      'divisionId',
      'managerId',
      'facultyRankId',
      'status',
      'primaryOwnerId',
      'linkedUserId',
      'offerLetterIssuedAt',
      'offerLetterAcceptedAt',
      'anticipatedStartDate'
    ];
    const immutableFields = ['templateAppliedFromId', 'candidateTypeId'];
    const nullableIdFields = new Set([
      'divisionId',
      'managerId',
      'facultyRankId',
      'primaryOwnerId',
      'linkedUserId'
    ]);

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
        const value = req.body[field];
        updateData[field] = nullableIdFields.has(field) && value === '' ? null : value;
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

    if (previousCandidate && fullCandidate) {
      const anchorFields = ['offerLetterIssuedAt', 'offerLetterAcceptedAt', 'anticipatedStartDate'] as const;
      const anchorChanged = anchorFields.some((field) => {
        const beforeValue = (previousCandidate as any)[field];
        const afterValue = (fullCandidate as any)[field];
        const before = beforeValue ? new Date(beforeValue as any).getTime() : null;
        const after = afterValue ? new Date(afterValue as any).getTime() : null;
        return before !== after;
      });

      if (anchorChanged) {
        await storage.recomputeCandidateDueDates(fullCandidate.id);
      }
    }

    if (previousCandidate && fullCandidate && previousCandidate.primaryOwnerId !== fullCandidate.primaryOwnerId) {
      await emitOwnerChanged({
        candidate: fullCandidate,
        previousOwnerId: previousCandidate.primaryOwnerId,
        newOwnerId: fullCandidate.primaryOwnerId,
        actorId: req.user!.id,
      });
    }

    if (previousCandidate && fullCandidate && previousCandidate.linkedUserId !== fullCandidate.linkedUserId && fullCandidate.linkedUserId) {
      const resolvedTasks = await storage.resolveCandidateSelfAssignments(fullCandidate.id, fullCandidate.linkedUserId);
      if (resolvedTasks.length > 0) {
        for (const task of resolvedTasks) {
          await notifyTaskAssignees(task, req.user!, 'assignment');
          await emitDeadlinesIfNeeded(task.id, { actorId: req.user!.id });
        }
      }
    }

    res.json(fullCandidate);
  } catch (error) {
    next(error);
  }
});

// DELETE /api/candidates/:id - Archive candidate (soft delete)
router.delete("/candidates/:id", requireAuth, requireRole(["system_admin", "hr_staff"]), async (req, res, next) => {
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

// POST /api/candidates/:id/restore - Restore archived candidate
router.post("/candidates/:id/restore", requireAuth, requireRole(["system_admin", "hr_staff"]), async (req, res, next) => {
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

// GET /api/candidates/:id/tasks - Get tasks for a candidate
router.get("/candidates/:id/tasks", sensitiveRateLimiter, requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!(await fetchCandidateWithAccess(req, res, id, "candidate:tasks:list"))) return;

    const authContext = storage.buildAuthorizationContext(req.user);
    let tasks = await storage.getCandidateTasks({ candidateId: id }, authContext);
    if (!hasPrivilegedRole(req.user)) {
      tasks = tasks.map(sanitizeTaskForCandidateUser);
    }
    res.json(tasks);
  } catch (error) {
    next(error);
  }
});

// GET /api/candidates/:id/stages - Get stages for a candidate
router.get("/candidates/:id/stages", requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!(await fetchCandidateWithAccess(req, res, id, "candidate:stages:list"))) return;
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

// GET /api/candidates/:id/stage-history - Get stage history for a candidate
router.get("/candidates/:id/stage-history", requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!(await fetchCandidateWithAccess(req, res, id, "candidate:stage-history:list"))) return;
    const history = await storage.getCandidateStageHistory(id);
    res.json({ history });
  } catch (error) {
    next(error);
  }
});

// GET /api/candidates/:id/comments - Get comments for a candidate
router.get("/candidates/:id/comments", sensitiveRateLimiter, requireAuth, async (req: any, res, next) => {
  try {
    if (!(await fetchCandidateWithAccess(req, res, req.params.id, "candidate:comments:list"))) return;
    const visibility = (req.query.visibility as string) || 'all';
    const cursor = req.query.cursor as string | undefined;
    const data = await storage.getCandidateComments({ candidateId: req.params.id, visibility: visibility as any, role: req.user.role, cursor });
    res.json(data);
  } catch (error) { next(error); }
});

// POST /api/candidates/:id/comments - Create a comment on a candidate
router.post("/candidates/:id/comments", sensitiveRateLimiter, requireAuth, async (req: any, res, next) => {
  try {
    if (!(await fetchCandidateWithAccess(req, res, req.params.id, "candidate:comments:create"))) return;
    const { body, visibility, parentId } = req.body || {};
    if (!body || !visibility) return res.status(400).json({ message: 'body and visibility are required' });
    const created = await storage.createComment({ entityType: 'candidate', entityId: req.params.id, authorUserId: req.user.id, role: req.user.role, body, visibility, parentId });

    try {
      const candidateId = req.params.id;
      const snippet = buildCommentSnippet(body);
      const actorName = buildActorLabel(req.user!);
      const mentionKeys = extractMentionKeys(body);
      const [context, mentionedUsers] = await Promise.all([
        gatherCandidateNotificationContext(candidateId),
        mentionKeys.length > 0 ? resolveMentionedUsers(mentionKeys) : Promise.resolve([])
      ]);

      const watcherIds = new Set(context.watcherIds);
      const mentionRecipientIds = new Set<string>();
      for (const user of mentionedUsers) {
        mentionRecipientIds.add(user.id);
        watcherIds.delete(user.id);
      }

      const basePayload = {
        actor: { id: req.user.id, name: actorName },
        comment: {
          id: created.id,
          preview: snippet,
          visibility
        },
        candidate: context.candidate ? {
          id: context.candidate.id,
          name: `${context.candidate.firstName} ${context.candidate.lastName}`
        } : { id: candidateId },
        source: 'candidate'
      } as const;

      const watcherList = Array.from(watcherIds);
      if (watcherList.length > 0) {
        await createNotifications({
          type: "comment.created",
          actorId: req.user.id,
          recipients: watcherList,
          entity: { type: "comment", id: created.id },
          payload: { ...basePayload, reason: 'comment' },
          visibility
        });
      }

      if (mentionRecipientIds.size > 0) {
        await createNotifications({
          type: "mention",
          actorId: req.user.id,
          recipients: Array.from(mentionRecipientIds),
          entity: { type: "comment", id: created.id },
          payload: {
            ...basePayload,
            reason: 'mention',
            mentions: mentionedUsers.map((user) => ({ id: user.id, mentionKey: user.mentionKey }))
          },
          visibility
        });
      }
    } catch (notifyError) {
      console.error('Failed to dispatch candidate comment notifications:', notifyError);
    }

    res.status(201).json(created);
  } catch (error: any) { res.status(400).json({ message: error.message || 'Unable to create comment' }); }
});

// GET /api/candidates/:id/comment-stats - Get comment statistics for a candidate
router.get("/candidates/:id/comment-stats", sensitiveRateLimiter, requireAuth, async (req: any, res, next) => {
  try {
    if (!(await fetchCandidateWithAccess(req, res, req.params.id, "candidate:comments:stats"))) return;
    const stats = await storage.getCommentStats({ candidateId: req.params.id, role: req.user.role });
    res.json(stats);
  } catch (error) { next(error); }
});

// POST /api/candidates/:id/apply-template - Apply template to candidate
router.post("/candidates/:id/apply-template", requireAuth, requireRole(["system_admin", "hr_staff", "department_admin", "division_leader", "manager"]), async (req, res, next) => {
  try {
    const { template_id } = req.body;

    console.log('Applying template:', { candidateId: req.params.id, template_id, userId: req.user!.id });

    if (!template_id) {
      console.log('Template application failed: template_id is required');
      return res.status(400).json({ message: "template_id is required" });
    }

    if (!(await fetchCandidateWithAccess(req, res, req.params.id, "candidate:apply-template"))) return;

    const expansion = await storage.expandTemplate(template_id, req.params.id, req.user!.id);

    try {
      await Promise.all(
        expansion.createdTasks.map((task) => notifyTaskAssignees(task, req.user!, 'assignment'))
      );
    } catch (notifyError) {
      console.error('Failed to dispatch template task assignment notifications:', notifyError);
    }

    console.log('Template applied successfully:', { taskCount: expansion.createdCount });
    res.json({ message: "Template applied successfully", tasksCreated: expansion.createdCount });
  } catch (error: any) {
    console.error('Template application failed:', error);
    if (error.message) {
      return res.status(400).json({ message: error.message });
    }
    next(error);
  }
});

// POST /api/candidates/:id/recompute-due-dates - Recompute due dates for candidate tasks
router.post("/candidates/:id/recompute-due-dates", requireAuth, requireRole(["system_admin", "hr_staff"]), async (req, res, next) => {
  try {
    const candidateId = req.params.id;
    const result = await storage.recomputeCandidateDueDates(candidateId);
    const candidate = await storage.getCandidate(candidateId);
    res.json({ updated: result.updated, candidate });
  } catch (error) {
    next(error);
  }
});

export default router;
