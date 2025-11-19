/**
 * Reference Data Repository
 *
 * Manages read operations for various lookup/reference tables.
 * These are relatively static tables used for dropdowns, filters,
 * and data categorization throughout the application.
 */

import { asc } from "drizzle-orm";
import {
  taskCategories,
  taskPriorities,
  candidateTypes,
  facultyRanks,
  type TaskCategory,
  type TaskPriority,
  type CandidateType,
  type FacultyRank
} from "@shared/schemas";
import { BaseRepository } from "../base/BaseRepository";
import type { db as DbType } from "../../db/connection";
import type { Pool } from "pg";

export class ReferenceDataRepository extends BaseRepository {
  constructor(db: typeof DbType, pool: Pool) {
    super(db, pool);
  }

  /**
   * Get all task categories ordered by name
   *
   * Task categories are used to group and organize tasks
   * (e.g., HR, IT, Facilities, Training)
   *
   * @returns Promise resolving to array of task categories
   */
  async getTaskCategories(): Promise<TaskCategory[]> {
    return await this.db.select().from(taskCategories).orderBy(asc(taskCategories.name));
  }

  /**
   * Get all task priorities ordered by name
   *
   * Task priorities indicate the urgency/importance of tasks
   * (e.g., Low, Medium, High, Critical)
   *
   * @returns Promise resolving to array of task priorities
   */
  async getTaskPriorities(): Promise<TaskPriority[]> {
    return await this.db.select().from(taskPriorities).orderBy(asc(taskPriorities.name));
  }

  /**
   * Get all candidate types ordered by name
   *
   * Candidate types categorize the kind of hire
   * (e.g., Faculty, Staff, Student Worker, Contractor)
   *
   * @returns Promise resolving to array of candidate types
   */
  async getCandidateTypes(): Promise<CandidateType[]> {
    return await this.db.select().from(candidateTypes).orderBy(asc(candidateTypes.name));
  }

  /**
   * Get all faculty ranks ordered by name
   *
   * Faculty ranks represent academic positions
   * (e.g., Assistant Professor, Associate Professor, Professor)
   *
   * @returns Promise resolving to array of faculty ranks
   */
  async getFacultyRanks(): Promise<FacultyRank[]> {
    return await this.db.select().from(facultyRanks).orderBy(asc(facultyRanks.name));
  }
}
