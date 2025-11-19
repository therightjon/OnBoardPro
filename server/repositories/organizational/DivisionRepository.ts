/**
 * Division Repository
 *
 * Manages CRUD operations for divisions (organizational sub-units).
 * Divisions belong to departments and represent specific teams or groups
 * within an organization (e.g., "Software Engineering" within "Engineering").
 *
 * Features soft deletion via the 'archived' flag to preserve
 * historical data integrity.
 */

import { eq, and, ilike, inArray, or, sql } from "drizzle-orm";
import {
  divisions,
  users,
  type Division,
  type InsertDivision
} from "@shared/schemas";
import { BaseRepository } from "../base/BaseRepository";
import type { db as DbType } from "../../db/connection";
import type { Pool } from "pg";

/**
 * Manager information with contact details
 */
export interface ManagerInfo {
  /** User ID */
  id: string;
  /** Full name (first name + last name) */
  name: string;
  /** Email address */
  email: string;
  /** User role */
  role: string;
}

export class DivisionRepository extends BaseRepository {
  constructor(db: typeof DbType, pool: Pool) {
    super(db, pool);
  }

  /**
   * Get divisions with optional filtering
   *
   * Retrieves divisions, optionally filtered by department.
   * By default, only returns non-archived divisions.
   * Set includeArchived to true to include archived divisions.
   *
   * @param departmentId - Optional department ID to filter by
   * @param includeArchived - Whether to include archived divisions (default: false)
   * @returns Promise resolving to array of divisions
   *
   * @example
   * ```ts
   * // Get all active divisions
   * const allDivisions = await divRepo.getDivisions();
   *
   * // Get divisions in a specific department
   * const deptDivisions = await divRepo.getDivisions("dept-123");
   *
   * // Get all divisions including archived
   * const allIncludingArchived = await divRepo.getDivisions(undefined, true);
   * ```
   */
  async getDivisions(departmentId?: string, includeArchived: boolean = false): Promise<Division[]> {
    const whereConditions = [];

    if (departmentId) {
      whereConditions.push(eq(divisions.departmentId, departmentId));
    }

    if (!includeArchived) {
      whereConditions.push(eq(divisions.archived, false));
    }

    if (whereConditions.length > 0) {
      return await this.db.select().from(divisions).where(and(...whereConditions));
    }

    return await this.db.select().from(divisions);
  }

  /**
   * Get divisions by department with search and pagination
   *
   * Retrieves non-archived divisions for a specific department.
   * Supports optional text search (case-insensitive) and pagination.
   *
   * @param departmentId - Department ID to filter by
   * @param searchQuery - Optional search query to filter division names
   * @param limit - Maximum number of results to return (default: 20)
   * @param offset - Number of results to skip for pagination (default: 0)
   * @returns Promise resolving to array of divisions
   *
   * @example
   * ```ts
   * // Get first 20 divisions in a department
   * const divisions = await divRepo.getDivisionsByDepartment("dept-123");
   *
   * // Search for divisions with "eng" in the name
   * const engDivisions = await divRepo.getDivisionsByDepartment("dept-123", "eng");
   *
   * // Paginate results (get second page of 10 results)
   * const page2 = await divRepo.getDivisionsByDepartment("dept-123", undefined, 10, 10);
   * ```
   */
  async getDivisionsByDepartment(
    departmentId: string,
    searchQuery?: string,
    limit: number = 20,
    offset: number = 0
  ): Promise<Division[]> {
    let whereConditions = [
      eq(divisions.archived, false),
      eq(divisions.departmentId, departmentId)
    ];

    if (searchQuery) {
      whereConditions.push(ilike(divisions.name, `%${searchQuery}%`));
    }

    return await this.db
      .select()
      .from(divisions)
      .where(and(...whereConditions))
      .orderBy(divisions.name)
      .limit(limit)
      .offset(offset);
  }

  /**
   * Get managers by department with optional division filtering
   *
   * Retrieves active users with the 'manager' role within a department or division.
   * Supports optional text search across name and email, and pagination.
   *
   * When divisionId is provided, only returns managers in that specific division.
   * When divisionId is not provided, returns managers in the entire department.
   *
   * @param departmentId - Department ID to filter by
   * @param divisionId - Optional division ID to filter by (narrows scope)
   * @param searchQuery - Optional search query for name or email
   * @param limit - Maximum number of results to return (default: 20)
   * @param offset - Number of results to skip for pagination (default: 0)
   * @returns Promise resolving to array of manager information objects
   *
   * @example
   * ```ts
   * // Get all managers in a department
   * const deptManagers = await divRepo.getManagersByDepartment("dept-123");
   *
   * // Get managers in a specific division
   * const divManagers = await divRepo.getManagersByDepartment("dept-123", "div-456");
   *
   * // Search for managers by name or email
   * const searchResults = await divRepo.getManagersByDepartment(
   *   "dept-123",
   *   undefined,
   *   "john"
   * );
   * ```
   */
  async getManagersByDepartment(
    departmentId: string,
    divisionId?: string,
    searchQuery?: string,
    limit: number = 20,
    offset: number = 0
  ): Promise<ManagerInfo[]> {
    // Only return users with the manager role
    const allowedRoles = ['manager'];

    let whereConditions = [
      eq(users.active, true),
      inArray(users.role, allowedRoles as any[])
    ];

    // Add department/division filtering
    if (divisionId) {
      whereConditions.push(eq(users.divisionId, divisionId));
    } else {
      whereConditions.push(eq(users.departmentId, departmentId));
    }

    // Add search filtering
    if (searchQuery) {
      whereConditions.push(
        or(
          ilike(users.firstName, `%${searchQuery}%`),
          ilike(users.lastName, `%${searchQuery}%`),
          ilike(users.email, `%${searchQuery}%`)
        )!
      );
    }

    return await this.db
      .select({
        id: users.id,
        name: sql<string>`${users.firstName} || ' ' || ${users.lastName}`,
        email: users.email,
        role: users.role,
        mentionKey: users.mentionKey
      })
      .from(users)
      .where(and(...whereConditions))
      .orderBy(users.role, users.firstName, users.lastName)
      .limit(limit)
      .offset(offset);
  }

  /**
   * Create a new division
   *
   * Creates a new division with the provided data.
   * The archived flag defaults to false if not specified.
   * Timestamps (createdAt, updatedAt) are set automatically by the database.
   *
   * @param insertDiv - Division data to insert (must include departmentId)
   * @returns Promise resolving to the created division
   *
   * @example
   * ```ts
   * const newDivision = await divRepo.createDivision({
   *   name: "Software Engineering",
   *   departmentId: "dept-123",
   *   description: "Builds and maintains software systems"
   * });
   * ```
   */
  async createDivision(insertDiv: InsertDivision): Promise<Division> {
    const [div] = await this.db
      .insert(divisions)
      .values(insertDiv)
      .returning();
    return div;
  }

  /**
   * Update an existing division
   *
   * Updates a division with the provided data.
   * The updatedAt timestamp is automatically set to the current time.
   *
   * @param id - ID of the division to update
   * @param data - Partial division data to update
   * @returns Promise resolving to the updated division, or undefined if not found
   *
   * @example
   * ```ts
   * // Update division name
   * const updated = await divRepo.updateDivision("div-456", {
   *   name: "Software Engineering & DevOps"
   * });
   *
   * // Archive a division (soft delete)
   * const archived = await divRepo.updateDivision("div-456", {
   *   archived: true
   * });
   *
   * // Move division to different department
   * const moved = await divRepo.updateDivision("div-456", {
   *   departmentId: "dept-789"
   * });
   * ```
   */
  async updateDivision(id: string, data: Partial<Division>): Promise<Division | undefined> {
    const [div] = await this.db
      .update(divisions)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(divisions.id, id))
      .returning();
    return div || undefined;
  }
}
