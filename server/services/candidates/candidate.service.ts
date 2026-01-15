/**
 * Candidate Service
 *
 * Business logic layer for candidate management
 * Coordinates between repositories, enforces business rules,
 * and publishes domain events
 */

import type { InsertCandidate, Candidate, CandidateTemplateStage } from "@shared/schemas";
import type { CandidateRepository } from "../../repositories/candidates/CandidateRepository";
import type { CandidateTaskRepository } from "../../repositories/candidates/CandidateTaskRepository";
import type { CandidateFollowerRepository } from "../../repositories/candidates/CandidateFollowerRepository";
import type { CandidateStageRepository } from "../../repositories/candidates/CandidateStageRepository";
import type { TemplateRepository } from "../../repositories/templates/TemplateRepository";
import type { AuthorizationContext } from "../../repositories/base/types";
import { eventBus, candidateCreated, candidateStageChanged, candidateStatusChanged, templateApplied, candidateArchived, candidateFollowed, candidateUnfollowed } from "../../events";
import { writeAuditLog } from "../shared/audit-logger";

export interface CreateCandidateInput {
  data: InsertCandidate;
  templateId?: string;
  actorId?: string;
  requestId?: string;
  authContext?: AuthorizationContext;
}

export class CandidateValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CandidateValidationError';
  }
}

export interface UpdateCandidateInput {
  id: string;
  data: Partial<Candidate>;
  actorId?: string;
  requestId?: string;
  authContext?: AuthorizationContext;
}

export interface ApplyTemplateInput {
  candidateId: string;
  templateId: string;
  actorId: string;
}

/**
 * Service for candidate-related business operations
 */
export class CandidateService {
  constructor(
    private candidateRepo: CandidateRepository,
    private taskRepo: CandidateTaskRepository,
    private followerRepo: CandidateFollowerRepository,
    private stageRepo: CandidateStageRepository,
    private templateRepo: TemplateRepository
  ) {}

  /**
   * Create a new candidate
   * Validates business rules and optionally applies a template
   */
  async createCandidate(input: CreateCandidateInput): Promise<Candidate> {
    const { data, templateId, actorId, authContext } = input;

    // Business Rule: Check for duplicate email in the same department
    if (data.email && data.departmentId) {
      const existingCandidates = await this.candidateRepo.getCandidates(
        { departmentId: data.departmentId },
        authContext
      );

      const duplicateEmail = existingCandidates.find(
        (c: any) => c.email.toLowerCase() === data.email.toLowerCase() &&
                    c.departmentId === data.departmentId
      );

      if (duplicateEmail) {
        throw new CandidateValidationError("Email already exists in this department");
      }
    }

    // Create the candidate
    const candidate = await this.candidateRepo.createCandidate(data);

    await writeAuditLog({
      actorId,
      resourceType: "candidate",
      resourceId: candidate.id,
      candidateId: candidate.id,
      action: "create",
      eventType: "candidate_created",
      requestId: input.requestId,
      details: {
        templateId,
        departmentId: candidate.departmentId,
        divisionId: candidate.divisionId,
        managerId: candidate.managerId,
        status: candidate.status
      }
    });

    // Publish domain event
    await eventBus.publish(candidateCreated(candidate.id, {
      firstName: candidate.firstName,
      lastName: candidate.lastName,
      email: candidate.email,
      departmentId: candidate.departmentId,
      divisionId: candidate.divisionId,
      managerId: candidate.managerId
    }, {
      actorId
    }));

    // Apply template if requested
    // Note: Template expansion is handled in routes via TemplateExpansionService.expandTemplate()
    // The templateId is passed here for audit logging purposes only

    return candidate;
  }

  /**
   * Update a candidate
   * Detects and publishes events for significant changes (stage, status)
   */
  async updateCandidate(input: UpdateCandidateInput): Promise<Candidate | undefined> {
    const { id, data, actorId } = input;

    // Get existing candidate to detect changes
    const existingCandidate = await this.candidateRepo.getCandidate(id);
    if (!existingCandidate) {
      return undefined;
    }

    // Preserve prior status when archiving to enable restore workflows
    const nextData = { ...data } as any;
    const isArchiving = data.archived === true || data.status === 'archived';
    const isRestoring = data.archived === false || data.status === 'active';
    if (isArchiving && existingCandidate) {
      nextData.statusBeforeArchive = (existingCandidate as any).statusBeforeArchive ?? existingCandidate.status;
    }
    if (isRestoring) {
      nextData.statusBeforeArchive = null;
    }

    // Update the candidate
    const updatedCandidate = await this.candidateRepo.updateCandidate(id, nextData);
    if (!updatedCandidate) {
      return undefined;
    }

    const changes: Record<string, { before: any; after: any }> = {};
    for (const key of Object.keys(nextData)) {
      const before = (existingCandidate as any)[key];
      const after = (updatedCandidate as any)[key];
      if (before !== after) {
        changes[key] = { before, after };
      }
    }
    if (Object.keys(changes).length > 0) {
      await writeAuditLog({
        actorId,
        resourceType: "candidate",
        resourceId: id,
        candidateId: id,
        action: "update",
        eventType: "candidate_updated",
        requestId: input.requestId,
        details: { changes }
      });
    }

    // Detect and publish stage change event
    if (data.currentStageId && data.currentStageId !== existingCandidate.currentStageId) {
      // Get stage name from repository
      const newStage = await this.stageRepo.getCandidateTemplateStageById(data.currentStageId);
      const stageName = newStage?.stageNameSnapshot ?? 'Unknown Stage';
      
      await eventBus.publish(candidateStageChanged(id, {
        previousStageId: existingCandidate.currentStageId,
        newStageId: data.currentStageId,
        stageName,
        automated: false
      }, {
        actorId
      }));
    }

    // Detect and publish status change event
    if (data.status && data.status !== existingCandidate.status) {
      await eventBus.publish(candidateStatusChanged(id, {
        previousStatus: existingCandidate.status,
        newStatus: data.status,
        reason: undefined
      }, {
        actorId
      }));
    }

    return updatedCandidate;
  }

  /**
   * Update candidate lifecycle status using repository state machine
   * and publish status change events.
   */
  async updateCandidateStatus(input: {
    id: string;
    newStatus: string;
    actorId: string;
    closeOpenTasks?: boolean;
    requestId?: string;
    authContext?: AuthorizationContext;
  }): Promise<{
    success: boolean;
    error?: string;
    code?: string;
    remainingTasks?: any[];
    cascaded?: {
      closedTasks: number;
      affectedCandidateStatus: string;
      reopenedTasks?: number;
    };
    candidate?: Candidate;
  }> {
    const { id, newStatus, actorId, closeOpenTasks = false, authContext } = input;
    const existing = await this.candidateRepo.getCandidate(id, authContext);
    if (!existing) {
      return { success: false, error: "Candidate not found", code: "CANDIDATE_NOT_FOUND" };
    }

    const result = await this.candidateRepo.updateCandidateStatus(
      id,
      newStatus,
      actorId,
      closeOpenTasks
    );

    if (!result.success) {
      return result;
    }

    const updated = await this.candidateRepo.getCandidate(id, authContext);
    if (!updated) {
      return { success: false, error: "Candidate not found after update", code: "CANDIDATE_NOT_FOUND" };
    }

    if (existing.status !== updated.status) {
      await eventBus.publish(candidateStatusChanged(id, {
        previousStatus: existing.status,
        newStatus: updated.status,
        reason: undefined
      }, {
        actorId
      }));

      await writeAuditLog({
        actorId,
        resourceType: "candidate",
        resourceId: id,
        candidateId: id,
        action: "status_change",
        eventType: "candidate_status_changed",
        requestId: input.requestId,
        details: {
          from: existing.status,
          to: updated.status,
          closeOpenTasks
        }
      });
    }

    return { ...result, candidate: updated };
  }

  /**
   * Get a single candidate by ID
   */
  async getCandidate(id: string, auth?: AuthorizationContext): Promise<Candidate | undefined> {
    return this.candidateRepo.getCandidate(id, auth);
  }

  /**
   * Get candidates with filtering and authorization
   */
  async getCandidates(filters?: any, auth?: AuthorizationContext): Promise<any[]> {
    return this.candidateRepo.getCandidates(filters, auth);
  }

  /**
   * Archive a candidate (soft delete)
   */
  async archiveCandidate(id: string, actorId?: string): Promise<Candidate | undefined> {
    const candidate = await this.candidateRepo.updateCandidate(id, { archived: true });

    if (candidate) {
      await writeAuditLog({
        actorId,
        resourceType: "candidate",
        resourceId: id,
        candidateId: id,
        action: "archive",
        eventType: "candidate_archived",
        details: { archived: true }
      });
      
      // Publish candidateArchived event
      await eventBus.publish(candidateArchived(id, {}, { actorId }));
    }

    return candidate;
  }

  /**
   * Add a follower to a candidate
   */
  async addFollower(candidateId: string, userId: string, actorId?: string): Promise<void> {
    await this.followerRepo.addCandidateFollower(candidateId, userId);

    await writeAuditLog({
      actorId,
      resourceType: "candidate",
      resourceId: candidateId,
      candidateId,
      action: "update",
      eventType: "candidate_follower_added",
      details: { followerId: userId }
    });

    // Publish candidateFollowed event
    await eventBus.publish(candidateFollowed(candidateId, userId, { actorId }));
  }

  /**
   * Remove a follower from a candidate
   */
  async removeFollower(candidateId: string, userId: string, actorId?: string): Promise<void> {
    await this.followerRepo.removeCandidateFollower(candidateId, userId);

    await writeAuditLog({
      actorId,
      resourceType: "candidate",
      resourceId: candidateId,
      candidateId,
      action: "update",
      eventType: "candidate_follower_removed",
      details: { followerId: userId }
    });

    // Publish candidateUnfollowed event
    await eventBus.publish(candidateUnfollowed(candidateId, userId, { actorId }));
  }

  /**
   * Get followers for a candidate
   */
  async getFollowers(candidateId: string): Promise<any[]> {
    return this.followerRepo.getCandidateFollowers(candidateId);
  }

  // ============================================================================
  // Candidate Stage Methods
  // ============================================================================

  /**
   * Get template stages snapshot for a candidate
   * Returns the candidate's specific template stage configuration at the time the template was applied
   */
  async getCandidateTemplateStages(candidateId: string): Promise<CandidateTemplateStage[]> {
    return this.stageRepo.getCandidateTemplateStages(candidateId);
  }

  /**
   * Get stage history for a candidate
   * Returns a chronological history of all stage transitions
   */
  async getCandidateStageHistory(candidateId: string): Promise<any[]> {
    return this.stageRepo.getCandidateStageHistory(candidateId);
  }

  // ============================================================================
  // Candidate Lifecycle / Task Management Methods
  // ============================================================================

  /**
   * Reset all non-archived tasks for a candidate to their initial state
   * Called when reactivating a candidate from archived/completed status
   * 
   * @param candidateId - Candidate ID
   * @returns Number of tasks that were reset
   */
  async resetCandidateTasksForReactivation(candidateId: string): Promise<number> {
    return this.taskRepo.resetCandidateTasksForReactivation(candidateId);
  }

  /**
   * Resolve candidate.self role assignments to actual user assignments
   * Called when a candidate is linked to a user account
   * 
   * @param candidateId - Candidate ID
   * @param userId - User ID to assign tasks to
   * @returns Array of tasks that were updated
   */
  async resolveCandidateSelfAssignments(candidateId: string, userId: string): Promise<any[]> {
    return this.taskRepo.resolveCandidateSelfAssignments(candidateId, userId);
  }
}
