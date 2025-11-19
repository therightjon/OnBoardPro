/**
 * Candidate Follower Repository
 *
 * Repository for managing candidate following system.
 * Allows users to follow candidates and receive notifications about updates.
 */

import { eq, and } from "drizzle-orm";
import {
  candidateFollowers,
  type CandidateFollower,
} from "@shared/schemas";
import { BaseRepository } from "../base/BaseRepository";

/**
 * Repository for candidate follower-related data operations
 * Extends BaseRepository to inherit common functionality
 */
export class CandidateFollowerRepository extends BaseRepository {
  /**
   * Get all followers for a candidate
   *
   * @param candidateId - Candidate ID
   * @returns Array of candidate followers
   */
  async getCandidateFollowers(candidateId: string): Promise<CandidateFollower[]> {
    return await this.db
      .select()
      .from(candidateFollowers)
      .where(eq(candidateFollowers.candidateId, candidateId));
  }

  /**
   * Add a follower to a candidate
   *
   * Uses onConflictDoNothing to avoid errors if the follower already exists.
   *
   * @param candidateId - Candidate ID
   * @param userId - User ID to add as follower
   */
  async addCandidateFollower(candidateId: string, userId: string): Promise<void> {
    await this.db
      .insert(candidateFollowers)
      .values({ candidateId, userId })
      .onConflictDoNothing();
  }

  /**
   * Remove a follower from a candidate
   *
   * @param candidateId - Candidate ID
   * @param userId - User ID to remove as follower
   */
  async removeCandidateFollower(candidateId: string, userId: string): Promise<void> {
    await this.db
      .delete(candidateFollowers)
      .where(and(
        eq(candidateFollowers.candidateId, candidateId),
        eq(candidateFollowers.userId, userId)
      ));
  }
}
