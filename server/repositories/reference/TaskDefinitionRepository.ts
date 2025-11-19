/**
 * Task Definition Repository
 *
 * Manages CRUD operations for task definitions (reusable task templates).
 * Task definitions are the blueprint for creating tasks that can be assigned
 * to candidates during their onboarding process.
 */

import { eq, asc } from "drizzle-orm";
import {
  taskDefinitions,
  type TaskDefinition,
  type InsertTaskDefinition
} from "@shared/schemas";
import { BaseRepository } from "../base/BaseRepository";
import type { db as DbType } from "../../db/connection";
import type { Pool } from "pg";

export class TaskDefinitionRepository extends BaseRepository {
  constructor(db: typeof DbType, pool: Pool) {
    super(db, pool);
  }

  /**
   * Get all task definitions ordered by name
   *
   * @returns Promise resolving to array of task definitions
   */
  async getTaskDefinitions(): Promise<TaskDefinition[]> {
    return await this.db.select().from(taskDefinitions).orderBy(asc(taskDefinitions.name));
  }

  /**
   * Get a single task definition by ID
   *
   * @param id - ID of the task definition to retrieve
   * @returns Promise resolving to the task definition, or undefined if not found
   */
  async getTaskDefinition(id: string): Promise<TaskDefinition | undefined> {
    const [taskDef] = await this.db.select().from(taskDefinitions).where(eq(taskDefinitions.id, id));
    return taskDef || undefined;
  }

  /**
   * Create a new task definition
   *
   * @param insertTaskDef - Task definition data to insert
   * @returns Promise resolving to the created task definition
   */
  async createTaskDefinition(insertTaskDef: InsertTaskDefinition): Promise<TaskDefinition> {
    const [taskDef] = await this.db
      .insert(taskDefinitions)
      .values(insertTaskDef)
      .returning();
    return taskDef;
  }

  /**
   * Update an existing task definition
   *
   * Updates the updatedAt timestamp automatically
   *
   * @param id - ID of the task definition to update
   * @param data - Partial task definition data to update
   * @returns Promise resolving to the updated task definition, or undefined if not found
   */
  async updateTaskDefinition(id: string, data: Partial<TaskDefinition>): Promise<TaskDefinition | undefined> {
    const [taskDef] = await this.db
      .update(taskDefinitions)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(taskDefinitions.id, id))
      .returning();
    return taskDef || undefined;
  }
}
