import type { RequestHandler } from "express";
import { appRoleEnum } from "@shared/schemas";
import {
  isAppRole,
  collectUserRoles,
  hasAnyRole,
  logAuthorizationFailure
} from "../utils/authorization.utils";

type AppRole = (typeof appRoleEnum.enumValues)[number];

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
