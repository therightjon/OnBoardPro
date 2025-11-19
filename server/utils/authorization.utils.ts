import type { Express } from "express";
import { sql } from "drizzle-orm";
import { appRoleEnum } from "@shared/schemas";
import { storage } from "../db/storage";
import { db } from "../db/connection";
import { reportAuthorizationFailure } from "../observability/authMetrics";

type AppRole = (typeof appRoleEnum.enumValues)[number];

const APP_ROLE_SET: Set<string> = new Set(appRoleEnum.enumValues);
const PRIVILEGED_ROLES: Set<AppRole> = new Set([
  "system_admin",
  "hr_staff",
  "department_admin",
  "division_leader",
  "manager"
] as AppRole[]);

/**
 * Type guard to check if a value is a valid AppRole
 * @param value - The value to check
 * @returns True if the value is a valid AppRole
 */
export function isAppRole(value: unknown): value is AppRole {
  return typeof value === "string" && APP_ROLE_SET.has(value);
}

/**
 * Collects all roles for a user, including their primary role and any extra roles
 * @param user - The user object (optional)
 * @returns Set of AppRoles for the user
 */
export function collectUserRoles(user?: Express.User | null): Set<AppRole> {
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

/**
 * Checks if a user has any of the required roles
 * @param user - The user to check
 * @param required - Array of required roles
 * @returns True if the user has at least one of the required roles
 */
export function hasAnyRole(user: Express.User | undefined | null, required: readonly (string | AppRole)[]): boolean {
  const normalized = required.filter(isAppRole) as AppRole[];
  if (normalized.length === 0) {
    return false;
  }
  const roleSet = collectUserRoles(user);
  return normalized.some((role) => roleSet.has(role));
}

/**
 * Checks if a user has any privileged role (system_admin, hr_staff, department_admin, division_leader, manager)
 * @param user - The user to check
 * @returns True if the user has a privileged role
 */
export function hasPrivilegedRole(user: Express.User | undefined | null): boolean {
  const roleSet = collectUserRoles(user);
  for (const role of roleSet) {
    if (PRIVILEGED_ROLES.has(role)) {
      return true;
    }
  }
  return false;
}

/**
 * Checks if a user has any of the required roles and sends a 403 response if not
 * @param req - Express request object
 * @param res - Express response object
 * @param action - Action being attempted
 * @param roles - Array of required roles
 * @returns True if the user has sufficient privileges, false otherwise
 */
export function requirePrivileges(req: any, res: any, action: string, roles: string[]): boolean {
  if (!hasAnyRole(req.user, roles)) {
    logAuthorizationFailure({ req, resource: "general", action, reason: "role_mismatch" }).catch(() => {});
    res.status(403).json({ message: "Insufficient permissions" });
    return false;
  }
  return true;
}

/**
 * Logs an authorization failure to the audit log and reports metrics
 * @param params - Parameters for logging the authorization failure
 */
export async function logAuthorizationFailure(params: {
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
    await db.execute(sql`
      INSERT INTO audit_log (actor_id, candidate_id, task_id, event_type, details)
      VALUES (
        ${actorId ?? null}::uuid,
        ${candidateId ?? null}::uuid,
        ${taskId ?? null}::uuid,
        'authorization_denied',
        ${JSON.stringify(details)}::jsonb
      )
    `);
  } catch (error) {
    console.error("Failed to log authorization failure", error);
  }
}

/**
 * Fetches a candidate with authorization check
 * @param req - Express request object
 * @param res - Express response object
 * @param candidateId - The candidate ID to fetch
 * @param action - Action being attempted
 * @returns The candidate object if found and authorized, null otherwise
 */
export async function fetchCandidateWithAccess(req: any, res: any, candidateId: string, action: string) {
  const authContext = storage.buildAuthorizationContext(req.user);
  const candidate = await storage.getCandidate(candidateId, authContext);
  if (!candidate) {
    await logAuthorizationFailure({ req, resource: "candidate", resourceId: candidateId, action, reason: "not_found_or_scope" });
    res.status(404).json({ message: "Candidate not found" });
    return null;
  }
  return candidate;
}

/**
 * Fetches a task and its associated candidate with authorization check
 * @param req - Express request object
 * @param res - Express response object
 * @param taskId - The task ID to fetch
 * @param action - Action being attempted
 * @returns Object containing task and candidate if found and authorized, null otherwise
 */
export async function fetchTaskWithAccess(req: any, res: any, taskId: string, action: string) {
  const authContext = storage.buildAuthorizationContext(req.user);
  const task = await storage.getCandidateTask(taskId);
  if (!task) {
    res.status(404).json({ message: "Task not found" });
    return null;
  }
  const candidate = await storage.getCandidate(task.candidateId, authContext);
  if (!candidate) {
    await logAuthorizationFailure({ req, resource: "task", resourceId: taskId, action, reason: "candidate_not_found_or_scope" });
    res.status(404).json({ message: "Candidate not found" });
    return null;
  }
  return { task, candidate };
}

/**
 * Fetches a template with authorization check
 * @param req - Express request object
 * @param res - Express response object
 * @param templateId - The template ID to fetch
 * @param action - Action being attempted
 * @returns The template object if found, null otherwise
 */
export async function fetchTemplateWithAccess(req: any, res: any, templateId: string, action: string) {
  const template = await storage.getTemplate(templateId);
  if (!template) {
    await logAuthorizationFailure({ req, resource: "template", resourceId: templateId, action, reason: "not_found" });
    res.status(404).json({ message: "Template not found" });
    return null;
  }
  return template;
}
