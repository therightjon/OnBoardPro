/**
 * Authorization Policy Types
 *
 * Defines the core types and interfaces for policy-based authorization
 */

import type { Express } from "express";
import type { AuthorizationContext } from "../repositories/base/types";

/**
 * Result of an authorization check
 */
export interface AuthorizationResult {
  /** Whether the action is allowed */
  allowed: boolean;
  /** Reason for denial (if not allowed) */
  reason?: string;
  /** Additional context about the decision */
  context?: Record<string, any>;
}

/**
 * Resource types that can be authorized
 */
export type ResourceType =
  | "candidate"
  | "candidate_task"
  | "template"
  | "template_task"
  | "template_stage"
  | "user"
  | "department"
  | "division"
  | "notification"
  | "comment"
  | "settings"
  | "audit_log";

/**
 * Common actions that can be performed on resources
 */
export type Action =
  | "view"
  | "view_list"
  | "create"
  | "update"
  | "delete"
  | "archive"
  | "restore"
  | "assign"
  | "comment"
  | "follow"
  | "export"
  | "manage_permissions";

/**
 * Base policy interface
 * All authorization policies must implement this interface
 */
export interface AuthorizationPolicy<TResource = any> {
  /**
   * Check if an action is allowed on a resource
   * @param context - Authorization context for the user
   * @param action - Action being attempted
   * @param resource - Optional resource being accessed (null for create/list operations)
   * @returns Authorization result
   */
  authorize(
    context: AuthorizationContext,
    action: Action,
    resource?: TResource | null
  ): Promise<AuthorizationResult> | AuthorizationResult;

  /**
   * Get the resource type this policy handles
   */
  readonly resourceType: ResourceType;
}

/**
 * Policy evaluation result with detailed information
 */
export interface PolicyEvaluationResult extends AuthorizationResult {
  /** Resource type that was evaluated */
  resourceType: ResourceType;
  /** Action that was evaluated */
  action: Action;
  /** Resource ID (if applicable) */
  resourceId?: string;
  /** User ID who attempted the action */
  userId: string | null;
  /** Roles the user has */
  roles: string[];
  /** Timestamp of the evaluation */
  timestamp: Date;
}

/**
 * Authorization failure details for logging
 */
export interface AuthorizationFailure {
  /** User who attempted the action */
  userId: string | null;
  /** Roles the user has */
  roles: string[];
  /** Resource type */
  resourceType: ResourceType;
  /** Resource ID (if applicable) */
  resourceId?: string;
  /** Action attempted */
  action: Action;
  /** Reason for failure */
  reason: string;
  /** HTTP request path */
  path?: string;
  /** HTTP method */
  method?: string;
  /** Timestamp */
  timestamp: Date;
}

/**
 * Authorization success details for audit logging
 */
export interface AuthorizationSuccess {
  /** User who performed the action */
  userId: string | null;
  /** Roles the user has */
  roles: string[];
  /** Resource type */
  resourceType: ResourceType;
  /** Resource ID (if applicable) */
  resourceId?: string;
  /** Action performed */
  action: Action;
  /** HTTP request path */
  path?: string;
  /** HTTP method */
  method?: string;
  /** Timestamp */
  timestamp: Date;
}

/**
 * Helper to create a successful authorization result
 */
export function allow(context?: Record<string, any>): AuthorizationResult {
  return {
    allowed: true,
    context
  };
}

/**
 * Helper to create a failed authorization result
 */
export function deny(reason: string, context?: Record<string, any>): AuthorizationResult {
  return {
    allowed: false,
    reason,
    context
  };
}

/**
 * Base policy class with common authorization logic
 */
export abstract class BasePolicy<TResource = any> implements AuthorizationPolicy<TResource> {
  abstract readonly resourceType: ResourceType;

  abstract authorize(
    context: AuthorizationContext,
    action: Action,
    resource?: TResource | null
  ): Promise<AuthorizationResult> | AuthorizationResult;

  /**
   * Check if user has any of the required roles
   */
  protected hasAnyRole(context: AuthorizationContext, roles: string[]): boolean {
    return roles.some(role => context.roles.has(role));
  }

  /**
   * Check if user has all of the required roles
   */
  protected hasAllRoles(context: AuthorizationContext, roles: string[]): boolean {
    return roles.every(role => context.roles.has(role));
  }

  /**
   * Check if user is privileged (system_admin or hr_staff)
   */
  protected isPrivileged(context: AuthorizationContext): boolean {
    return context.privileged;
  }

  /**
   * Check if user is authenticated
   */
  protected isAuthenticated(context: AuthorizationContext): boolean {
    return context.userId !== null;
  }

  /**
   * Check if user is the owner of a resource
   */
  protected isOwner(context: AuthorizationContext, ownerId: string | null | undefined): boolean {
    if (!ownerId || !context.userId) return false;
    return context.userId === ownerId;
  }

  /**
   * Check if user has access to a department
   */
  protected hasDepartmentAccess(
    context: AuthorizationContext,
    departmentId: string | null | undefined
  ): boolean {
    if (!departmentId) return false;
    return context.departmentIds.has(departmentId);
  }

  /**
   * Check if user has access to a division
   */
  protected hasDivisionAccess(
    context: AuthorizationContext,
    divisionId: string | null | undefined
  ): boolean {
    if (!divisionId) return false;
    return context.divisionIds.has(divisionId);
  }

  /**
   * Check if user can manage a specific candidate
   */
  protected canManageCandidate(
    context: AuthorizationContext,
    candidateId: string | null | undefined
  ): boolean {
    if (!candidateId) return false;
    return context.managedCandidateIds.has(candidateId);
  }
}
