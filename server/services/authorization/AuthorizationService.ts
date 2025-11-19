/**
 * Authorization Service
 *
 * Central service for handling all authorization decisions in the application.
 * Uses policy-based access control to determine if users can perform actions on resources.
 */

import type { Express } from "express";
import type { Candidate, CandidateTask, Template, User } from "@shared/schemas";
import type { AuthorizationContext } from "../../repositories/base/types";
import type {
  AuthorizationPolicy,
  AuthorizationResult,
  ResourceType,
  Action,
  PolicyEvaluationResult,
  AuthorizationFailure
} from "./policy-types";
import { CandidatePolicy } from "./CandidatePolicy";
import { TaskPolicy } from "./TaskPolicy";
import { reportAuthorizationFailure } from "../../observability/authMetrics";
import { db } from "../../db/connection";
import { sql } from "drizzle-orm";

/**
 * Main authorization service
 * Coordinates policy evaluation and authorization logging
 */
export class AuthorizationService {
  private policies: Map<ResourceType, AuthorizationPolicy>;

  constructor() {
    this.policies = new Map();
    this.registerPolicy(new CandidatePolicy());
    this.registerPolicy(new TaskPolicy());
  }

  /**
   * Register a policy for a specific resource type
   */
  private registerPolicy(policy: AuthorizationPolicy): void {
    this.policies.set(policy.resourceType, policy);
  }

  /**
   * Get policy for a resource type
   */
  private getPolicy(resourceType: ResourceType): AuthorizationPolicy | undefined {
    return this.policies.get(resourceType);
  }

  /**
   * Build authorization context from Express user session
   * @param user - Express user object from session
   * @returns Authorization context with roles and scopes
   */
  buildContext(user: Express.User | null | undefined): AuthorizationContext {
    const roles = new Set<string>();
    const departmentIds = new Set<string>();
    const divisionIds = new Set<string>();
    const managedCandidateIds = new Set<string>();

    if (user) {
      // Add primary role
      if (user.role) {
        roles.add(user.role);
      }

      // Add additional roles
      if (Array.isArray((user as any).roles)) {
        for (const role of (user as any).roles) {
          if (role) roles.add(role);
        }
      }

      // Add department scopes
      if (Array.isArray((user as any).departmentScopes)) {
        for (const deptId of (user as any).departmentScopes) {
          if (deptId) departmentIds.add(deptId);
        }
      }

      // Add division scopes
      if (Array.isArray((user as any).divisionScopes)) {
        for (const divId of (user as any).divisionScopes) {
          if (divId) divisionIds.add(divId);
        }
      }

      // Add managed candidate scopes
      if (Array.isArray((user as any).managedCandidateIds)) {
        for (const candidateId of (user as any).managedCandidateIds) {
          if (candidateId) managedCandidateIds.add(candidateId);
        }
      }
    }

    const privileged = roles.has("system_admin") || roles.has("hr_staff");
    const isCandidate = roles.has("candidate");

    return {
      userId: user?.id ?? null,
      roles,
      departmentIds,
      divisionIds,
      managedCandidateIds,
      privileged,
      isCandidate
    };
  }

  /**
   * Authorize an action on a resource
   * @param context - Authorization context
   * @param resourceType - Type of resource
   * @param action - Action being attempted
   * @param resource - Optional resource object
   * @returns Authorization result
   */
  async authorize(
    context: AuthorizationContext,
    resourceType: ResourceType,
    action: Action,
    resource?: any
  ): Promise<AuthorizationResult> {
    const policy = this.getPolicy(resourceType);

    if (!policy) {
      return {
        allowed: false,
        reason: "no_policy_found",
        context: { resourceType }
      };
    }

    return await policy.authorize(context, action, resource);
  }

  /**
   * Authorize an action and return detailed evaluation result
   * @param context - Authorization context
   * @param resourceType - Type of resource
   * @param action - Action being attempted
   * @param resource - Optional resource object
   * @param resourceId - Optional resource ID for logging
   * @returns Policy evaluation result
   */
  async authorizeWithDetails(
    context: AuthorizationContext,
    resourceType: ResourceType,
    action: Action,
    resource?: any,
    resourceId?: string
  ): Promise<PolicyEvaluationResult> {
    const result = await this.authorize(context, resourceType, action, resource);

    return {
      ...result,
      resourceType,
      action,
      resourceId,
      userId: context.userId,
      roles: Array.from(context.roles),
      timestamp: new Date()
    };
  }

  /**
   * Authorize and throw if not allowed
   * @param context - Authorization context
   * @param resourceType - Type of resource
   * @param action - Action being attempted
   * @param resource - Optional resource object
   * @throws Error if not authorized
   */
  async requireAuthorization(
    context: AuthorizationContext,
    resourceType: ResourceType,
    action: Action,
    resource?: any
  ): Promise<void> {
    const result = await this.authorize(context, resourceType, action, resource);

    if (!result.allowed) {
      throw new Error(`Authorization failed: ${result.reason || "access_denied"}`);
    }
  }

  /**
   * Log an authorization failure
   * @param failure - Authorization failure details
   */
  async logFailure(failure: AuthorizationFailure): Promise<void> {
    try {
      // Skip logging in test environment unless explicitly enabled
      if (process.env.NODE_ENV === "test" && process.env.ENABLE_AUTH_AUDIT_IN_TESTS !== "1") {
        return;
      }

      // Report metrics
      reportAuthorizationFailure({
        resource: failure.resourceType,
        action: failure.action,
        reason: failure.reason,
        actorId: failure.userId,
        path: failure.path,
        method: failure.method,
        roles: failure.roles,
        candidateId: failure.resourceType === "candidate" ? failure.resourceId : null,
        taskId: failure.resourceType === "candidate_task" ? failure.resourceId : null,
        timestamp: failure.timestamp
      });

      // Log to audit table
      const details = {
        action: failure.action,
        resource: failure.resourceType,
        resourceId: failure.resourceId,
        reason: failure.reason,
        path: failure.path,
        method: failure.method,
        roles: failure.roles
      };

      const candidateId = failure.resourceType === "candidate" ? failure.resourceId : null;
      const taskId = failure.resourceType === "candidate_task" ? failure.resourceId : null;

      await db.execute(sql`
        INSERT INTO audit_log (actor_id, candidate_id, task_id, event_type, details)
        VALUES (
          ${failure.userId ?? null}::uuid,
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
   * Helper: Authorize candidate access and return 404/403 if denied
   * @param req - Express request
   * @param res - Express response
   * @param context - Authorization context
   * @param candidate - Candidate to authorize
   * @param action - Action being attempted
   * @returns True if authorized, false if response was sent
   */
  async authorizeCandidateOrRespond(
    req: any,
    res: any,
    context: AuthorizationContext,
    candidate: Candidate,
    action: Action
  ): Promise<boolean> {
    const result = await this.authorize(context, "candidate", action, candidate);

    if (!result.allowed) {
      await this.logFailure({
        userId: context.userId,
        roles: Array.from(context.roles),
        resourceType: "candidate",
        resourceId: candidate.id,
        action,
        reason: result.reason || "access_denied",
        path: req.originalUrl,
        method: req.method,
        timestamp: new Date()
      });

      res.status(404).json({ message: "Candidate not found" });
      return false;
    }

    return true;
  }

  /**
   * Helper: Authorize task access and return 404/403 if denied
   * @param req - Express request
   * @param res - Express response
   * @param context - Authorization context
   * @param task - Task to authorize
   * @param candidate - Associated candidate
   * @param action - Action being attempted
   * @returns True if authorized, false if response was sent
   */
  async authorizeTaskOrRespond(
    req: any,
    res: any,
    context: AuthorizationContext,
    task: CandidateTask,
    candidate: Candidate,
    action: Action
  ): Promise<boolean> {
    const result = await this.authorize(context, "candidate_task", action, { ...task, candidate });

    if (!result.allowed) {
      await this.logFailure({
        userId: context.userId,
        roles: Array.from(context.roles),
        resourceType: "candidate_task",
        resourceId: task.id,
        action,
        reason: result.reason || "access_denied",
        path: req.originalUrl,
        method: req.method,
        timestamp: new Date()
      });

      res.status(404).json({ message: "Task not found" });
      return false;
    }

    return true;
  }

  /**
   * Helper: Check if user has required roles and send 403 if not
   * @param context - Authorization context
   * @param res - Express response
   * @param requiredRoles - Array of required roles
   * @returns True if user has required roles
   */
  requireRoles(context: AuthorizationContext, res: any, requiredRoles: string[]): boolean {
    const hasRole = requiredRoles.some(role => context.roles.has(role));

    if (!hasRole) {
      res.status(403).json({ message: "Insufficient permissions" });
      return false;
    }

    return true;
  }
}

// Export singleton instance
export const authorizationService = new AuthorizationService();
