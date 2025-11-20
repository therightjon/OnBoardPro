/**
 * Candidate Service
 *
 * Business logic layer for candidate management
 * Coordinates between repositories, enforces business rules,
 * and publishes domain events
 */

import type { InsertCandidate, Candidate } from "@shared/schemas";
import type { CandidateRepository } from "../../repositories/candidates/CandidateRepository";
import type { CandidateTaskRepository } from "../../repositories/candidates/CandidateTaskRepository";
import type { CandidateFollowerRepository } from "../../repositories/candidates/CandidateFollowerRepository";
import type { TemplateRepository } from "../../repositories/templates/TemplateRepository";
import type { AuthorizationContext } from "../../repositories/base/types";
import { eventBus, candidateCreated, candidateStageChanged, candidateStatusChanged, templateApplied } from "../../events";

export interface CreateCandidateInput {
  data: InsertCandidate;
  templateId?: string;
  actorId?: string;
}

export interface UpdateCandidateInput {
  id: string;
  data: Partial<Candidate>;
  actorId?: string;
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
    private templateRepo: TemplateRepository
  ) {}

  /**
   * Create a new candidate
   * Optionally apply a template during creation
   */
  async createCandidate(input: CreateCandidateInput): Promise<Candidate> {
    const { data, templateId, actorId } = input;

    // Create the candidate
    const candidate = await this.candidateRepo.createCandidate(data);

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
    if (templateId) {
      // TODO: Implement template application logic
      // This should use a TemplateService
    }

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

    // Update the candidate
    const updatedCandidate = await this.candidateRepo.updateCandidate(id, data);
    if (!updatedCandidate) {
      return undefined;
    }

    // Detect and publish stage change event
    if (data.currentStageId && data.currentStageId !== existingCandidate.currentStageId) {
      // TODO: Get stage name from repository
      await eventBus.publish(candidateStageChanged(id, {
        previousStageId: existingCandidate.currentStageId,
        newStageId: data.currentStageId,
        stageName: 'Unknown', // TODO: Fetch stage name
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
      // TODO: Publish candidateArchived event
    }

    return candidate;
  }

  /**
   * Add a follower to a candidate
   */
  async addFollower(candidateId: string, userId: string, actorId?: string): Promise<void> {
    await this.followerRepo.addCandidateFollower(candidateId, userId);

    // TODO: Publish candidateFollowed event
  }

  /**
   * Remove a follower from a candidate
   */
  async removeFollower(candidateId: string, userId: string, actorId?: string): Promise<void> {
    await this.followerRepo.removeCandidateFollower(candidateId, userId);

    // TODO: Publish candidateUnfollowed event
  }

  /**
   * Get followers for a candidate
   */
  async getFollowers(candidateId: string): Promise<any[]> {
    return this.followerRepo.getCandidateFollowers(candidateId);
  }
}
