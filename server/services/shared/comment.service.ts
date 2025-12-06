/**
 * Comment Service
 *
 * Business logic layer for comment management on candidates and tasks.
 * Handles comment creation, editing, deletion, and visibility rules.
 */

import type { Comment } from "@shared/schemas";
import type { CommentRepository, CommentWithAuthor, CommentStats } from "../../repositories/CommentRepository";

export interface CreateCommentInput {
  entityType: 'candidate' | 'task';
  entityId: string;
  body: string;
  visibility: 'internal' | 'external';
  parentId?: string | null;
  authorUserId: string;
  role: string;
}

export interface EditCommentInput {
  commentId: string;
  body: string;
  userId: string;
  userRole: string;
}

export interface DeleteCommentInput {
  commentId: string;
  userId: string;
  userRole: string;
}

export interface GetCommentsInput {
  entityType: 'candidate' | 'task';
  entityId: string;
  visibility?: 'all' | 'internal' | 'external';
  role: string;
  cursor?: string;
  limit?: number;
}

export interface GetCommentsResult {
  items: CommentWithAuthor[];
  nextCursor?: string;
  totalVisibleCount: number;
}

/**
 * Service for comment-related business operations
 */
export class CommentService {
  constructor(
    private commentRepo: CommentRepository
  ) {}

  /**
   * Get comments for a candidate with pagination and visibility filtering
   */
  async getCandidateComments(params: {
    candidateId: string;
    visibility?: 'all' | 'internal' | 'external';
    role: string;
    cursor?: string;
    limit?: number;
  }): Promise<GetCommentsResult> {
    return this.commentRepo.getCandidateComments(params);
  }

  /**
   * Get comments for a task with pagination and visibility filtering
   */
  async getTaskComments(params: {
    taskId: string;
    visibility?: 'all' | 'internal' | 'external';
    role: string;
    cursor?: string;
    limit?: number;
  }): Promise<GetCommentsResult> {
    return this.commentRepo.getTaskComments(params);
  }

  /**
   * Create a new comment
   */
  async createComment(input: CreateCommentInput): Promise<CommentWithAuthor> {
    return this.commentRepo.createComment({
      entityType: input.entityType,
      entityId: input.entityId,
      body: input.body,
      visibility: input.visibility,
      parentId: input.parentId || null,
      authorUserId: input.authorUserId,
      role: input.role
    });
  }

  /**
   * Edit an existing comment
   * Business rule: Only the author (within 5 min) or admin can edit
   */
  async editComment(input: EditCommentInput): Promise<Comment> {
    return this.commentRepo.editComment({
      id: input.commentId,
      body: input.body,
      userId: input.userId,
      userRole: input.userRole
    });
  }

  /**
   * Delete a comment (soft delete)
   * Business rule: Only the author (within 5 min) or admin can delete
   */
  async deleteComment(input: DeleteCommentInput): Promise<void> {
    await this.commentRepo.deleteComment({
      id: input.commentId,
      userId: input.userId,
      userRole: input.userRole
    });
  }

  /**
   * Get comment statistics for a candidate
   */
  async getCommentStats(params: { candidateId: string, role: string }): Promise<{
    profile: CommentStats;
    byTask: Record<string, CommentStats>;
  }> {
    return this.commentRepo.getCommentStats(params);
  }

  /**
   * Get comment statistics for a task
   */
  async getTaskCommentStats(taskId: string, role: string): Promise<CommentStats> {
    // For individual task stats, we can derive from the byTask result
    // or add a dedicated repository method later
    const stats = await this.commentRepo.getCommentStats({ candidateId: taskId, role });
    return stats.profile;
  }
}
