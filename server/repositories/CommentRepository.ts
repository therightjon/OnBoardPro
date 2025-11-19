/**
 * Comment Repository
 *
 * Manages comments on candidates and tasks with visibility rules.
 * Supports internal (staff-only) and external (visible to candidates) comments.
 * Implements soft deletion with cascading to child replies.
 */

import { eq, and, or, inArray, desc, lte, sql } from "drizzle-orm";
import {
  comments,
  users,
  candidateTasks,
  type Comment
} from "@shared/schemas";
import { BaseRepository } from "./base/BaseRepository";
import type { db as DbType } from "../db/connection";
import type { Pool } from "pg";

/**
 * Comment with author information
 */
export interface CommentWithAuthor {
  id: string;
  entityType: 'candidate' | 'task';
  entityId: string;
  body: string;
  visibility: 'internal' | 'external';
  parentId: string | null;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
  author: {
    id: string;
    firstName: string;
    lastName: string;
  } | null;
}

/**
 * Comment statistics
 */
export interface CommentStats {
  internalCount: number;
  externalCount: number;
  totalVisible: number;
}

export class CommentRepository extends BaseRepository {
  constructor(db: typeof DbType, pool: Pool) {
    super(db, pool);
  }

  /**
   * Get comments for a candidate with pagination
   *
   * Visibility rules:
   * - Candidates can only see 'external' comments
   * - Staff can filter by 'all', 'internal', or 'external'
   *
   * @param params - Query parameters
   * @param params.candidateId - ID of the candidate
   * @param params.visibility - Filter by visibility: 'all', 'internal', or 'external' (default: 'all')
   * @param params.role - User role for visibility filtering ('candidate' limits to external only)
   * @param params.cursor - Pagination cursor
   * @param params.limit - Maximum number of comments to return (default: 20)
   * @returns Promise resolving to paginated comments with total count
   */
  async getCandidateComments(params: {
    candidateId: string;
    visibility?: 'all' | 'internal' | 'external';
    role: string;
    cursor?: string;
    limit?: number;
  }): Promise<{ items: CommentWithAuthor[]; nextCursor?: string; totalVisibleCount: number }> {
    const { candidateId, visibility = 'all', role, cursor, limit = 20 } = params;
    const cursorObj = this.decodeCursor(cursor);
    const visibilityFilter = role === 'candidate' ? 'external' : visibility;
    const whereParts: any[] = [
      eq(comments.entityType, 'candidate' as any),
      eq(comments.entityId, candidateId),
      eq(comments.isDeleted, false)
    ];
    if (visibilityFilter !== 'all') {
      whereParts.push(eq(comments.visibility, visibilityFilter as any));
    }
    if (cursorObj) {
      whereParts.push(lte(comments.createdAt, cursorObj.createdAt));
    }

    const rows = await this.db
      .select({
        id: comments.id,
        entityType: comments.entityType,
        entityId: comments.entityId,
        body: comments.body,
        visibility: comments.visibility,
        parentId: comments.parentId,
        isDeleted: comments.isDeleted,
        createdAt: comments.createdAt,
        updatedAt: comments.updatedAt,
        author: { id: users.id, firstName: users.firstName, lastName: users.lastName }
      })
      .from(comments)
      .leftJoin(users, eq(users.id, comments.authorUserId))
      .where(and(...whereParts))
      .orderBy(desc(comments.createdAt), desc(comments.id))
      .limit(limit + 1);

    const items = rows.slice(0, limit);
    const next = rows.length > limit
      ? this.encodeCursor({ createdAt: items[items.length - 1].createdAt as any, id: items[items.length - 1].id })
      : undefined;

    const countRows = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(comments)
      .where(and(
        eq(comments.entityType, 'candidate' as any),
        eq(comments.entityId, candidateId),
        eq(comments.isDeleted, false),
        visibilityFilter === 'all' ? sql`true` : eq(comments.visibility, visibilityFilter as any)
      ));

    return { items: items as CommentWithAuthor[], nextCursor: next, totalVisibleCount: countRows[0]?.count || 0 };
  }

  /**
   * Get comments for a task with pagination
   *
   * Visibility rules:
   * - Candidates can only see 'external' comments
   * - Staff can filter by 'all', 'internal', or 'external'
   *
   * @param params - Query parameters
   * @param params.taskId - ID of the task
   * @param params.visibility - Filter by visibility: 'all', 'internal', or 'external' (default: 'all')
   * @param params.role - User role for visibility filtering ('candidate' limits to external only)
   * @param params.cursor - Pagination cursor
   * @param params.limit - Maximum number of comments to return (default: 20)
   * @returns Promise resolving to paginated comments with total count
   */
  async getTaskComments(params: {
    taskId: string;
    visibility?: 'all' | 'internal' | 'external';
    role: string;
    cursor?: string;
    limit?: number;
  }): Promise<{ items: CommentWithAuthor[]; nextCursor?: string; totalVisibleCount: number }> {
    const { taskId, visibility = 'all', role, cursor, limit = 20 } = params;
    const cursorObj = this.decodeCursor(cursor);
    const visibilityFilter = role === 'candidate' ? 'external' : visibility;
    const whereParts: any[] = [
      eq(comments.entityType, 'task' as any),
      eq(comments.entityId, taskId),
      eq(comments.isDeleted, false)
    ];
    if (visibilityFilter !== 'all') {
      whereParts.push(eq(comments.visibility, visibilityFilter as any));
    }
    if (cursorObj) {
      whereParts.push(lte(comments.createdAt, cursorObj.createdAt));
    }

    const rows = await this.db
      .select({
        id: comments.id,
        entityType: comments.entityType,
        entityId: comments.entityId,
        body: comments.body,
        visibility: comments.visibility,
        parentId: comments.parentId,
        isDeleted: comments.isDeleted,
        createdAt: comments.createdAt,
        updatedAt: comments.updatedAt,
        author: { id: users.id, firstName: users.firstName, lastName: users.lastName }
      })
      .from(comments)
      .leftJoin(users, eq(users.id, comments.authorUserId))
      .where(and(...whereParts))
      .orderBy(desc(comments.createdAt), desc(comments.id))
      .limit(limit + 1);

    const items = rows.slice(0, limit);
    const next = rows.length > limit
      ? this.encodeCursor({ createdAt: items[items.length - 1].createdAt as any, id: items[items.length - 1].id })
      : undefined;

    const countRows = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(comments)
      .where(and(
        eq(comments.entityType, 'task' as any),
        eq(comments.entityId, taskId),
        eq(comments.isDeleted, false),
        visibilityFilter === 'all' ? sql`true` : eq(comments.visibility, visibilityFilter as any)
      ));

    return { items: items as CommentWithAuthor[], nextCursor: next, totalVisibleCount: countRows[0]?.count || 0 };
  }

  /**
   * Create a new comment
   *
   * Visibility rules:
   * - Candidates can only create 'external' comments (throws error if attempting 'internal')
   * - If replying to a parent comment, inherits the parent's visibility
   *
   * @param params - Comment creation parameters
   * @param params.entityType - Type of entity: 'candidate' or 'task'
   * @param params.entityId - ID of the entity being commented on
   * @param params.authorUserId - ID of the user creating the comment
   * @param params.role - Role of the user creating the comment
   * @param params.body - Comment text content
   * @param params.visibility - Visibility level: 'internal' or 'external'
   * @param params.parentId - Optional ID of parent comment if this is a reply
   * @returns Promise resolving to the created comment with author information
   * @throws Error if candidate attempts to create internal comment or parent not found
   */
  async createComment(params: {
    entityType: 'candidate' | 'task';
    entityId: string;
    authorUserId: string;
    role: string;
    body: string;
    visibility: 'internal' | 'external';
    parentId?: string | null;
  }): Promise<CommentWithAuthor> {
    const { entityType, entityId, authorUserId, role, body, visibility, parentId } = params;
    let finalVisibility = visibility;

    if (role === 'candidate' && visibility === 'internal') {
      throw new Error('Candidates can only create external comments');
    }

    if (parentId) {
      const [parent] = await this.db.select().from(comments).where(eq(comments.id, parentId));
      if (!parent) throw new Error('Parent comment not found');
      finalVisibility = parent.visibility as any;
    }

    const [createdRow] = await this.db
      .insert(comments)
      .values({
        entityType: entityType as any,
        entityId,
        authorUserId,
        body,
        visibility: finalVisibility as any,
        parentId: parentId || null
      })
      .returning();

    const [created] = await this.db
      .select({
        id: comments.id,
        entityType: comments.entityType,
        entityId: comments.entityId,
        body: comments.body,
        visibility: comments.visibility,
        parentId: comments.parentId,
        isDeleted: comments.isDeleted,
        createdAt: comments.createdAt,
        updatedAt: comments.updatedAt,
        author: { id: users.id, firstName: users.firstName, lastName: users.lastName }
      })
      .from(comments)
      .leftJoin(users, eq(users.id, comments.authorUserId))
      .where(eq(comments.id, createdRow.id));

    return created as CommentWithAuthor;
  }

  /**
   * Edit an existing comment
   *
   * Permission rules:
   * - Author can edit within 5 minutes of creation
   * - system_admin and hr_staff can edit any comment at any time
   *
   * @param params - Edit parameters
   * @param params.id - ID of the comment to edit
   * @param params.userId - ID of the user attempting to edit
   * @param params.userRole - Role of the user attempting to edit
   * @param params.body - New comment text
   * @returns Promise resolving to the updated comment
   * @throws Error if comment not found, already deleted, or user lacks permission
   */
  async editComment(params: {
    id: string;
    userId: string;
    userRole: string;
    body: string;
  }): Promise<Comment> {
    const { id, userId, userRole, body } = params;
    const [existing] = await this.db.select().from(comments).where(eq(comments.id, id));

    if (!existing || existing.isDeleted) {
      throw new Error('Comment not found');
    }

    const now = new Date();
    const createdAt = new Date(existing.createdAt as any);
    const diffMs = now.getTime() - createdAt.getTime();
    const canEdit =
      (existing.authorUserId === userId && diffMs <= 5 * 60 * 1000) ||
      ['system_admin', 'hr_staff'].includes(userRole);

    if (!canEdit) {
      throw new Error('Not permitted to edit comment');
    }

    const [updated] = await this.db
      .update(comments)
      .set({ body, updatedAt: new Date() })
      .where(eq(comments.id, id))
      .returning();

    return updated as Comment;
  }

  /**
   * Delete a comment (soft delete)
   *
   * Permission rules:
   * - Author can delete within 5 minutes of creation
   * - system_admin and hr_staff can delete any comment at any time
   *
   * Cascading behavior:
   * - Marks the target comment as deleted
   * - Also marks all direct replies (child comments) as deleted
   *
   * @param params - Delete parameters
   * @param params.id - ID of the comment to delete
   * @param params.userId - ID of the user attempting to delete
   * @param params.userRole - Role of the user attempting to delete
   * @returns Promise that resolves when deletion is complete
   * @throws Error if comment not found, already deleted, or user lacks permission
   */
  async deleteComment(params: {
    id: string;
    userId: string;
    userRole: string;
  }): Promise<void> {
    const { id, userId, userRole } = params;
    const [existing] = await this.db.select().from(comments).where(eq(comments.id, id));

    if (!existing || existing.isDeleted) {
      throw new Error('Comment not found');
    }

    const now = new Date();
    const createdAt = new Date(existing.createdAt as any);
    const diffMs = now.getTime() - createdAt.getTime();
    const canDelete =
      (existing.authorUserId === userId && diffMs <= 5 * 60 * 1000) ||
      ['system_admin', 'hr_staff'].includes(userRole);

    if (!canDelete) {
      throw new Error('Not permitted to delete comment');
    }

    // Soft-delete the target comment and any direct replies
    await this.db
      .update(comments)
      .set({ isDeleted: true, updatedAt: new Date() })
      .where(or(eq(comments.id, id), eq(comments.parentId, id)));
  }

  /**
   * Get comment statistics for a candidate
   *
   * Returns counts of internal and external comments on:
   * - The candidate's profile
   * - Each of the candidate's tasks
   *
   * Visibility filtering:
   * - Candidates see only external comment counts
   * - Staff see both internal and external counts
   *
   * @param params - Query parameters
   * @param params.candidateId - ID of the candidate
   * @param params.role - User role for visibility filtering
   * @returns Promise resolving to comment statistics
   */
  async getCommentStats(params: {
    candidateId: string;
    role: string;
  }): Promise<{
    profile: CommentStats;
    byTask: Record<string, CommentStats>;
  }> {
    const { candidateId, role } = params;
    const visibleSet = role === 'candidate' ? ['external'] : ['internal', 'external'];

    // Get profile comment counts
    const profileCounts = await this.db
      .select({ visibility: comments.visibility, count: sql<number>`count(*)::int` })
      .from(comments)
      .where(and(
        eq(comments.entityType, 'candidate' as any),
        eq(comments.entityId, candidateId),
        eq(comments.isDeleted, false),
        inArray(comments.visibility, visibleSet as any)
      ))
      .groupBy(comments.visibility);

    const profile: CommentStats = { internalCount: 0, externalCount: 0, totalVisible: 0 };
    for (const row of profileCounts) {
      if ((row.visibility as any) === 'internal') profile.internalCount = row.count;
      if ((row.visibility as any) === 'external') profile.externalCount = row.count;
    }
    profile.totalVisible = profile.internalCount + profile.externalCount;

    // Get task IDs for this candidate
    const taskIdsRows = await this.db
      .select({ id: candidateTasks.id })
      .from(candidateTasks)
      .where(eq(candidateTasks.candidateId, candidateId));
    const taskIds = taskIdsRows.map(r => r.id);

    const byTask: Record<string, CommentStats> = {};
    if (taskIds.length > 0) {
      // Get comment counts by task
      const taskCounts = await this.db
        .select({
          entityId: comments.entityId,
          visibility: comments.visibility,
          count: sql<number>`count(*)::int`
        })
        .from(comments)
        .where(and(
          eq(comments.entityType, 'task' as any),
          inArray(comments.entityId, taskIds),
          eq(comments.isDeleted, false),
          inArray(comments.visibility, visibleSet as any)
        ))
        .groupBy(comments.entityId, comments.visibility);

      for (const row of taskCounts) {
        const id = row.entityId as string;
        if (!byTask[id]) {
          byTask[id] = { internalCount: 0, externalCount: 0, totalVisible: 0 };
        }
        if ((row.visibility as any) === 'internal') byTask[id].internalCount = row.count;
        if ((row.visibility as any) === 'external') byTask[id].externalCount = row.count;
      }

      for (const id of Object.keys(byTask)) {
        byTask[id].totalVisible = byTask[id].internalCount + byTask[id].externalCount;
      }
    }

    return { profile, byTask };
  }
}
