import { Router } from "express";
import { getSearchService, getDashboardService } from "../services/service-factory";
import { authorizationService } from "../services/authorization";
import { requireAuth } from "../middleware/authorization";
import { appRoleEnum } from "@shared/schemas";
import { reportAuthorizationFailure } from "../observability/authMetrics";
import { writeAuditLog } from "../services/shared/audit-logger";

const router = Router();

// Types and constants
type AppRole = (typeof appRoleEnum.enumValues)[number];

const APP_ROLE_SET: Set<string> = new Set(appRoleEnum.enumValues);
const PRIVILEGED_ROLES: Set<AppRole> = new Set([
  "system_admin",
  "hr_staff",
  "department_admin",
  "division_leader",
  "manager"
] as AppRole[]);

// Helper functions
function isAppRole(value: unknown): value is AppRole {
  return typeof value === "string" && APP_ROLE_SET.has(value);
}

function collectUserRoles(user?: Express.User | null): Set<AppRole> {
  const roles = new Set<AppRole>();
  if (!user) return roles;
  if (isAppRole(user.role)) {
    roles.add(user.role);
  }
  const extraRoles = Array.isArray((user as any).roles) ? (user as any).roles : [];
  for (const role of extraRoles) {
    if (isAppRole(role)) {
      roles.add(role);
    }
  }
  return roles;
}

function hasAnyRole(user: Express.User | undefined | null, required: readonly (string | AppRole)[]): boolean {
  const normalized = required.filter(isAppRole) as AppRole[];
  if (normalized.length === 0) {
    return false;
  }
  const roleSet = collectUserRoles(user);
  return normalized.some((role) => roleSet.has(role));
}

function hasPrivilegedRole(user: Express.User | undefined | null): boolean {
  const roleSet = collectUserRoles(user);
  for (const role of roleSet) {
    if (PRIVILEGED_ROLES.has(role)) {
      return true;
    }
  }
  return false;
}

async function logAuthorizationFailure(params: {
  req: any;
  resource: "candidate" | "task" | "general" | "template" | "settings";
  resourceId?: string | null;
  action: string;
  reason?: string;
}): Promise<void> {
  try {
    if (process.env.NODE_ENV === "test" && process.env.ENABLE_AUTH_AUDIT_IN_TESTS !== "1") {
      return;
    }
    const { req, resource, resourceId, action, reason } = params;
    const actorId = req?.user?.id ?? null;
    const candidateId = resource === "candidate" ? resourceId ?? null : null;
    const taskId = resource === "task" ? resourceId ?? null : null;
    const details = {
      action,
      resource,
      reason: reason ?? "denied",
      path: req?.originalUrl,
      method: req?.method,
      roles: Array.from(collectUserRoles(req?.user ?? undefined)),
    };
    reportAuthorizationFailure({
      resource,
      action,
      reason: reason ?? "denied",
      actorId,
      path: req?.originalUrl,
      method: req?.method,
      roles: details.roles,
      candidateId,
      taskId,
      timestamp: new Date()
    });
    await writeAuditLog({
      actorId,
      candidateId,
      taskId,
      resourceType: resource,
      resourceId,
      action: "access_denied",
      eventType: "authorization_denied",
      details
    });
  } catch (error) {
    console.error("Failed to log authorization failure", error);
  }
}

// Dashboard routes
router.get("/dashboard/metrics", requireAuth, async (req, res, next) => {
  try {
    const authContext = authorizationService.buildContext(req.user);
    const dashboardService = getDashboardService();
    const metrics = await dashboardService.getDashboardMetrics(authContext);
    res.json(metrics);
  } catch (error) {
    next(error);
  }
});

router.get("/dashboard/divisions", requireAuth, async (req, res, next) => {
  try {
    const allowedRoles: AppRole[] = ["system_admin", "hr_staff", "department_admin", "division_leader", "manager"];
    if (!hasAnyRole(req.user, allowedRoles)) {
      await logAuthorizationFailure({ req, resource: "general", action: "dashboard:divisions", reason: "role_mismatch" });
      return res.status(403).json({ message: "Insufficient permissions" });
    }
    const limitParam = typeof req.query.limit === "string" ? parseInt(req.query.limit, 10) : NaN;
    const limit = Number.isFinite(limitParam) ? limitParam : 4;
    const authContext = authorizationService.buildContext(req.user);
    const dashboardService = getDashboardService();
    const stats = await dashboardService.getDivisionActiveCandidateCounts(limit, authContext);
    res.json(stats);
  } catch (error) {
    next(error);
  }
});

router.get("/dashboard/recent-activity", requireAuth, async (req, res, next) => {
  try {
    const allowedRoles: AppRole[] = ["system_admin", "hr_staff", "department_admin", "division_leader", "manager"];
    if (!hasAnyRole(req.user, allowedRoles)) {
      await logAuthorizationFailure({ req, resource: "general", action: "dashboard:recent-activity", reason: "role_mismatch" });
      return res.status(403).json({ message: "Insufficient permissions" });
    }
    const limitParam = typeof req.query.limit === "string" ? parseInt(req.query.limit, 10) : NaN;
    const limit = Number.isFinite(limitParam) ? limitParam : 5;
    const authContext = authorizationService.buildContext(req.user);
    const dashboardService = getDashboardService();
    const events = await dashboardService.getRecentActivityEvents(limit, authContext);
    res.json(events);
  } catch (error) {
    next(error);
  }
});

// Search API endpoints
router.get("/search/departments", requireAuth, async (req, res, next) => {
  try {
    if (!hasPrivilegedRole(req.user)) {
      await logAuthorizationFailure({ req, resource: "general", action: "search:departments", reason: "role_mismatch" });
      return res.status(403).json({ message: "Insufficient permissions" });
    }
    const { q } = req.query;
    const query = typeof q === 'string' ? q : '';
    const searchService = getSearchService();
    const results = await searchService.searchDepartments(query);
    res.json({ items: results, query });
  } catch (error) {
    console.error('search departments error:', error);
    res.status(500).json({ error: 'SEARCH_DEPARTMENTS_FAILED', message: error instanceof Error ? error.message : 'Unknown error' });
  }
});

router.get("/search/divisions", requireAuth, async (req, res, next) => {
  try {
    if (!hasPrivilegedRole(req.user)) {
      await logAuthorizationFailure({ req, resource: "general", action: "search:divisions", reason: "role_mismatch" });
      return res.status(403).json({ message: "Insufficient permissions" });
    }
    const { q, departmentId } = req.query;
    const query = typeof q === 'string' ? q : '';
    const searchService = getSearchService();
    const results = await searchService.searchDivisions(query, typeof departmentId === 'string' ? departmentId : undefined);
    res.json({ items: results, query });
  } catch (error) {
    console.error('search divisions error:', error);
    res.status(500).json({ error: 'SEARCH_DIVISIONS_FAILED', message: error instanceof Error ? error.message : 'Unknown error' });
  }
});

router.get("/search/users", requireAuth, async (req, res, next) => {
  try {
    if (!hasAnyRole(req.user, ["system_admin", "hr_staff", "department_admin", "division_leader"])) {
      await logAuthorizationFailure({ req, resource: "general", action: "search:users", reason: "role_mismatch" });
      return res.status(403).json({ message: "Insufficient permissions" });
    }
  const q = (req.query.q ?? '').toString().trim();
  const role = (req.query.role ?? '').toString().trim();
  const departmentId = typeof req.query.departmentId === 'string' ? req.query.departmentId : undefined;
  const divisionId = typeof req.query.divisionId === 'string' ? req.query.divisionId : undefined;
  const searchService = getSearchService();
  const results = await searchService.searchUsers(q, {
    role: role || undefined,
    departmentId,
    divisionId
  });
    res.setHeader('Content-Type', 'application/json');
    res.status(200).json({ items: results, query: q });
  } catch (error) {
    console.error('search users error:', error);
    res.status(500).json({ error: 'SEARCH_USERS_FAILED', message: error instanceof Error ? error.message : 'Unknown error' });
  }
});

export default router;
