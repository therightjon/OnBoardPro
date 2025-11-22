import type { Express, RequestHandler } from "express";
import { createServer, type Server } from "http";
import { setupAuth } from "./features/auth/services/auth.service";
import { storage } from "./db/storage";
import { requireAuth, requireRole } from "./middleware/authorization";
import { defaultRateLimiter, sensitiveRateLimiter } from "./middleware/rate-limiter";
import {
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
import { getSmtpSettings, updateSmtpSettings, sendTestEmail } from "./features/email/smtp-settings.service";
import { reportAuthorizationFailure } from "./observability/authMetrics";
import docsRouter from "./routes/docs";
import { hasAnyRole, logAuthorizationFailure } from "./utils/authorization.utils";
import { getAllowedPreferenceKeys, buildPreferenceResponse, pickPreferencesForRole, filterUpdatesForRole, PREFERENCE_KEYS } from "./utils/preferences.utils";
import { generateInviteToken, getInviteBaseUrl, sendInviteEmail } from "./utils/invitation.utils";
import referenceDataRouter from "./routes/reference-data.routes";
import searchRouter from "./routes/search.routes";
import notificationsRouter from "./routes/notifications.routes";
import templatesRouter from "./routes/templates.routes";
import tasksRouter from "./routes/tasks.routes";
import candidatesRouter from "./routes/candidates.routes";

export interface RegisterRoutesOptions {
  skipAuthSetup?: boolean;
  rateLimiters?: Partial<Record<"default" | "sensitive", RequestHandler>>;
}

// Note: requireAuth and requireRole are now imported from middleware/authorization.ts
// Note: Rate limiters (defaultRateLimiter, sensitiveRateLimiter) are now imported from middleware/rate-limiter.ts
// Note: Preference utilities are now imported from utils/preferences.utils.ts
// Note: Invitation utilities are now imported from utils/invitation.utils.ts

const timePattern = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/;

const nullableTimeSchema = z.union([
  z.string().regex(timePattern, "Time must be in HH:MM or HH:MM:SS format"),
  z.null(),
  z.literal("")
]).transform((value) => (value === "" ? null : value));

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

export async function registerRoutes(app: Express, options: RegisterRoutesOptions = {}): Promise<Server> {
  if (!options.skipAuthSetup) {
    await setupAuth(app);
  }

  const defaultLimiter = options.rateLimiters?.default ?? defaultRateLimiter;
  const sensitiveLimiter = options.rateLimiters?.sensitive ?? sensitiveRateLimiter;

  // Register reference data routes
  app.use("/api", referenceDataRouter);

  // Register search and dashboard routes
  app.use("/api", searchRouter);

  // Register notifications and comments routes
  app.use("/api", notificationsRouter);

  // Register template routes
  app.use("/api", templatesRouter);

  // Register task routes
  app.use("/api", tasksRouter);

  // Register candidate routes
  app.use("/api", candidatesRouter);

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

      if (!hasAnyRole(req.user, ["system_admin", "hr_staff"])) {
        const authContext = storage.buildAuthorizationContext(req.user);
        const departmentScoped = typeof departmentId === "string" && authContext.departmentIds.has(departmentId);
        const divisionScoped = typeof divisionId === "string" ? authContext.divisionIds.has(divisionId as string) : true;
        if (hasAnyRole(req.user, ["department_admin", "manager"]) && !departmentScoped) {
          await logAuthorizationFailure({ req, resource: "general", action: "users:managers", reason: "department_scope" });
          return res.status(403).json({ message: "Insufficient permissions" });
        }
        if (hasAnyRole(req.user, ["division_leader"]) && !divisionScoped) {
          await logAuthorizationFailure({ req, resource: "general", action: "users:managers", reason: "division_scope" });
          return res.status(403).json({ message: "Insufficient permissions" });
        }
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
      await logAuthorizationFailure({ req, resource: "settings", action: "settings:email:update", reason: error?.message ?? "update_failed" });
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
      if (!hasAnyRole(req.user, ["system_admin", "hr_staff", "department_admin", "division_leader", "manager"])) {
        await logAuthorizationFailure({ req, resource: "general", action: "users:assignable", reason: "role_mismatch" });
        return res.status(403).json({ message: "Insufficient permissions" });
      }

      const filters: any = {
        status: 'active' // Only return active users for assignment
      };
      if (role) filters.role = role as string;
      if (departmentId) filters.departmentId = departmentId as string;
      if (divisionId) filters.divisionId = divisionId as string;
      if (search) filters.search = search as string;

      if (!hasAnyRole(req.user, ["system_admin", "hr_staff"])) {
        const authContext = storage.buildAuthorizationContext(req.user);

        if (hasAnyRole(req.user, ["department_admin", "manager"])) {
          if (departmentId) {
            if (!authContext.departmentIds.has(departmentId as string)) {
              await logAuthorizationFailure({ req, resource: "general", action: "users:assignable", reason: "department_scope" });
              return res.status(403).json({ message: "Insufficient permissions" });
            }
          } else if (authContext.departmentIds.size === 1) {
            filters.departmentId = Array.from(authContext.departmentIds)[0];
          }
        }

        if (hasAnyRole(req.user, ["division_leader"])) {
          if (divisionId) {
            if (!authContext.divisionIds.has(divisionId as string)) {
              await logAuthorizationFailure({ req, resource: "general", action: "users:assignable", reason: "division_scope" });
              return res.status(403).json({ message: "Insufficient permissions" });
            }
          } else if (authContext.divisionIds.size === 1) {
            filters.divisionId = Array.from(authContext.divisionIds)[0];
          }
        }
      }

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
      await logAuthorizationFailure({ req, resource: "settings", action: "auth:ldap:update", reason: (error as Error)?.message ?? "update_failed" });
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
      await logAuthorizationFailure({ req, resource: "settings", action: "auth:ldap:test", reason: (error as Error)?.message ?? "test_failed" });
      next(error);
    }
  });

  // API Documentation
  app.use(docsRouter);

  const httpServer = createServer(app);
  return httpServer;
}
