/**
 * Department Repository
 *
 * Manages CRUD operations for departments (organizational units).
 * Departments are top-level organizational entities that contain divisions
 * and are used for organizing users and candidates.
 *
 * Features soft deletion via the 'archived' flag to preserve
 * historical data integrity.
 */

import { eq } from "drizzle-orm";
import {
  departments,
  type Department,
  type InsertDepartment
} from "@shared/schemas";
import { BaseRepository } from "../base/BaseRepository";
import type { db as DbType } from "../../db/connection";
import type { Pool } from "pg";

export class DepartmentRepository extends BaseRepository {
  constructor(db: typeof DbType, pool: Pool) {
    super(db, pool);
  }

  /**
   * Get all departments
   *
   * By default, only returns non-archived departments.
   * Set includeArchived to true to include archived departments.
   *
   * @param includeArchived - Whether to include archived departments (default: false)
   * @returns Promise resolving to array of departments
   *
   * @example
   * ```ts
   * // Get active departments only
   * const activeDepts = await deptRepo.getDepartments();
   *
   * // Get all departments including archived
   * const allDepts = await deptRepo.getDepartments(true);
   * ```
   */
  async getDepartments(includeArchived: boolean = false): Promise<Department[]> {
    if (includeArchived) {
      return await this.db.select().from(departments);
    }
    return await this.db.select().from(departments).where(eq(departments.archived, false));
  }

  /**
   * Create a new department
   *
   * Creates a new department with the provided data.
   * The archived flag defaults to false if not specified.
   * Timestamps (createdAt, updatedAt) are set automatically by the database.
   *
   * @param insertDept - Department data to insert
   * @returns Promise resolving to the created department
   *
   * @example
   * ```ts
   * const newDept = await deptRepo.createDepartment({
   *   name: "Engineering",
   *   description: "Engineering department"
   * });
   * ```
   */
  async createDepartment(insertDept: InsertDepartment): Promise<Department> {
    const [dept] = await this.db
      .insert(departments)
      .values(insertDept)
      .returning();
    return dept;
  }

  /**
   * Update an existing department
   *
   * Updates a department with the provided data.
   * The updatedAt timestamp is automatically set to the current time.
   *
   * @param id - ID of the department to update
   * @param data - Partial department data to update
   * @returns Promise resolving to the updated department, or undefined if not found
   *
   * @example
   * ```ts
   * // Update department name
   * const updated = await deptRepo.updateDepartment("dept-123", {
   *   name: "Engineering & Technology"
   * });
   *
   * // Archive a department (soft delete)
   * const archived = await deptRepo.updateDepartment("dept-123", {
   *   archived: true
   * });
   * ```
   */
  async updateDepartment(id: string, data: Partial<Department>): Promise<Department | undefined> {
    const [dept] = await this.db
      .update(departments)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(departments.id, id))
      .returning();
    return dept || undefined;
  }
}
