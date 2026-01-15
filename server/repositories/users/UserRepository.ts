/**
 * User Repository
 *
 * Handles core user management operations including CRUD,
 * role management, scope management, and user status control.
 */

import { eq, and, or, ne, ilike, asc, sql, inArray } from "drizzle-orm";
import {
  users,
  userRoles,
  userDepartmentScopes,
  userDivisionScopes,
  managerCandidateScopes,
  candidateTasks,
  departments,
  divisions,
  userPreferences,
  type User,
  type InsertUser,
  type UserRole,
} from "@shared/schemas";
import { BaseRepository } from "../base/BaseRepository";
import { generateMentionKey } from "../../utils/mention-key.utils";

/**
 * Repository for managing users
 */
export class UserRepository extends BaseRepository {
  /**
   * Get a user by ID
   * @param id - User ID
   * @returns User or undefined if not found
   */
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await this.db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  /**
   * Get a user by email address
   * @param email - User email address
   * @returns User or undefined if not found
   */
  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await this.db.select().from(users).where(eq(users.email, email));
    return user || undefined;
  }

  /**
   * Get a user by username
   * @param username - Username
   * @returns User or undefined if not found
   */
  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await this.db
      .select()
      .from(users)
      .where(eq(users.username, username));
    return user || undefined;
  }

  /**
   * Create a new user with auto-generated mention key
   * @param insertUser - User data to insert
   * @returns Created user
   */
  async createUser(insertUser: InsertUser): Promise<User> {
    const mentionKey = await generateMentionKey(this.db, insertUser);
    const [user] = await this.db
      .insert(users)
      .values({ ...insertUser, mentionKey } as any)
      .returning();
    return user;
  }

  /**
   * Update an existing user
   * Regenerates mention key if relevant fields are updated
   * @param id - User ID
   * @param data - Partial user data to update
   * @returns Updated user or undefined if not found
   */
  async updateUser(id: string, data: Partial<User>): Promise<User | undefined> {
    const existing = await this.getUser(id);
    if (!existing) return undefined;

    const updates: Partial<User> = { ...data };

    if (Object.prototype.hasOwnProperty.call(updates, 'mentionKey')) {
      updates.mentionKey = await generateMentionKey(
        this.db,
        {
          mentionKey: updates.mentionKey,
          username: updates.username ?? existing.username,
          firstName: updates.firstName ?? existing.firstName,
          lastName: updates.lastName ?? existing.lastName,
          email: updates.email ?? existing.email
        },
        id
      );
    }

    const [user] = await this.db
      .update(users)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return user || undefined;
  }

  /**
   * Get all users with optional filtering
   * Includes department and division information via joins
   * @param filters - Optional filters for status, role, department, division, and search
   * @returns Array of users matching filters
   */
  async getAllUsers(filters?: {
    status?: string;
    role?: string;
    departmentId?: string;
    divisionId?: string;
    search?: string
  }): Promise<User[]> {
    const whereConditions = [];

    if (filters?.status) {
      whereConditions.push(eq(users.status, filters.status as any));
    }

    if (filters?.role) {
      whereConditions.push(eq(users.role, filters.role as any));
    }

    if (filters?.departmentId) {
      whereConditions.push(eq(users.departmentId, filters.departmentId));
    }

    if (filters?.divisionId) {
      whereConditions.push(eq(users.divisionId, filters.divisionId));
    }

    if (filters?.search) {
      whereConditions.push(
        or(
          ilike(users.firstName, `%${filters.search}%`),
          ilike(users.lastName, `%${filters.search}%`),
          ilike(users.email, `%${filters.search}%`)
        )
      );
    }

    return await this.db
      .select({
        id: users.id,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        mentionKey: users.mentionKey,
        passwordHash: users.passwordHash,
        role: users.role,
        status: users.status,
        departmentId: users.departmentId,
        divisionId: users.divisionId,
        active: users.active,
        lastLoginAt: users.lastLoginAt,
        // Multi-provider auth fields
        authProvider: users.authProvider,
        externalId: users.externalId,
        username: users.username,
        emailVerified: users.emailVerified,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
        department: {
          id: departments.id,
          name: departments.name
        },
        division: {
          id: divisions.id,
          name: divisions.name
        }
      })
      .from(users)
      .leftJoin(departments, eq(users.departmentId, departments.id))
      .leftJoin(divisions, eq(users.divisionId, divisions.id))
      .where(whereConditions.length > 0 ? and(...whereConditions) : undefined)
      .orderBy(users.firstName, users.lastName);
  }

  /**
   * Get active users only (legacy method)
   * @deprecated Use getAllUsers with status filter for new code
   * @returns Array of active users ordered by first and last name
   */
  async getUsers(): Promise<User[]> {
    return await this.db
      .select()
      .from(users)
      .where(eq(users.active, true))
      .orderBy(asc(users.firstName), asc(users.lastName));
  }

  /**
   * Disable a user and optionally reassign their open tasks
   * @param userId - User ID to disable
   * @param reassignOpenTasksTo - Optional user ID to reassign tasks to
   * @returns Success status and number of tasks reassigned
   */
  async disableUser(
    userId: string,
    reassignOpenTasksTo?: string
  ): Promise<{ success: boolean; tasksReassigned?: number }> {
    return await this.transaction(async (tx) => {
      // Disable the user
      await tx
        .update(users)
        .set({ status: 'disabled', updatedAt: new Date() })
        .where(eq(users.id, userId));

      let tasksReassigned = 0;

      // Reassign open tasks if requested
      if (reassignOpenTasksTo) {
        const result = await tx
          .update(candidateTasks)
          .set({
            assigneeKind: 'user',
            assigneeUserId: reassignOpenTasksTo,
            assigneeRole: null,
            assigneeResolvedAt: new Date(),
            updatedAt: new Date()
          })
          .where(
            and(
              eq(candidateTasks.assigneeUserId, userId),
              ne(candidateTasks.status, 'done'),
              ne(candidateTasks.status, 'canceled'),
              eq(candidateTasks.archived, false)
            )
          )
          .returning();

        tasksReassigned = result.length;
      }

      return { success: true, tasksReassigned };
    });
  }

  /**
   * Enable a disabled user
   * @param userId - User ID to enable
   * @returns Updated user or undefined if not found
   */
  async enableUser(userId: string): Promise<User | undefined> {
    const [user] = await this.db
      .update(users)
      .set({ status: 'active', updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning();
    return user || undefined;
  }

  /**
   * Update the last login timestamp for a user
   * @param userId - User ID
   */
  async updateLastLogin(userId: string): Promise<void> {
    await this.db
      .update(users)
      .set({ lastLoginAt: new Date() })
      .where(eq(users.id, userId));
  }

  /**
   * Get count of open tasks assigned to a user
   * Used for user disable confirmation dialog
   * @param userId - User ID
   * @returns Object with total and required task counts
   */
  async getUserOpenTaskCount(userId: string): Promise<{ total: number; required: number }> {
    const result = await this.pool.query(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN required = true THEN 1 ELSE 0 END) as required
      FROM candidate_tasks
      WHERE assignee_user_id = $1
        AND status NOT IN ('done', 'canceled')
        AND archived = false
    `, [userId]);

    const row = result.rows[0] as any;
    return {
      total: parseInt(row.total) || 0,
      required: parseInt(row.required) || 0
    };
  }

  /**
   * Get all roles assigned to a user
   * @param userId - User ID
   * @returns Array of user roles
   */
  async getUserRoles(userId: string): Promise<UserRole[]> {
    return await this.db
      .select()
      .from(userRoles)
      .where(eq(userRoles.userId, userId));
  }

  /**
   * Replace all roles for a user
   * Deletes existing roles and inserts new ones
   * @param userId - User ID
   * @param roles - Array of role strings to set
   * @returns Array of newly created user roles
   */
  async setUserRoles(userId: string, roles: string[]): Promise<UserRole[]> {
    // Remove existing roles
    await this.db.delete(userRoles).where(eq(userRoles.userId, userId));

    // Add new roles
    if (roles.length > 0) {
      const newRoles = roles.map(role => ({
        userId,
        role: role as any
      }));

      return await this.db
        .insert(userRoles)
        .values(newRoles)
        .returning();
    }

    return [];
  }

  /**
   * Add roles to a user without removing existing roles
   * Uses conflict handling to avoid duplicates
   * @param userId - User ID
   * @param roles - Array of role strings to add
   * @returns Array of all user roles after addition
   */
  async addUserRoles(userId: string, roles: string[]): Promise<UserRole[]> {
    if (!roles.length) {
      return await this.getUserRoles(userId);
    }

    const roleValues = roles.map(role => ({
      userId,
      role: role as any,
      updatedAt: new Date(),
      createdAt: new Date()
    }));

    await this.db
      .insert(userRoles)
      .values(roleValues)
      .onConflictDoNothing({
        target: [userRoles.userId, userRoles.role]
      });

    return await this.getUserRoles(userId);
  }

  /**
   * Get all department IDs in user's scope
   * Used for authorization filtering
   * @param userId - User ID
   * @returns Array of department IDs
   */
  async getUserDepartmentScopeIds(userId: string): Promise<string[]> {
    const rows = await this.db
      .select({ departmentId: userDepartmentScopes.departmentId })
      .from(userDepartmentScopes)
      .where(eq(userDepartmentScopes.userId, userId));
    return rows.map((row) => row.departmentId);
  }

  /**
   * Get all division IDs in user's scope
   * Used for authorization filtering
   * @param userId - User ID
   * @returns Array of division IDs
   */
  async getUserDivisionScopeIds(userId: string): Promise<string[]> {
    const rows = await this.db
      .select({ divisionId: userDivisionScopes.divisionId })
      .from(userDivisionScopes)
      .where(eq(userDivisionScopes.userId, userId));
    return rows.map((row) => row.divisionId);
  }

  /**
   * Get all candidate IDs that a manager has explicit scope over
   * Used for authorization filtering
   * @param managerId - Manager user ID
   * @returns Array of candidate IDs
   */
  async getManagerCandidateScopeIds(managerId: string): Promise<string[]> {
    const rows = await this.db
      .select({ candidateId: managerCandidateScopes.candidateId })
      .from(managerCandidateScopes)
      .where(eq(managerCandidateScopes.managerId, managerId));
    return rows.map((row) => row.candidateId);
  }

  /**
   * Resolve mentioned users by their mention keys
   *
   * Used by notification system to find users referenced in comments.
   *
   * @param mentionKeys - Array of mention key strings (normalized, lowercase)
   * @returns Array of user info with id, mentionKey, role, status, active
   */
  async getUsersByMentionKeys(mentionKeys: string[]): Promise<Array<{
    id: string;
    mentionKey: string;
    role: string;
    status: string;
    active: boolean;
  }>> {
    if (!mentionKeys.length) return [];
    
    const normalized = Array.from(new Set(mentionKeys)).filter(Boolean);
    if (!normalized.length) return [];

    return await this.db
      .select({
        id: users.id,
        mentionKey: users.mentionKey,
        role: users.role,
        status: users.status,
        active: users.active
      })
      .from(users)
      .where(inArray(users.mentionKey, normalized));
  }

  /**
   * Get users with their preferences for notification delivery
   *
   * Used by notification system to check user eligibility and preferences.
   *
   * @param userIds - Array of user IDs
   * @returns Array of users with preferences
   */
  async getUsersWithPreferences(userIds: string[]): Promise<Array<{
    id: string;
    role: string;
    status: string;
    active: boolean;
    preferences: typeof userPreferences.$inferSelect | null;
  }>> {
    if (!userIds.length) return [];

    return await this.db
      .select({
        id: users.id,
        role: users.role,
        status: users.status,
        active: users.active,
        preferences: userPreferences
      })
      .from(users)
      .leftJoin(userPreferences, eq(userPreferences.userId, users.id))
      .where(inArray(users.id, userIds));
  }
}
