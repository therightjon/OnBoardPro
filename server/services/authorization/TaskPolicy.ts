/**
 * Task Authorization Policy
 *
 * Defines authorization rules for candidate task resources
 */

import type { CandidateTask, Candidate } from "@shared/schemas";
import { BasePolicy, allow, deny, type AuthorizationResult, type Action } from "./policy-types";
import type { AuthorizationContext } from "../../repositories/base/types";

/**
 * Authorization policy for candidate tasks
 *
 * Rules:
 * - Tasks inherit permissions from their parent candidate
 * - If you can view the candidate, you can view their tasks
 * - Only privileged users and authorized managers can assign/update tasks
 * - Task assignees can update their own tasks (status, completion)
 */
export class TaskPolicy extends BasePolicy<CandidateTask & { candidate?: Candidate }> {
  readonly resourceType = "candidate_task" as const;

  authorize(
    context: AuthorizationContext,
    action: Action,
    resource?: (CandidateTask & { candidate?: Candidate }) | null
  ): AuthorizationResult {
    // Must be authenticated
    if (!this.isAuthenticated(context)) {
      return deny("not_authenticated");
    }

    // Privileged users have full access
    if (this.isPrivileged(context)) {
      return allow({ privileged: true });
    }

    // For list actions
    if (action === "view_list") {
      return allow({ scoped_by_candidate: true });
    }

    // For specific task operations, resource must be provided
    if (!resource) {
      return deny("resource_required");
    }

    // Handle specific actions
    switch (action) {
      case "view":
        return this.authorizeView(context, resource);
      case "create":
        return this.authorizeCreate(context, resource);
      case "update":
        return this.authorizeUpdate(context, resource);
      case "delete":
      case "archive":
        return this.authorizeDelete(context, resource);
      case "assign":
        return this.authorizeAssign(context, resource);
      default:
        return deny("unknown_action");
    }
  }

  /**
   * Check if user can view a task
   * Tasks inherit view permissions from their candidate
   */
  private authorizeView(
    context: AuthorizationContext,
    task: CandidateTask & { candidate?: Candidate }
  ): AuthorizationResult {
    if (!task.candidate) {
      return deny("candidate_required");
    }

    // Check candidate access first
    const candidateAccess = this.authorizeCandidateAccess(context, task.candidate);
    if (candidateAccess.allowed) {
      return allow({ inherited_from: "candidate" });
    }

    // Task assignee can always view their own task
    if (this.isOwner(context, task.assigneeUserId)) {
      return allow({ scope: "assignee" });
    }

    return deny("no_candidate_access");
  }

  /**
   * Check if user can create a task
   * Only privileged users and authorized managers can create tasks
   */
  private authorizeCreate(
    context: AuthorizationContext,
    task: CandidateTask & { candidate?: Candidate }
  ): AuthorizationResult {
    if (!task.candidate) {
      return deny("candidate_required");
    }

    // Check if user can update the candidate (implies can create tasks)
    const candidateAccess = this.authorizeCandidateUpdate(context, task.candidate);
    if (candidateAccess.allowed) {
      return allow({ inherited_from: "candidate_update" });
    }

    return deny("no_candidate_update_access");
  }

  /**
   * Check if user can update a task
   */
  private authorizeUpdate(
    context: AuthorizationContext,
    task: CandidateTask & { candidate?: Candidate }
  ): AuthorizationResult {
    if (!task.candidate) {
      return deny("candidate_required");
    }

    // Check if user can update the candidate
    const candidateAccess = this.authorizeCandidateUpdate(context, task.candidate);
    if (candidateAccess.allowed) {
      return allow({ inherited_from: "candidate_update" });
    }

    // Task assignee can update their own task (status, completion)
    if (this.isOwner(context, task.assigneeUserId)) {
      return allow({ scope: "assignee", limited: true });
    }

    return deny("no_update_access");
  }

  /**
   * Check if user can delete a task
   * Only privileged users can delete tasks
   */
  private authorizeDelete(
    context: AuthorizationContext,
    task: CandidateTask & { candidate?: Candidate }
  ): AuthorizationResult {
    // Already handled by privileged check
    return deny("requires_privileged_role");
  }

  /**
   * Check if user can assign a task
   */
  private authorizeAssign(
    context: AuthorizationContext,
    task: CandidateTask & { candidate?: Candidate }
  ): AuthorizationResult {
    if (!task.candidate) {
      return deny("candidate_required");
    }

    // Check if user can update the candidate
    const candidateAccess = this.authorizeCandidateUpdate(context, task.candidate);
    if (candidateAccess.allowed) {
      return allow({ inherited_from: "candidate_update" });
    }

    return deny("no_assign_access");
  }

  /**
   * Check if user has access to view a candidate
   * Simplified candidate access check
   */
  private authorizeCandidateAccess(
    context: AuthorizationContext,
    candidate: Candidate
  ): AuthorizationResult {
    // Department access
    if (
      this.hasAnyRole(context, ["department_admin"]) &&
      candidate.departmentId &&
      this.hasDepartmentAccess(context, candidate.departmentId)
    ) {
      return allow({ scope: "department" });
    }

    // Division access
    if (
      this.hasAnyRole(context, ["division_leader"]) &&
      candidate.divisionId &&
      this.hasDivisionAccess(context, candidate.divisionId)
    ) {
      return allow({ scope: "division" });
    }

    // Manager access
    if (
      this.hasAnyRole(context, ["manager"]) &&
      (this.canManageCandidate(context, candidate.id) ||
        this.isOwner(context, candidate.managerId))
    ) {
      return allow({ scope: "managed" });
    }

    // Self access (candidate viewing their own)
    if (context.isCandidate && this.isOwner(context, candidate.linkedUserId)) {
      return allow({ scope: "self" });
    }

    return deny("no_access");
  }

  /**
   * Check if user can update a candidate
   * Candidates cannot update themselves, but admins/managers can
   */
  private authorizeCandidateUpdate(
    context: AuthorizationContext,
    candidate: Candidate
  ): AuthorizationResult {
    // Department access
    if (
      this.hasAnyRole(context, ["department_admin"]) &&
      candidate.departmentId &&
      this.hasDepartmentAccess(context, candidate.departmentId)
    ) {
      return allow({ scope: "department" });
    }

    // Division access
    if (
      this.hasAnyRole(context, ["division_leader"]) &&
      candidate.divisionId &&
      this.hasDivisionAccess(context, candidate.divisionId)
    ) {
      return allow({ scope: "division" });
    }

    // Manager access
    if (
      this.hasAnyRole(context, ["manager"]) &&
      (this.canManageCandidate(context, candidate.id) ||
        this.isOwner(context, candidate.managerId))
    ) {
      return allow({ scope: "managed" });
    }

    return deny("no_update_access");
  }
}
