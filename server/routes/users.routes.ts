import { Router } from "express";
import { z } from "zod";
import { storage } from "../db/storage";
import { requireAuth, requireRole } from "../middleware/authorization";
import { hasAnyRole, logAuthorizationFailure } from "../utils/authorization.utils";
import {
  buildPreferenceResponse,
  pickPreferencesForRole,
  filterUpdatesForRole
} from "../utils/preferences.utils";
import {
  DIGEST_FREQUENCIES,
  USER_PREFERENCES_DEFAULTS,
  mergeUserPreferences,
  type UserPreferences,
  type UserPreferencesDTO
} from "@shared/schemas";

const router = Router();

// Time validation schema for quiet hours
const timePattern = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/;

const nullableTimeSchema = z.union([
  z.string().regex(timePattern, "Time must be in HH:MM or HH:MM:SS format"),
  z.null(),
  z.literal("")
]).transform((value) => (value === "" ? null : value));

// Preferences update schema
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

// User Preferences Routes
router.get("/me/preferences", requireAuth, async (req, res, next) => {
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

router.patch("/me/preferences", requireAuth, async (req, res, next) => {
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

router.post("/me/preferences/test-email", requireAuth, (_req, res) => {
  res.status(200).json({ message: "Test email requested" });
});

// Managers routes
router.get("/users/managers", requireAuth, requireRole(["system_admin", "hr_staff", "department_admin", "division_leader", "manager"]), async (req, res, next) => {
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

// User Management - Admin only endpoints
router.get("/users", requireAuth, requireRole(["system_admin", "hr_staff"]), async (req, res, next) => {
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
router.get("/users/assignable", requireAuth, async (req, res, next) => {
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

router.post("/users", requireAuth, requireRole(["system_admin", "hr_staff"]), async (req, res, next) => {
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

router.patch("/users/:id", requireAuth, requireRole(["system_admin", "hr_staff"]), async (req, res, next) => {
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

router.patch("/users/:id/roles", requireAuth, requireRole(["system_admin", "hr_staff"]), async (req, res, next) => {
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

router.post("/users/:id/disable", requireAuth, requireRole(["system_admin", "hr_staff"]), async (req, res, next) => {
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

router.post("/users/:id/enable", requireAuth, requireRole(["system_admin", "hr_staff"]), async (req, res, next) => {
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

router.get("/users/:id/task-count", requireAuth, requireRole(["system_admin", "hr_staff"]), async (req, res, next) => {
  try {
    const { id } = req.params;
    const taskCount = await storage.getUserOpenTaskCount(id);
    res.json(taskCount);
  } catch (error) {
    next(error);
  }
});

export default router;
