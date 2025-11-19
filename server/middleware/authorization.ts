import type { RequestHandler } from "express";
import { appRoleEnum } from "@shared/schemas";

type AppRole = (typeof appRoleEnum.enumValues)[number];

const APP_ROLE_SET: Set<string> = new Set(appRoleEnum.enumValues);

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

function hasAnyRole(user: Express.User | null | undefined, roles: AppRole[]): boolean {
  if (!user || roles.length === 0) return false;
  const userRoles = collectUserRoles(user);
  return roles.some((role) => userRoles.has(role));
}

async function logAuthorizationFailure(params: {
  req: any;
  resource: string;
  action: string;
  reason: string;
}): Promise<void> {
  try {
    const { reportAuthorizationFailure } = await import("../observability/authMetrics");
    await reportAuthorizationFailure({
      actorId: params.req.user?.id || 'anonymous',
      roles: params.req.user?.roles || [],
      resource: params.resource,
      action: params.action,
      reason: params.reason,
      timestamp: new Date()
    });
  } catch (error) {
    // Silently fail if metrics logging fails
    console.error("Failed to log authorization failure:", error);
  }
}

/**
 * Middleware to require authentication
 */
export function requireAuth(req: any, res: any, next: any): void {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ message: "Authentication required" });
  }
  next();
}

/**
 * Middleware to require specific roles
 * @param roles - Array of role names that are allowed
 * @returns Express middleware function
 */
export function requireRole(roles: string[]): RequestHandler {
  const normalizedRoles = roles.filter(isAppRole) as AppRole[];

  return async (req: any, res: any, next: any) => {
    if (!req.user) {
      await logAuthorizationFailure({
        req,
        resource: "general",
        action: `role:${normalizedRoles.join("|")}`,
        reason: "unauthenticated"
      });
      return res.status(401).json({ message: "Authentication required" });
    }

    if (normalizedRoles.length === 0) {
      return res.status(403).json({ message: "Insufficient permissions" });
    }

    if (!hasAnyRole(req.user, normalizedRoles)) {
      await logAuthorizationFailure({
        req,
        resource: "general",
        action: `role:${normalizedRoles.join("|")}`,
        reason: "role_mismatch"
      });
      return res.status(403).json({ message: "Insufficient permissions" });
    }

    next();
  };
}

// Export utility functions for use in other modules
export { isAppRole, collectUserRoles, hasAnyRole };
