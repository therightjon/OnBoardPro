import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRole } from "../middleware/authorization";
import { sensitiveRateLimiter } from "../middleware/rate-limiter";
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
import { eventBus, candidateCreated, candidateStatusChanged, candidateStageChanged, taskCreated, taskAssigned, commentCreated } from "../events";
import { getCandidateService, getTaskService, getCommentService, getReferenceDataService, getTemplateExpansionService, getTaskDueDateService } from "../services/service-factory";
import { CandidateValidationError } from "../services/candidates/candidate.service";
import { shouldAutoApplyTemplate } from "../utils/hiring-phase.utils";

const router = Router();

/**
 * @swagger
 * /api/candidates:
 *   get:
 *     summary: List all candidates
 *     description: |
 *       Retrieves a list of all candidates visible to the authenticated user.
 *       Results are scoped based on user role and department/division assignments.
 *     tags:
 *       - Candidate Management
 *     security:
 *       - sessionCookie: []
 *     parameters:
 *       - in: query
 *         name: includeArchived
 *         schema:
 *           type: boolean
 *         description: Include archived candidates in results
 *     responses:
 *       200:
 *         description: List of candidates
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Candidate'
 *       401:
 *         description: Not authenticated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: Insufficient permissions
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get("/candidates", sensitiveRateLimiter, requireAuth, async (req, res, next) => {
  try {
    const includeArchived = req.query.includeArchived === "true";
    const filters: Record<string, any> = { includeArchived };
    const authContext = authorizationService.buildContext(req.user);

    if (!authContext.privileged && authContext.roles.size === 0) {
      await logAuthorizationFailure({ req, resource: "candidate", action: "candidate:list", reason: "no_scope" });
      return res.status(403).json({ message: "Insufficient permissions" });
    }

    const candidateService = getCandidateService();
    const candidates = await candidateService.getCandidates(filters, authContext);
    const response = hasPrivilegedRole(req.user)
      ? candidates
      : candidates.map(sanitizeCandidateForCandidateUser);
    res.json(response);
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/candidates/{id}:
 *   get:
 *     summary: Get candidate by ID
 *     description: Retrieves a single candidate by their unique identifier
 *     tags:
 *       - Candidate Management
 *     security:
 *       - sessionCookie: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Candidate ID
 *     responses:
 *       200:
 *         description: Candidate details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Candidate'
 *       404:
 *         description: Candidate not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: Insufficient permissions to view this candidate
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get("/candidates/:id", sensitiveRateLimiter, requireAuth, async (req, res, next) => {
  try {
    // Build authorization context
    const authContext = authorizationService.buildContext(req.user);

    // Fetch candidate using service
    const candidateService = getCandidateService();
    const candidate = await candidateService.getCandidate(req.params.id, authContext);
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

/**
 * @swagger
 * /api/candidates:
 *   post:
 *     summary: Create a new candidate
 *     description: |
 *       Creates a new candidate in the system.
 *       Validates email uniqueness within the department and enforces business rules.
 *       Publishes a `candidate.created` domain event.
 *     tags:
 *       - Candidate Management
 *     security:
 *       - sessionCookie: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - firstName
 *               - lastName
 *               - email
 *               - candidateTypeId
 *               - departmentId
 *             properties:
 *               firstName:
 *                 type: string
 *                 example: John
 *               lastName:
 *                 type: string
 *                 example: Doe
 *               email:
 *                 type: string
 *                 format: email
 *                 example: john.doe@example.com
 *               candidateTypeId:
 *                 type: string
 *                 format: uuid
 *                 description: Type of candidate (e.g., Faculty, Staff)
 *               departmentId:
 *                 type: string
 *                 format: uuid
 *                 description: Department assignment
 *               divisionId:
 *                 type: string
 *                 format: uuid
 *                 description: Division assignment (optional)
 *               managerId:
 *                 type: string
 *                 format: uuid
 *                 description: Manager assignment (optional)
 *               facultyRankId:
 *                 type: string
 *                 format: uuid
 *                 description: Faculty rank (required for Faculty types)
 *     responses:
 *       201:
 *         description: Candidate created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Candidate'
 *       400:
 *         description: Validation error or duplicate email
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *             examples:
 *               duplicate:
 *                 value:
 *                   message: Email already exists in this department
 *               validation:
 *                 value:
 *                   message: Invalid data
 *                   errors: []
 *       403:
 *         description: Insufficient permissions
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post("/candidates", requireAuth, requireRole(["system_admin", "hr_staff", "department_admin", "division_leader", "manager"]), async (req, res, next) => {
  try {
    // Build authorization context
    const authContext = authorizationService.buildContext(req.user);

    // Check scope-based permissions (HTTP/Authorization layer)
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

    // Faculty rank validation for faculty candidate types
    const refDataService = getReferenceDataService();
    const candidateTypes = await refDataService.getCandidateTypes();
    const candidateType = candidateTypes.find(type => type.id === req.body.candidateTypeId);

    if (candidateType && (candidateType.name === 'Faculty' || candidateType.name === 'Faculty Clinical')) {
      if (!req.body.facultyRankId) {
        return res.status(400).json({ message: "Faculty Rank is required for Faculty and Faculty Clinical candidate types" });
      }
    }

    // NEW: Validate required fields for deferred template application flow
    if (!req.body.letterOfIntentDate) {
      return res.status(400).json({ message: "Letter of Intent date is required" });
    }
    if (!req.body.templateId) {
      return res.status(400).json({ message: "Template is required" });
    }

    // Validate input
    const validatedData = insertCandidateSchema.parse(req.body);
    
    // NEW: Set up candidate with deferred template application
    // Template is selected (templateAppliedFromId) but not yet applied (templateAppliedAt = null)
    // Template will be expanded when LOO is accepted
    const candidateData = {
      ...validatedData,
      status: "active" as const,
      primaryOwnerId: req.user!.id,
      // Store templateId as selected template (deferred application)
      templateAppliedFromId: req.body.templateId,
      templateLocked: true, // Lock template selection - cannot be changed after creation
      templateAppliedAt: null, // NULL indicates template is selected but not yet applied
    };

    // Use service for business logic (duplicate checking, event publishing)
    const candidateService = getCandidateService();
    const candidate = await candidateService.createCandidate({
      data: candidateData,
      actorId: req.user?.id,
      authContext
    });

    res.status(201).json(candidate);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Invalid data", errors: error.errors });
    }
    if (error instanceof CandidateValidationError) {
      return res.status(400).json({ message: error.message });
    }
    next(error);
  }
});

// PATCH /api/candidates/:id - Update a candidate
router.patch("/candidates/:id", requireAuth, requireRole(["system_admin", "hr_staff"]), async (req, res, next) => {
  try {
    const candidateService = getCandidateService();
    const authContext = authorizationService.buildContext(req.user);

    // Get existing candidate before update
    const previousCandidate = await candidateService.getCandidate(req.params.id, authContext);
    if (!previousCandidate) {
      return res.status(404).json({ message: "Candidate not found" });
    }

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
    const dateFields = new Set([
      'offerLetterIssuedAt',
      'offerLetterAcceptedAt',
      'anticipatedStartDate'
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
        let value = req.body[field];
        // Coerce date strings to Date objects for timestamp fields
        if (dateFields.has(field) && value !== null) {
          value = value ? new Date(value) : null;
        }
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

    // Update candidate using service (handles events)
    const candidate = await candidateService.updateCandidate({
      id: req.params.id,
      data: updateData,
      actorId: req.user?.id,
      authContext
    });

    if (!candidate) {
      return res.status(404).json({ message: "Candidate not found" });
    }

    // Refetch full candidate with joined data
    const fullCandidate = await candidateService.getCandidate(req.params.id, authContext);
    if (!fullCandidate) {
      return res.status(404).json({ message: "Candidate not found" });
    }

    // Integration concerns: Recompute due dates if anchor dates changed
    const anchorFields = ['offerLetterIssuedAt', 'offerLetterAcceptedAt', 'anticipatedStartDate'] as const;
    const anchorChanged = anchorFields.some((field) => {
      const beforeValue = (previousCandidate as any)[field];
      const afterValue = (fullCandidate as any)[field];
      const before = beforeValue ? new Date(beforeValue as any).getTime() : null;
      const after = afterValue ? new Date(afterValue as any).getTime() : null;
      return before !== after;
    });

    if (anchorChanged) {
      const taskDueDateService = getTaskDueDateService();
      await taskDueDateService.recomputeCandidateDueDates(fullCandidate.id);
    }

    // Integration concerns: Auto-apply template when LOO is accepted (deferred template application)
    // Check if LOO acceptance is being set and template should be auto-applied
    console.log('Checking LOO acceptance auto-apply:', {
      previousOfferLetterAcceptedAt: previousCandidate.offerLetterAcceptedAt,
      newOfferLetterAcceptedAt: updateData.offerLetterAcceptedAt,
      templateAppliedFromId: previousCandidate.templateAppliedFromId,
      templateAppliedAt: previousCandidate.templateAppliedAt,
    });
    const shouldApplyTemplate = shouldAutoApplyTemplate(
      previousCandidate,
      updateData.offerLetterAcceptedAt
    );
    console.log('shouldApplyTemplate result:', shouldApplyTemplate);
    
    let templateExpansionResult = null;
    if (shouldApplyTemplate && fullCandidate.templateAppliedFromId) {
      try {
        console.log('Auto-applying deferred template on LOO acceptance:', { 
          candidateId: fullCandidate.id, 
          templateId: fullCandidate.templateAppliedFromId 
        });
        
        templateExpansionResult = await getTemplateExpansionService().expandTemplate(
          fullCandidate.templateAppliedFromId,
          fullCandidate.id,
          req.user!.id
        );
        
        // Publish taskCreated events for all tasks created from template
        await Promise.all(
          templateExpansionResult.createdTasks.map((task) =>
            eventBus.publish(taskCreated(task.id, {
              candidateId: task.candidateId,
              title: task.title,
              assigneeUserId: task.assigneeUserId,
              assigneeRole: task.assigneeKind === 'role' ? task.assigneeRole : null,
              dueAt: task.dueAt,
              isRequired: false,
              fromTemplate: true
            }, {
              actorId: req.user?.id
            }))
          )
        );
        
        console.log('Template auto-applied successfully:', { 
          taskCount: templateExpansionResult.createdCount 
        });
      } catch (templateError: any) {
        console.error('Failed to auto-apply template on LOO acceptance:', templateError);
        // Don't fail the whole request - the LOO acceptance was recorded
        // User can manually apply template later if needed
      }
    }

    // Integration concerns: Emit owner changed notification
    if (previousCandidate.primaryOwnerId !== fullCandidate.primaryOwnerId) {
      await emitOwnerChanged({
        candidate: fullCandidate,
        previousOwnerId: previousCandidate.primaryOwnerId,
        newOwnerId: fullCandidate.primaryOwnerId,
        actorId: req.user!.id,
      });
    }

    // Integration concerns: Resolve self-assignments when linkedUserId changes
    if (previousCandidate.linkedUserId !== fullCandidate.linkedUserId && fullCandidate.linkedUserId) {
      const resolvedTasks = await candidateService.resolveCandidateSelfAssignments(fullCandidate.id, fullCandidate.linkedUserId);
      if (resolvedTasks.length > 0) {
        for (const task of resolvedTasks) {
          // Publish taskAssigned event for self-assignment resolution
          if (task.assigneeUserId) {
            await eventBus.publish(taskAssigned(task.id, {
              candidateId: task.candidateId,
              taskTitle: task.title,
              assigneeUserId: task.assigneeUserId,
              previousAssigneeId: null,
              dueAt: task.dueAt
            }, {
              actorId: req.user?.id
            }));
          }
          await emitDeadlinesIfNeeded(task.id, { actorId: req.user!.id });
        }
      }
    }

    // If template was auto-applied, refetch to get updated data
    let responseCandidate = fullCandidate;
    if (templateExpansionResult) {
      const refreshed = await candidateService.getCandidate(req.params.id, authContext);
      if (refreshed) {
        responseCandidate = refreshed;
      }
    }

    // Include template expansion info in response if it occurred
    const response = templateExpansionResult 
      ? { 
          ...responseCandidate, 
          templateAutoApplied: true, 
          tasksCreated: templateExpansionResult.createdCount 
        }
      : responseCandidate;

    res.json(response);
  } catch (error) {
    next(error);
  }
});

// PATCH /api/candidates/:id/status - Update candidate status via state machine
router.patch("/candidates/:id/status", requireAuth, requireRole(["system_admin", "hr_staff"]), async (req, res, next) => {
  try {
    const statusSchema = z.object({
      status: z.enum(["draft", "active", "on_hold", "completed", "canceled", "offer_declined", "archived"]),
      closeOpenTasks: z.boolean().optional()
    });
    const parsed = statusSchema.parse(req.body ?? {});

    const candidateService = getCandidateService();
    const authContext = authorizationService.buildContext(req.user);
    const result = await candidateService.updateCandidateStatus({
      id: req.params.id,
      newStatus: parsed.status,
      actorId: req.user!.id,
      closeOpenTasks: parsed.closeOpenTasks,
      authContext
    });

    if (!result.success || !result.candidate) {
      const status = result.code === "CANDIDATE_NOT_FOUND" ? 404 : 400;
      return res.status(status).json({
        message: result.error || "Unable to update status",
        code: result.code,
        remainingTasks: result.remainingTasks
      });
    }

    res.json({ ...result.candidate, cascaded: result.cascaded });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Invalid status payload", errors: error.errors });
    }
    next(error);
  }
});

// DELETE /api/candidates/:id - Archive candidate (soft delete)
router.delete("/candidates/:id", requireAuth, requireRole(["system_admin", "hr_staff"]), async (req, res, next) => {
  try {
    const candidateService = getCandidateService();

    // Archive using service, which will also update status
    const candidate = await candidateService.updateCandidate({
      id: req.params.id,
      data: {
        archived: true,
        archivedAt: new Date(),
        archivedBy: req.user!.id,
        status: 'archived' as const
      },
      actorId: req.user?.id
    });

    if (!candidate) {
      return res.status(404).json({ message: "Candidate not found" });
    }

    res.json({
      id: candidate.id,
      archived: true,
      archivedAt: candidate.archivedAt
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/candidates/:id/restore - Restore archived candidate
router.post("/candidates/:id/restore", requireAuth, requireRole(["system_admin", "hr_staff"]), async (req, res, next) => {
  try {
    const restoreSchema = z.object({
      reset: z.boolean().optional(),
      offerLetterIssuedAt: z.coerce.date().optional(),
      offerLetterAcceptedAt: z.coerce.date().optional().nullable(),
      anticipatedStartDate: z.coerce.date().optional(),
    }).superRefine((data, ctx) => {
      if (data.reset) {
        if (!data.offerLetterIssuedAt) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["offerLetterIssuedAt"], message: "LOO issued date is required" });
        }
        if (!data.anticipatedStartDate) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["anticipatedStartDate"], message: "Anticipated start date is required" });
        }
      }

      if (data.offerLetterAcceptedAt && data.offerLetterIssuedAt && data.offerLetterAcceptedAt < data.offerLetterIssuedAt) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["offerLetterAcceptedAt"], message: "LOO accepted date cannot be before issued date" });
      }
      if (data.anticipatedStartDate && data.offerLetterIssuedAt && data.anticipatedStartDate < data.offerLetterIssuedAt) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["anticipatedStartDate"], message: "Anticipated start date cannot be before LOO issued date" });
      }
      if (data.anticipatedStartDate && data.offerLetterAcceptedAt && data.anticipatedStartDate < data.offerLetterAcceptedAt) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["anticipatedStartDate"], message: "Anticipated start date cannot be before LOO accepted date" });
      }
    });

    const payload = restoreSchema.parse(req.body ?? {});
    const candidateService = getCandidateService();
    const authContext = authorizationService.buildContext(req.user);

    const candidate = await candidateService.getCandidate(req.params.id, authContext);
    if (!candidate) {
      return res.status(404).json({ message: "Candidate not found" });
    }

    const wasCanceledBeforeArchive =
      (candidate as any).statusBeforeArchive === 'canceled' ||
      (candidate.archived && candidate.status === 'canceled');

    if (wasCanceledBeforeArchive && !payload.reset) {
      return res.status(400).json({
        code: "RESET_REQUIRED",
        message: "This candidate can’t be restored without resetting onboarding dates."
      });
    }

    if (wasCanceledBeforeArchive && payload.reset) {
      await candidateService.updateCandidate({
        id: req.params.id,
        data: {
          offerLetterIssuedAt: payload.offerLetterIssuedAt!,
          offerLetterAcceptedAt: payload.offerLetterAcceptedAt ?? null,
          anticipatedStartDate: payload.anticipatedStartDate!,
        },
        actorId: req.user?.id,
        authContext
      });

      await candidateService.resetCandidateTasksForReactivation(req.params.id);
    }

    const statusResult = await candidateService.updateCandidateStatus({
      id: req.params.id,
      newStatus: 'active',
      actorId: req.user!.id,
      authContext
    });

    if (!statusResult.success || !statusResult.candidate) {
      const status = statusResult.code === "CANDIDATE_NOT_FOUND" ? 404 : 400;
      return res.status(status).json({ message: statusResult.error || "Unable to restore candidate", code: statusResult.code });
    }

    const taskDueDateService = getTaskDueDateService();
    await taskDueDateService.recomputeCandidateDueDates(req.params.id);

    const fullCandidate = await candidateService.getCandidate(req.params.id, authContext);
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

    const authContext = authorizationService.buildContext(req.user);
    const taskService = getTaskService();
    let tasks = await taskService.getTasks({ candidateId: id }, authContext);
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
    const candidateService = getCandidateService();
    const stages = await candidateService.getCandidateTemplateStages(id);

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
    const candidateService = getCandidateService();
    const history = await candidateService.getCandidateStageHistory(id);
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
    const commentService = getCommentService();
    const data = await commentService.getCandidateComments({ candidateId: req.params.id, visibility: visibility as any, role: req.user.role, cursor });
    res.json(data);
  } catch (error) { next(error); }
});

// POST /api/candidates/:id/comments - Create a comment on a candidate
router.post("/candidates/:id/comments", sensitiveRateLimiter, requireAuth, async (req: any, res, next) => {
  try {
    if (!(await fetchCandidateWithAccess(req, res, req.params.id, "candidate:comments:create"))) return;
    const { body, visibility, parentId } = req.body || {};
    if (!body || !visibility) return res.status(400).json({ message: 'body and visibility are required' });
    const commentService = getCommentService();
    const created = await commentService.createComment({ entityType: 'candidate', entityId: req.params.id, authorUserId: req.user.id, role: req.user.role, body, visibility, parentId });

    // Publish domain event
    const mentionKeys = extractMentionKeys(body);
    await eventBus.publish(commentCreated(created.id, {
      entityType: 'candidate',
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

// GET /api/candidates/:id/comment-stats - Get comment statistics for a candidate
router.get("/candidates/:id/comment-stats", sensitiveRateLimiter, requireAuth, async (req: any, res, next) => {
  try {
    if (!(await fetchCandidateWithAccess(req, res, req.params.id, "candidate:comments:stats"))) return;
    const commentService = getCommentService();
    const stats = await commentService.getCommentStats({ candidateId: req.params.id, role: req.user.role });
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

    const templateExpansionService = getTemplateExpansionService();
    const expansion = await templateExpansionService.expandTemplate(template_id, req.params.id, req.user!.id);

    try {
      // Publish taskCreated events for all tasks created from template
      await Promise.all(
        expansion.createdTasks.map((task) =>
          eventBus.publish(taskCreated(task.id, {
            candidateId: task.candidateId,
            title: task.title,
            assigneeUserId: task.assigneeUserId,
            assigneeRole: task.assigneeKind === 'role' ? task.assigneeRole : null,
            dueAt: task.dueAt,
            isRequired: false, // Not available in TemplateExpansionTask
            fromTemplate: true
          }, {
            actorId: req.user?.id
          }))
        )
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
    const taskDueDateService = getTaskDueDateService();
    const result = await taskDueDateService.recomputeCandidateDueDates(candidateId);
    const candidateService = getCandidateService();
    const candidate = await candidateService.getCandidate(candidateId);
    res.json({ updated: result.updated, candidate });
  } catch (error) {
    next(error);
  }
});

export default router;
