import type { Express } from "express";
import { createServer, type Server } from "http";
import { randomBytes } from "crypto";
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
  appRoleEnum,
  USER_PREFERENCES_DEFAULTS,
  DIGEST_FREQUENCIES,
  mergeUserPreferences,
  type UserPreferences,
  type UserPreferencesDTO
} from "@shared/schemas";
import { z } from "zod";
import { advanceStageIfComplete, recomputeCandidateStageState } from "./features/tasks/services/advance-stage.service";
import { db } from "./db/connection";
import { sql } from "drizzle-orm";
import { createNotifications, extractMentionKeys, resolveMentionedUsers } from "./features/notifications/services";
import { emitDeadlinesIfNeeded } from "./features/notifications/deadline-helpers";
import { emitOwnerChanged } from "./features/notifications/owner-change";
import { getSmtpSettings, updateSmtpSettings, sendTestEmail } from "./features/email/smtp-settings.service";
import {
  listNotificationsHandler,
  markNotificationReadHandler,
  markAllNotificationsReadHandler
} from "./features/notifications/routes";

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

const INVITE_TOKEN_BYTES = 32;

export const PREFERENCE_KEYS = [
  "mytasksShowArchived",
  "mytasksShowCanceled",
  "mytasksShowCompleted",
  "notifyInApp",
  "notifyEmail",
  "digestFrequency",
  "quietHoursStart",
  "quietHoursEnd",
  "allowSelfNotifications",
  "eventSubscriptions"
] as const;

type PreferenceKey = (typeof PREFERENCE_KEYS)[number];

const candidatePreferenceKeys = new Set<PreferenceKey>(PREFERENCE_KEYS);
const defaultPreferenceKeys = new Set<PreferenceKey>(PREFERENCE_KEYS);

const timePattern = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/;

const nullableTimeSchema = z.union([
  z.string().regex(timePattern, "Time must be in HH:MM or HH:MM:SS format"),
  z.null(),
  z.literal("")
]).transform((value) => (value === "" ? null : value));

const COMMENT_SNIPPET_LIMIT = 240;

function buildActorLabel(user: Express.User): string {
  const parts = [user.firstName, user.lastName].filter(Boolean);
  return parts.join(" ").trim() || user.email || user.id;
}

function buildCommentSnippet(body: string, limit = COMMENT_SNIPPET_LIMIT): string {
  const normalized = (body ?? "").replace(/\s+/g, " ").trim();
  if (normalized.length <= limit) {
    return normalized;
  }
  return normalized.slice(0, limit - 3).trimEnd() + "...";
}

async function gatherCandidateNotificationContext(candidateId: string) {
  const [candidate, followers] = await Promise.all([
    storage.getCandidate(candidateId),
    storage.getCandidateFollowers(candidateId)
  ]);

  const watcherIds = new Set<string>();
  if (candidate?.primaryOwnerId) {
    watcherIds.add(candidate.primaryOwnerId);
  }
  for (const follower of followers) {
    watcherIds.add(follower.userId);
  }

  return { candidate, watcherIds } as const;
}

async function gatherCandidateAssigneeIds(candidateId: string): Promise<string[]> {
  const tasks = await storage.getCandidateTasks({ candidateId });
  const ids = new Set<string>();
  for (const task of tasks) {
    if (task.assigneeKind === 'user' && task.assigneeUserId && task.status !== 'done' && task.status !== 'canceled') {
      ids.add(task.assigneeUserId);
    }
  }
  return Array.from(ids);
}

async function notifyTaskAssignees(task: any, actor: Express.User, reason: 'assignment' | 'status_change', extraPayload?: Record<string, unknown>) {
  if (task?.assigneeKind !== 'user' || !task?.assigneeUserId) {
    return;
  }

  const candidate = await storage.getCandidate(task.candidateId);
  const actorName = buildActorLabel(actor);
  const payload = {
    actor: { id: actor.id, name: actorName },
    task: {
      id: task.id,
      title: task.title,
      status: task.status
    },
    candidate: candidate ? {
      id: candidate.id,
      name: `${candidate.firstName} ${candidate.lastName}`
    } : { id: task.candidateId },
    reason,
    ...extraPayload
  } as const;

  // Determine recipient visibility: candidates receive external notifications
  // while staff/internal users receive internal notifications.
  try {
    const recipient = await storage.getUser(task.assigneeUserId);
    const visibility = recipient?.role === 'candidate' ? 'external' : 'internal';
    await createNotifications({
      type: "task.assigned",
      actorId: actor.id,
      recipients: [task.assigneeUserId],
      entity: { type: "task", id: task.id },
      payload,
      visibility
    });
  } catch {
    // If user lookup fails, default to internal to avoid leaking externally
    await createNotifications({
      type: "task.assigned",
      actorId: actor.id,
      recipients: [task.assigneeUserId],
      entity: { type: "task", id: task.id },
      payload,
      visibility: "internal"
    });
  }
}

async function notifyCandidateStageChange(params: { candidateId: string; actor: Express.User; fromStageId?: string | null; toStageId: string; toStageName?: string | null }) {
  const { candidateId, actor, fromStageId, toStageId, toStageName } = params;
  const [{ candidate, watcherIds }, assigneeIds] = await Promise.all([
    gatherCandidateNotificationContext(candidateId),
    gatherCandidateAssigneeIds(candidateId)
  ]);

  for (const assigneeId of assigneeIds) {
    watcherIds.add(assigneeId);
  }

  if (watcherIds.size === 0) {
    return;
  }

  const actorName = buildActorLabel(actor);
  const payload = {
    actor: { id: actor.id, name: actorName },
    candidate: candidate ? {
      id: candidate.id,
      name: `${candidate.firstName} ${candidate.lastName}`
    } : { id: candidateId },
    stage: {
      fromStageId: fromStageId ?? null,
      toStageId,
      toStageName: toStageName ?? null
    }
  } as const;

  await createNotifications({
    type: "stage.changed",
    actorId: actor.id,
    recipients: Array.from(watcherIds),
    entity: { type: "candidate", id: candidateId },
    payload,
    visibility: "internal"
  });
}

export const preferencesUpdateSchema = z.object({
  mytasksShowArchived: z.boolean().optional(),
  mytasksShowCanceled: z.boolean().optional(),
  mytasksShowCompleted: z.boolean().optional(),
  notifyInApp: z.boolean().optional(),
  notifyEmail: z.boolean().optional(),
  digestFrequency: z.enum(DIGEST_FREQUENCIES).optional(),
  quietHoursStart: nullableTimeSchema.optional(),
  quietHoursEnd: nullableTimeSchema.optional(),
  allowSelfNotifications: z.boolean().optional(),
  eventSubscriptions: z.record(z.boolean()).optional()
}).strict();

type PreferencesUpdatePayload = z.infer<typeof preferencesUpdateSchema>;

type PreferencesResponse = typeof USER_PREFERENCES_DEFAULTS & {
  eventSubscriptions: Record<string, boolean>;
};

type UserPreferencesUpdate = Partial<Omit<UserPreferences, "userId" | "updatedAt">>;

export function getAllowedPreferenceKeys(role: string): Set<PreferenceKey> {
  return role === "candidate" ? candidatePreferenceKeys : defaultPreferenceKeys;
}

export function buildPreferenceResponse(preferences?: UserPreferences): PreferencesResponse {
  const merged = mergeUserPreferences(preferences as Partial<UserPreferencesDTO> | undefined);
  return {
    ...merged,
    eventSubscriptions: { ...merged.eventSubscriptions }
  };
}

export function pickPreferencesForRole(preferences: PreferencesResponse, role: string) {
  const allowedKeys = getAllowedPreferenceKeys(role);
  return Array.from(allowedKeys).reduce<Record<string, unknown>>((acc, key) => {
    acc[key] = preferences[key as keyof PreferencesResponse];
    return acc;
  }, {});
}

export function filterUpdatesForRole(updates: PreferencesUpdatePayload, role: string): UserPreferencesUpdate {
  const allowedKeys = getAllowedPreferenceKeys(role);
  return Object.entries(updates).reduce<UserPreferencesUpdate>((acc, [key, value]) => {
    if (allowedKeys.has(key as PreferenceKey)) {
      acc[key as PreferenceKey] = value as any;
    }
    return acc;
  }, {} as UserPreferencesUpdate);
}

function generateInviteToken(): string {
  const raw = randomBytes(INVITE_TOKEN_BYTES).toString("base64");
  return raw.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function getInviteBaseUrl(): string {
  const value = process.env.APP_BASE_URL 
    || process.env.PUBLIC_URL 
    || process.env.CLIENT_URL 
    || process.env.VITE_APP_URL;
  return value ? value.replace(/\/$/, "") : "http://localhost:5173";
}

async function sendInviteEmail(email: string, token: string, expiresAt: Date) {
  const link = `${getInviteBaseUrl()}/accept-invite?token=${token}`;
  console.info(`[invite] Sent invitation`, { email, link, expiresAt: expiresAt.toISOString() });
}

export async function registerRoutes(app: Express): Promise<Server> {
  await setupAuth(app);

  const inviteRequestSchema = z.object({
    email: z.string().email(),
    roles: z.array(z.string().min(1)).min(1),
    departmentId: z.string().uuid().optional().or(z.literal('').transform(()=>undefined)),
    divisionId: z.string().uuid().optional().or(z.literal('').transform(()=>undefined)),
    firstName: z.string().min(1).optional(),
    lastName: z.string().min(1).optional(),
  });

  app.post(
    "/api/invitations",
    requireAuth,
    requireRole(["system_admin", "hr_staff"]),
    async (req, res, next) => {
      try {
        const parsed = inviteRequestSchema.parse(req.body ?? {});
        const normalizedEmail = parsed.email.trim().toLowerCase();
        const rolesInput = parsed.roles.map(role => role.trim().toLowerCase());
        const allowedRoles = new Set<string>([...appRoleEnum.enumValues]);
        const invalidRoles = rolesInput.filter(role => !allowedRoles.has(role));

        if (invalidRoles.length > 0) {
          return res.status(400).json({
            message: `Invalid role(s): ${invalidRoles.join(', ')}`
          });
        }

        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        const token = generateInviteToken();

        const invitation = await storage.createInvitation({
          email: normalizedEmail,
          roles: rolesInput,
          invitedBy: req.user!.id,
          token,
          expiresAt,
          departmentId: parsed.departmentId,
          divisionId: parsed.divisionId,
          firstName: parsed.firstName,
          lastName: parsed.lastName
        });

        await sendInviteEmail(invitation.email, invitation.token, new Date(invitation.expiresAt));

        res.status(201).json({
          id: invitation.id,
          expiresAt: invitation.expiresAt
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return res.status(400).json({
            message: "Invalid data",
            errors: error.flatten()
          });
        }
        next(error);
      }
    }
  );

  app.get("/api/invitations/accept", async (req: any, res, next) => {
    try {
      const tokenParam = req.query?.token;
      const token = Array.isArray(tokenParam) ? tokenParam[0] : tokenParam;

      if (!token || typeof token !== "string" || token.trim() === "") {
        return res.status(400).json({ message: "Invite token is required" });
      }

      const invitation = await storage.getInvitationByToken(token);

      if (!invitation || invitation.status !== "pending") {
        return res.status(410).json({ message: "Invite is invalid or expired" });
      }

      const expiresAt = new Date(invitation.expiresAt);
      if (Number.isNaN(expiresAt.getTime()) || expiresAt <= new Date()) {
        return res.status(410).json({ message: "Invite is invalid or expired" });
      }

      req.session.inviteToken = token;
      req.session.inviteTokenEmail = invitation.email;
      req.session.inviteTokenIssuedAt = new Date().toISOString();
      req.session.save((err: unknown) => {
        if (err) {
          console.error("Failed to persist invitation token in session", err);
          return res.status(500).json({ message: "Unable to store invite token" });
        }
        res.json({
          email: invitation.email,
          expiresAt: invitation.expiresAt
        });
      });
    } catch (error) {
      next(error);
    }
  });

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
      const role = req.user!.role;
      const preferences = await storage.getUserPreferences(userId);
      const response = buildPreferenceResponse(preferences);
      res.json(pickPreferencesForRole(response, role));
    } catch (error) {
      next(error);
    }
  });

  app.patch("/api/me/preferences", requireAuth, async (req, res, next) => {
    try {
      const userId = req.user!.id;
      const role = req.user!.role;
      const parsedUpdates = preferencesUpdateSchema.parse(req.body ?? {});
      const filteredUpdates = filterUpdatesForRole(parsedUpdates, role);
      const updatedPreferences = await storage.upsertUserPreferences(userId, filteredUpdates);
      const response = buildPreferenceResponse(updatedPreferences);
      res.json(pickPreferencesForRole(response, role));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/me/preferences/test-email", requireAuth, (_req, res) => {
    res.status(200).json({ message: "Test email requested" });
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

  // Notifications API
  app.get("/api/notifications", requireAuth, (req, res, next) => listNotificationsHandler(storage, req, res, next));

  app.patch("/api/notifications/:id", requireAuth, (req, res, next) => markNotificationReadHandler(storage, req, res, next));

  app.post("/api/notifications/mark-all-read", requireAuth, (req, res, next) => markAllNotificationsReadHandler(storage, req, res, next));

  // Candidate comments
  app.get("/api/candidates/:id/comments", requireAuth, async (req: any, res, next) => {
    try {
      const visibility = (req.query.visibility as string) || 'all';
      const cursor = req.query.cursor as string | undefined;
      const data = await storage.getCandidateComments({ candidateId: req.params.id, visibility: visibility as any, role: req.user.role, cursor });
      res.json(data);
    } catch (error) { next(error); }
  });

  app.post("/api/candidates/:id/comments", requireAuth, async (req: any, res, next) => {
    try {
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
        status: "active" as const,
        primaryOwnerId: user.id
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

  app.post("/api/candidates/:id/recompute-due-dates", requireAuth, requireRole(["system_admin", "hr_staff"]), async (req, res, next) => {
    try {
      const candidateId = req.params.id;
      const result = await storage.recomputeCandidateDueDates(candidateId);
      const candidate = await storage.getCandidate(candidateId);
      res.json({ updated: result.updated, candidate });
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

  // Tasks routes - restrict to specific candidate or assignee
  app.get("/api/tasks", requireAuth, async (req, res, next) => {
    try {
      const { candidateId, assigneeId } = req.query;
      
      // If the caller is a candidate, restrict to their assigned tasks only
      if (req.user?.role === 'candidate') {
        const tasks = await storage.getCandidateTasks({ assigneeId: req.user.id });
        return res.json(tasks);
      }

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

  // Task comments
  app.get("/api/tasks/:id/comments", requireAuth, async (req: any, res, next) => {
    try {
      const visibility = (req.query.visibility as string) || 'all';
      const cursor = req.query.cursor as string | undefined;
      const data = await storage.getTaskComments({ taskId: req.params.id, visibility: visibility as any, role: req.user.role, cursor });
      res.json(data);
    } catch (error) { next(error); }
  });

  app.post("/api/tasks/:id/comments", requireAuth, async (req: any, res, next) => {
    try {
      const { body, visibility, parentId } = req.body || {};
      if (!body || !visibility) return res.status(400).json({ message: 'body and visibility are required' });
      const created = await storage.createComment({ entityType: 'task', entityId: req.params.id, authorUserId: req.user.id, role: req.user.role, body, visibility, parentId });

      try {
        const task = await storage.getCandidateTask(req.params.id);
        if (task) {
          const snippet = buildCommentSnippet(body);
          const actorName = buildActorLabel(req.user!);
          const mentionKeys = extractMentionKeys(body);
          const mentionedUsers = mentionKeys.length > 0 ? await resolveMentionedUsers(mentionKeys) : [];
          const mentionRecipientIds = new Set(mentionedUsers.map((user) => user.id));

          const watcherIds = new Set<string>();
          if (task.assigneeKind === 'user' && task.assigneeUserId) {
            watcherIds.add(task.assigneeUserId);
          }

          for (const id of mentionRecipientIds) {
            watcherIds.delete(id);
          }

          const candidate = await storage.getCandidate(task.candidateId);
          const basePayload = {
            actor: { id: req.user.id, name: actorName },
            comment: {
              id: created.id,
              preview: snippet,
              visibility
            },
            candidate: candidate ? {
              id: candidate.id,
              name: `${candidate.firstName} ${candidate.lastName}`
            } : { id: task.candidateId },
            task: {
              id: task.id,
              title: task.title
            },
            source: 'task'
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
        }
      } catch (notifyError) {
        console.error('Failed to dispatch task comment notifications:', notifyError);
      }

      res.status(201).json(created);
    } catch (error: any) { res.status(400).json({ message: error.message || 'Unable to create comment' }); }
  });

  app.post("/api/tasks", requireAuth, async (req, res, next) => {
    try {
      // Validate candidate_id is required
      if (!req.body.candidateId) {
        return res.status(400).json({ message: "candidate_id is required" });
      }

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

  app.patch("/api/tasks/:id", requireAuth, async (req, res, next) => {
    try {
      const body = { ...req.body };
      if (body.assigneeId && !body.assigneeUserId) {
        body.assigneeUserId = body.assigneeId;
      }

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
      const canEdit = allowedRoles.includes(req.user!.role) || existingTask.assigneeUserId === req.user!.id;
      
      if (!canEdit) {
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
        if (existingTask.required && !(req.user!.role === 'hr_staff' || req.user!.role === 'system_admin')) {
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
        } : { advanced: false },
        recompute: recompute ? {
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

  // System settings endpoints (hr_staff, system_admin)
  app.get("/api/system-settings", requireAuth, requireRole(["system_admin", "hr_staff"]), async (req, res, next) => {
    try {
      const settings = await storage.getSystemSettings();
      res.json(settings);
    } catch (error) {
      next(error);
    }
  });

  app.patch("/api/system-settings", requireAuth, requireRole(["system_admin", "hr_staff"]), async (req, res, next) => {
    try {
      const { auto_regress_on_prior_open } = req.body ?? {};
      const updated = await storage.setSystemSettings({ auto_regress_on_prior_open });
      res.json(updated);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/settings/email", requireAuth, requireRole(["system_admin"]), async (_req, res, next) => {
    try {
      const settings = await getSmtpSettings();
      res.json(settings);
    } catch (error) {
      next(error);
    }
  });

  app.patch("/api/settings/email", requireAuth, requireRole(["system_admin"]), async (req: any, res) => {
    try {
      const result = await updateSmtpSettings(req.body ?? {}, req.user!.id);
      res.json(result.settings);
    } catch (error: any) {
      res.status(400).json({ message: error?.message ?? "Failed to update SMTP settings" });
    }
  });

  app.post("/api/settings/email/test", requireAuth, requireRole(["system_admin"]), async (req: any, res) => {
    const email = req.user?.email;
    if (!email) {
      return res.status(400).json({ ok: false, message: "Current user email is not set" });
    }
    const name = `${req.user?.firstName ?? ""} ${req.user?.lastName ?? ""}`.trim() || email;
    const result = await sendTestEmail(email, name);
    if (result.ok) {
      return res.json({ ok: true });
    }
    return res.status(502).json(result);
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

  // Comment item routes
  app.patch("/api/comments/:id", requireAuth, async (req: any, res, next) => {
    try {
      const { body } = req.body || {};
      if (!body) return res.status(400).json({ message: 'body is required' });
      const updated = await storage.editComment({ id: req.params.id, userId: req.user.id, userRole: req.user.role, body });
      res.json(updated);
    } catch (error: any) { res.status(400).json({ message: error.message || 'Unable to edit comment' }); }
  });

  app.delete("/api/comments/:id", requireAuth, async (req: any, res, next) => {
    try {
      await storage.deleteComment({ id: req.params.id, userId: req.user.id, userRole: req.user.role });
      res.sendStatus(204);
    } catch (error: any) { res.status(400).json({ message: error.message || 'Unable to delete comment' }); }
  });

  // Comment stats
  app.get("/api/candidates/:id/comment-stats", requireAuth, async (req: any, res, next) => {
    try {
      const stats = await storage.getCommentStats({ candidateId: req.params.id, role: req.user.role });
      res.json(stats);
    } catch (error) { next(error); }
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
      const departmentId = typeof req.query.departmentId === 'string' ? req.query.departmentId : undefined;
      const divisionId = typeof req.query.divisionId === 'string' ? req.query.divisionId : undefined;
      
      console.log('Searching users with query:', q, 'role:', role, 'departmentId:', departmentId, 'divisionId:', divisionId);
      const results = await storage.searchUsers(q, role || undefined, departmentId, divisionId);
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

      const templateTask = await storage.createTemplateTask({
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

  app.patch("/api/template-tasks/:id", requireAuth, requireRole(["system_admin", "hr_staff"]), async (req, res, next) => {
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
      
      const phaseInput = req.body.phase;
      const phase = phaseInput === 'onboarding' ? 'onboarding'
        : phaseInput === 'pre_hire' ? 'pre_hire'
        : 'pre_hire';

      const templateStage = await storage.createTemplateStage({
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
      const { stageId, taskDefIds, priorityId, categoryId, assigneeId, dueRuleType, dueRuleValue, phase } = req.body;
      
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
      const stagePhase = phase === 'onboarding' ? 'onboarding'
        : phase === 'pre_hire' ? 'pre_hire'
        : 'pre_hire';

      const templateStage = await storage.createTemplateStage({
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
        
        const templateTask = await storage.createTemplateTask({
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

      // Append pending invitations as pseudo-users unless status filter excludes them
      let includeInvites = true;
      if (filters.status && filters.status !== 'all' && filters.status !== 'invited') {
        includeInvites = false;
      }

      if (!includeInvites) {
        return res.json(users);
      }

      const inviteFilters = {
        role: filters.role,
        departmentId: filters.departmentId,
        divisionId: filters.divisionId,
        search: filters.search,
      };
      const invites = await storage.getPendingInvitationsForUsersList(inviteFilters);

      const inviteAsUsers = invites.map((inv: any) => ({
        id: `invite:${inv.id}`,
        email: inv.email,
        firstName: inv.firstName || "",
        lastName: inv.lastName || "",
        passwordHash: null,
        role: (inv.roles && inv.roles[0]) || 'candidate',
        status: 'invited',
        departmentId: inv.departmentId,
        divisionId: inv.divisionId,
        active: true,
        lastLoginAt: null,
        authProvider: 'ldap',
        externalId: null,
        username: inv.username,
        emailVerified: false,
        createdAt: inv.createdAt,
        updatedAt: inv.updatedAt,
        department: inv.department ? { id: inv.department.id, name: inv.department.name } : null,
        division: inv.division ? { id: inv.division.id, name: inv.division.name } : null,
      }));

      res.json([ ...users, ...inviteAsUsers ]);
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
  async function checkProviderConfiguration(providerId: string): Promise<boolean> {
    switch (providerId) {
      case 'local':
        return true; // Local is always configured
      case 'ldap':
        return await storage.getLdapConfigured();
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

  async function getProviderDetails(providerId: string) {
    switch (providerId) {
      case 'local':
        return {
          clientIdMasked: undefined,
          callbackUrl: undefined,
          notes: 'Built-in password authentication'
        };
      case 'ldap': {
        const cfg = await storage.getLdapSettings();
        return {
          clientIdMasked: maskId(cfg.bindDn),
          callbackUrl: cfg.url,
          notes: 'Active Directory/LDAP authentication'
        };
      }
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
      const providerInfos = await Promise.all(dbProviders.map(async (dbProvider) => {
        const configured = await checkProviderConfiguration(dbProvider.id);
        const details = await getProviderDetails(dbProvider.id);
        return {
          id: dbProvider.id as "local" | "ldap" | "google" | "azuread",
          name: dbProvider.name,
          enabled: dbProvider.enabled,
          configured,
          effectiveEnabled: Boolean(dbProvider.enabled && configured),
          canEnable: Boolean(configured),
          ...details
        };
      }));
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
      const configured = await checkProviderConfiguration(id);
      if (enabled && !configured) {
        return res.status(400).json({ 
          message: "Provider is not configured. Please configure settings first." 
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
      
      const details = await getProviderDetails(id);
      
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

  // LDAP Settings API
  app.get("/api/auth/ldap", requireAuth, requireRole(["system_admin", "hr_staff"]), async (req, res, next) => {
    try {
      const cfg = await storage.getLdapSettings();
      const configured = await storage.getLdapConfigured();
      const warnings: string[] = [];
      if (cfg.url && !cfg.url.startsWith('ldaps://') && !cfg.startTls) {
        warnings.push('LDAP requires LDAPS (ldaps://) or StartTLS for security');
      }
      // Prepare masked response
      const response = {
        settings: {
          url: cfg.url,
          startTls: !!cfg.startTls,
          baseDn: cfg.baseDn,
          userFilter: cfg.userFilter,
          usernameAttr: cfg.usernameAttr,
          firstNameAttr: cfg.firstNameAttr,
          lastNameAttr: cfg.lastNameAttr,
          emailAttr: cfg.emailAttr,
          disabledFilter: cfg.disabledFilter,
          bindDnMasked: cfg.bindDn ? maskId(cfg.bindDn) : undefined,
          hasPassword: !!cfg.bindPassword,
        },
        configured,
        warnings
      };
      res.json(response);
    } catch (error) {
      next(error);
    }
  });

  app.put("/api/auth/ldap", requireAuth, requireRole(["system_admin", "hr_staff"]), async (req, res, next) => {
    try {
      const patch = req.body || {};
      // Normalize boolean
      if (patch.startTls !== undefined) patch.startTls = !!patch.startTls;
      const updated = await storage.setLdapSettings(patch);
      // Reinitialize providers to apply changes immediately
      try {
        const { initializeAuthProviders } = await import('./features/auth/services');
        await initializeAuthProviders();
      } catch (e) {
        console.error('Failed to reinitialize auth providers after LDAP settings update:', e);
      }
      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/auth/ldap/test", requireAuth, requireRole(["system_admin", "hr_staff"]), async (req, res, next) => {
    const start = Date.now();
    try {
      const override = req.body || {};
      const current = await storage.getLdapSettings();
      const cfg = { ...current, ...override };

      if (!cfg.url || !cfg.bindDn || !cfg.bindPassword || !cfg.baseDn) {
        return res.status(400).json({ ok: false, message: 'Missing required settings (url, bindDn, bindPassword, baseDn)' });
      }

      const ldapMod: any = await import('ldapjs');
      const createClient: any = ldapMod?.createClient ?? ldapMod?.default?.createClient;
      if (typeof createClient !== 'function') {
        console.error('ldapjs module shape unexpected:', Object.keys(ldapMod || {}));
        return res.status(500).json({ ok: false, message: 'LDAP library load failed' });
      }
      const client = createClient({ url: cfg.url, connectTimeout: 10000, timeout: 10000 });

      const doTest = () => new Promise<{ ok: boolean; message: string }>((resolve) => {
        client.on('error', (err: any) => {
          console.error('LDAP test connection error:', err);
          resolve({ ok: false, message: 'Connection failed' });
        });

        client.bind(cfg.bindDn!, cfg.bindPassword!, (bindErr: any) => {
          if (bindErr) {
            console.error('LDAP test bind error:', bindErr);
            client.destroy();
            resolve({ ok: false, message: 'Bind failed' });
            return;
          }
          // Optional: quick search to verify baseDn reachable
          const opts = { filter: cfg.userFilter || '(objectClass=person)', scope: 'base' as const };
          client.search(cfg.baseDn!, opts, (searchErr: any, searchRes: any) => {
            if (searchErr) {
              console.error('LDAP test search error:', searchErr);
              client.destroy();
              resolve({ ok: false, message: 'Search failed' });
              return;
            }
            searchRes.on('end', () => {
              client.destroy();
              resolve({ ok: true, message: 'OK' });
            });
            searchRes.on('error', (err: any) => {
              console.error('LDAP test search result error:', err);
              client.destroy();
              resolve({ ok: false, message: 'Search error' });
            });
          });
        });
      });

      const result = await doTest();
      res.json({ ...result, durationMs: Date.now() - start });
    } catch (error) {
      next(error);
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
