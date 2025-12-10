import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRole } from "../middleware/authorization";
import { hasAnyRole, logAuthorizationFailure } from "../utils/authorization.utils";
import { authorizationService } from "../services/authorization";
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
import { eventBus, userCreated, userRoleChanged } from "../events";
import { getUserService, getInvitationService, getOrganizationService } from "../services/service-factory";
import { UserValidationError } from "../services/users/user.service";

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
    const userService = getUserService();
    const preferences = await userService.getUserPreferences(userId);
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
    const userService = getUserService();
    const updatedPreferences = await userService.upsertUserPreferences(userId, filteredUpdates, req.user?.id, req.id);
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
      const authContext = authorizationService.buildContext(req.user);
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

    const organizationService = getOrganizationService();
    const managers = await organizationService.getManagersByDepartment(
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

    const userService = getUserService();
    const users = await userService.getAllUsers(filters);

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
    const invitationService = getInvitationService();
    const invites = await invitationService.getPendingInvitations(inviteFilters);

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
      const authContext = authorizationService.buildContext(req.user);

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

    const userService = getUserService();
    const users = await userService.getAllUsers(filters);
    res.json(users);
  } catch (error) {
    next(error);
  }
});

router.post("/users", requireAuth, requireRole(["system_admin", "hr_staff"]), async (req, res, next) => {
  try {
    // Create user using service (handles duplicate checking, password hashing, role assignment, events)
    const userService = getUserService();
    const user = await userService.createUser({
      data: req.body,
      actorId: req.user?.id,
      requestId: req.id
    });

    res.status(201).json(user);
  } catch (error) {
    if (error instanceof UserValidationError) {
      return res.status(400).json({ message: error.message });
    }
    if (error instanceof Error && error.message.includes('duplicate key')) {
      return res.status(400).json({ message: "Email already exists" });
    }
    next(error);
  }
});

router.patch("/users/:id", requireAuth, requireRole(["system_admin", "hr_staff"]), async (req, res, next) => {
  try {
    // Update user using service (handles password hashing)
    const userService = getUserService();
    const user = await userService.updateUser({
      id: req.params.id,
      data: req.body,
      actorId: req.user?.id,
      requestId: req.id
    });

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
    // Update roles using service (handles event publishing)
    const userService = getUserService();
    const userRoles = await userService.updateUserRoles({
      userId: req.params.id,
      roles: req.body.roles,
      actorId: req.user?.id,
      requestId: req.id
    });

    res.json({ userRoles });
  } catch (error) {
    if (error instanceof UserValidationError) {
      return res.status(400).json({ message: error.message });
    }
    next(error);
  }
});

router.post("/users/:id/disable", requireAuth, requireRole(["system_admin", "hr_staff"]), async (req, res, next) => {
  try {
    // Disable user using service (handles task reassignment)
    const userService = getUserService();
    const result = await userService.disableUser({
      userId: req.params.id,
      reassignOpenTasksTo: req.body.reassignOpenTasksTo,
      actorId: req.user?.id,
      requestId: req.id
    });

    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.post("/users/:id/enable", requireAuth, requireRole(["system_admin", "hr_staff"]), async (req, res, next) => {
  try {
    const userService = getUserService();
    const user = await userService.enableUser(req.params.id, req.user?.id, req.id);
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
    const userService = getUserService();
    const taskCount = await userService.getUserOpenTaskCount(req.params.id);
    res.json(taskCount);
  } catch (error) {
    next(error);
  }
});

export default router;
