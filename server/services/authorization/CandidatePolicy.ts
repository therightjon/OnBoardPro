/**
 * Candidate Authorization Policy
 *
 * Defines authorization rules for candidate resources
 */

import type { Candidate } from "@shared/schemas";
import { BasePolicy, allow, deny, type AuthorizationResult, type Action } from "./policy-types";
import type { AuthorizationContext } from "../../repositories/base/types";

/**
 * Authorization policy for candidates
 *
 * Rules:
 * - system_admin and hr_staff: Full access to all candidates
 * - department_admin: Access to candidates in their departments
 * - division_leader: Access to candidates in their divisions
 * - manager: Access to candidates they manage (direct reports + scoped candidates)
 * - candidate: Access only to their own record (view only, sanitized)
 * - others: No access
 */
export class CandidatePolicy extends BasePolicy<Candidate> {
  readonly resourceType = "candidate" as const;

  authorize(
    context: AuthorizationContext,
    action: Action,
    resource?: Candidate | null
  ): AuthorizationResult {
    // Must be authenticated
    if (!this.isAuthenticated(context)) {
      return deny("not_authenticated");
    }

    // Privileged users (system_admin, hr_staff) have full access
    if (this.isPrivileged(context)) {
      return allow({ privileged: true });
    }

    // Handle view_list action (listing candidates)
    if (action === "view_list") {
      return this.authorizeList(context);
    }

    // For specific candidate operations, resource must be provided
    if (!resource) {
      return deny("resource_required");
    }

    // Handle specific actions
    switch (action) {
      case "view":
        return this.authorizeView(context, resource);
      case "create":
        return this.authorizeCreate(context);
      case "update":
        return this.authorizeUpdate(context, resource);
      case "delete":
      case "archive":
        return this.authorizeDelete(context, resource);
      case "restore":
        return this.authorizeRestore(context, resource);
      case "comment":
        return this.authorizeComment(context, resource);
      case "follow":
        return this.authorizeFollow(context, resource);
      default:
        return deny("unknown_action");
    }
  }

  /**
   * Check if user can list candidates
   * Department admins, division leaders, and managers can list scoped candidates
   */
  private authorizeList(context: AuthorizationContext): AuthorizationResult {
    // Department admins can list candidates in their departments
    if (this.hasAnyRole(context, ["department_admin"]) && context.departmentIds.size > 0) {
      return allow({ scope: "department" });
    }

    // Division leaders can list candidates in their divisions
    if (this.hasAnyRole(context, ["division_leader"]) && context.divisionIds.size > 0) {
      return allow({ scope: "division" });
    }

    // Managers can list their managed candidates
    if (this.hasAnyRole(context, ["manager"]) && context.managedCandidateIds.size > 0) {
      return allow({ scope: "managed" });
    }

    // Candidates can only see themselves
    if (context.isCandidate) {
      return allow({ scope: "self" });
    }

    return deny("no_list_scope");
  }

  /**
   * Check if user can view a specific candidate
   */
  private authorizeView(context: AuthorizationContext, candidate: Candidate): AuthorizationResult {
    // Department admins can view candidates in their departments
    if (
      this.hasAnyRole(context, ["department_admin"]) &&
      candidate.departmentId &&
      this.hasDepartmentAccess(context, candidate.departmentId)
    ) {
      return allow({ scope: "department" });
    }

    // Division leaders can view candidates in their divisions
    if (
      this.hasAnyRole(context, ["division_leader"]) &&
      candidate.divisionId &&
      this.hasDivisionAccess(context, candidate.divisionId)
    ) {
      return allow({ scope: "division" });
    }

    // Managers can view candidates they manage
    if (
      this.hasAnyRole(context, ["manager"]) &&
      (this.canManageCandidate(context, candidate.id) ||
        this.isOwner(context, candidate.managerId))
    ) {
      return allow({ scope: "managed" });
    }

    // Candidates can view their own record
    if (context.isCandidate && this.isOwner(context, candidate.linkedUserId)) {
      return allow({ scope: "self", sanitized: true });
    }

    return deny("not_in_scope");
  }

  /**
   * Check if user can create candidates
   * Only privileged users can create candidates
   */
  private authorizeCreate(context: AuthorizationContext): AuthorizationResult {
    // Already handled by privileged check in main authorize method
    return deny("requires_privileged_role");
  }

  /**
   * Check if user can update a candidate
   */
  private authorizeUpdate(context: AuthorizationContext, candidate: Candidate): AuthorizationResult {
    // Department admins can update candidates in their departments
    if (
      this.hasAnyRole(context, ["department_admin"]) &&
      candidate.departmentId &&
      this.hasDepartmentAccess(context, candidate.departmentId)
    ) {
      return allow({ scope: "department" });
    }

    // Division leaders can update candidates in their divisions
    if (
      this.hasAnyRole(context, ["division_leader"]) &&
      candidate.divisionId &&
      this.hasDivisionAccess(context, candidate.divisionId)
    ) {
      return allow({ scope: "division" });
    }

    // Managers can update candidates they manage
    if (
      this.hasAnyRole(context, ["manager"]) &&
      (this.canManageCandidate(context, candidate.id) ||
        this.isOwner(context, candidate.managerId))
    ) {
      return allow({ scope: "managed" });
    }

    // Candidates cannot update their own record
    return deny("not_in_scope");
  }

  /**
   * Check if user can delete/archive a candidate
   * Only privileged users can archive candidates
   */
  private authorizeDelete(context: AuthorizationContext, candidate: Candidate): AuthorizationResult {
    // Already handled by privileged check
    return deny("requires_privileged_role");
  }

  /**
   * Check if user can restore an archived candidate
   * Only privileged users can restore candidates
   */
  private authorizeRestore(context: AuthorizationContext, candidate: Candidate): AuthorizationResult {
    // Already handled by privileged check
    return deny("requires_privileged_role");
  }

  /**
   * Check if user can comment on a candidate
   * Anyone who can view the candidate can comment
   */
  private authorizeComment(context: AuthorizationContext, candidate: Candidate): AuthorizationResult {
    // If user can view, they can comment
    const viewResult = this.authorizeView(context, candidate);
    if (viewResult.allowed) {
      return allow({ inherited_from: "view" });
    }
    return deny("cannot_view_candidate");
  }

  /**
   * Check if user can follow a candidate
   * Anyone who can view the candidate can follow
   */
  private authorizeFollow(context: AuthorizationContext, candidate: Candidate): AuthorizationResult {
    // If user can view, they can follow
    const viewResult = this.authorizeView(context, candidate);
    if (viewResult.allowed) {
      return allow({ inherited_from: "view" });
    }
    return deny("cannot_view_candidate");
  }
}
