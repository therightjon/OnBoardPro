/**
 * Comment Service
 *
 * Business logic layer for comment management on candidates and tasks.
 * Handles comment creation, editing, deletion, and visibility rules.
 */

import type { Comment } from "@shared/schemas";
import type { CommentRepository, CommentWithAuthor, CommentStats } from "../../repositories/CommentRepository";
import { writeAuditLog } from "./audit-logger";

export interface CreateCommentInput {
  entityType: 'candidate' | 'task';
  entityId: string;
  body: string;
  visibility: 'internal' | 'external';
  parentId?: string | null;
  authorUserId: string;
  role: string;
  requestId?: string;
}

export interface EditCommentInput {
  id: string;
  body: string;
  userId: string;
  userRole: string;
  requestId?: string;
}

export interface DeleteCommentInput {
  id: string;
  userId: string;
  userRole: string;
  requestId?: string;
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
    const comment = await this.commentRepo.createComment({
      entityType: input.entityType,
      entityId: input.entityId,
      body: input.body,
      visibility: input.visibility,
      parentId: input.parentId || null,
      authorUserId: input.authorUserId,
      role: input.role
    });

    await writeAuditLog({
      actorId: input.authorUserId,
      resourceType: input.entityType === "candidate" ? "candidate" : "candidate_task",
      resourceId: input.entityId,
      candidateId: input.entityType === "candidate" ? input.entityId : null,
      taskId: input.entityType === "task" ? input.entityId : null,
      action: "create",
      eventType: "comment_created",
      requestId: input.requestId,
      details: {
        visibility: input.visibility,
        parentId: input.parentId || null
      }
    });

    return comment;
  }

  /**
   * Edit an existing comment
   * Business rule: Only the author (within 5 min) or admin can edit
   */
  async editComment(input: EditCommentInput): Promise<Comment> {
    const comment = await this.commentRepo.editComment({
      id: input.id,
      body: input.body,
      userId: input.userId,
      userRole: input.userRole
    });

    await writeAuditLog({
      actorId: input.userId,
      resourceType: "comment",
      resourceId: input.id,
      action: "update",
      eventType: "comment_updated",
      requestId: input.requestId,
      details: { userRole: input.userRole }
    });

    return comment;
  }

  /**
   * Delete a comment (soft delete)
   * Business rule: Only the author (within 5 min) or admin can delete
   */
  async deleteComment(input: DeleteCommentInput): Promise<void> {
    await this.commentRepo.deleteComment({
      id: input.id,
      userId: input.userId,
      userRole: input.userRole
    });

    await writeAuditLog({
      actorId: input.userId,
      resourceType: "comment",
      resourceId: input.id,
      action: "delete",
      eventType: "comment_deleted",
      requestId: input.requestId,
      details: { userRole: input.userRole }
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
