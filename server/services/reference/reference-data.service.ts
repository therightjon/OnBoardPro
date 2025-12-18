/**
 * Reference Data Service
 *
 * Business logic layer for reference/lookup data management.
 * Handles task categories, priorities, candidate types, faculty ranks,
 * hiring stages, and task definitions.
 */

import type {
  TaskCategory,
  TaskPriority,
  CandidateType,
  FacultyRank,
  HiringStage,
  TaskDefinition,
  InsertHiringStage,
  InsertTaskDefinition
} from "@shared/schemas";
import type { ReferenceDataRepository } from "../../repositories/reference/ReferenceDataRepository";
import type { HiringStageRepository } from "../../repositories/reference/HiringStageRepository";
import type { TaskDefinitionRepository } from "../../repositories/reference/TaskDefinitionRepository";

export interface CreateHiringStageInput {
  name: string;
  description?: string | null;
  orderIndex?: number;
  isActive?: boolean;
  actorId?: string;
}

export interface UpdateHiringStageInput {
  id: string;
  name?: string;
  description?: string | null;
  orderIndex?: number;
  isActive?: boolean;
  actorId?: string;
}

export interface CreateTaskDefinitionInput {
  name: string;
  description?: string | null;
  createdBy?: string;
  actorId?: string;
}

export interface UpdateTaskDefinitionInput {
  id: string;
  name?: string;
  description?: string | null;
  archived?: boolean;
  actorId?: string;
}

/**
 * Service for reference data business operations
 */
export class ReferenceDataService {
  constructor(
    private referenceDataRepo: ReferenceDataRepository,
    private hiringStageRepo: HiringStageRepository,
    private taskDefinitionRepo: TaskDefinitionRepository
  ) {}

  // ==================== Task Categories ====================

  /**
   * Get all task categories
   */
  async getTaskCategories(): Promise<TaskCategory[]> {
    return this.referenceDataRepo.getTaskCategories();
  }

  // ==================== Task Priorities ====================

  /**
   * Get all task priorities
   */
  async getTaskPriorities(): Promise<TaskPriority[]> {
    return this.referenceDataRepo.getTaskPriorities();
  }

  // ==================== Candidate Types ====================

  /**
   * Get all candidate types
   */
  async getCandidateTypes(): Promise<CandidateType[]> {
    return this.referenceDataRepo.getCandidateTypes();
  }

  // ==================== Faculty Ranks ====================

  /**
   * Get all faculty ranks
   */
  async getFacultyRanks(): Promise<FacultyRank[]> {
    return this.referenceDataRepo.getFacultyRanks();
  }

  // ==================== Hiring Stages ====================

  /**
   * Get all hiring stages ordered by display index
   */
  async getHiringStages(): Promise<HiringStage[]> {
    return this.hiringStageRepo.getHiringStages();
  }

  /**
   * Create a new hiring stage
   */
  async createHiringStage(input: CreateHiringStageInput): Promise<HiringStage> {
    return this.hiringStageRepo.createHiringStage({
      name: input.name,
      description: input.description,
      orderIndex: input.orderIndex,
      isActive: input.isActive
    });
  }

  /**
   * Update a hiring stage
   */
  async updateHiringStage(input: UpdateHiringStageInput): Promise<HiringStage | undefined> {
    const updateData: Partial<InsertHiringStage> = {};
    if (input.name !== undefined) updateData.name = input.name;
    if (input.description !== undefined) updateData.description = input.description;
    if (input.orderIndex !== undefined) updateData.orderIndex = input.orderIndex;
    if (input.isActive !== undefined) updateData.isActive = input.isActive;

    return this.hiringStageRepo.updateHiringStage(input.id, updateData);
  }

  /**
   * Delete a hiring stage (soft delete)
   * Business rule: Cannot delete if stages are in use by templates or candidates
   */
  async deleteHiringStage(id: string, actorId?: string): Promise<void> {
    // TODO: Add check for stages in use
    await this.hiringStageRepo.deleteHiringStage(id);
  }

  // ==================== Task Definitions ====================

  /**
   * Get all task definitions
   */
  async getTaskDefinitions(): Promise<TaskDefinition[]> {
    return this.taskDefinitionRepo.getTaskDefinitions();
  }

  /**
   * Get a single task definition by ID
   */
  async getTaskDefinition(id: string): Promise<TaskDefinition | undefined> {
    return this.taskDefinitionRepo.getTaskDefinition(id);
  }

  /**
   * Create a new task definition
   */
  async createTaskDefinition(input: CreateTaskDefinitionInput): Promise<TaskDefinition> {
    return this.taskDefinitionRepo.createTaskDefinition({
      name: input.name,
      description: input.description,
      createdBy: input.createdBy
    });
  }

  /**
   * Update a task definition
   */
  async updateTaskDefinition(input: UpdateTaskDefinitionInput): Promise<TaskDefinition | undefined> {
    const updateData: Partial<InsertTaskDefinition> = {};
    if (input.name !== undefined) updateData.name = input.name;
    if (input.description !== undefined) updateData.description = input.description;
    if (input.archived !== undefined) updateData.archived = input.archived;

    return this.taskDefinitionRepo.updateTaskDefinition(input.id, updateData);
  }

  /**
   * Archive a task definition (soft delete)
   * Business rule: Cannot delete if definition is in use by template tasks
   */
  async archiveTaskDefinition(id: string, actorId?: string): Promise<TaskDefinition | undefined> {
    // TODO: Add check for definitions in use
    return this.taskDefinitionRepo.updateTaskDefinition(id, { archived: true });
  }

  // ==================== Bulk Operations ====================

  /**
   * Get all reference data in a single call
   * Useful for initial page load to minimize requests
   */
  async getAllReferenceData(): Promise<{
    taskCategories: TaskCategory[];
    taskPriorities: TaskPriority[];
    candidateTypes: CandidateType[];
    facultyRanks: FacultyRank[];
    hiringStages: HiringStage[];
    taskDefinitions: TaskDefinition[];
  }> {
    const [
      taskCategories,
      taskPriorities,
      candidateTypes,
      facultyRanks,
      hiringStages,
      taskDefinitions
    ] = await Promise.all([
      this.getTaskCategories(),
      this.getTaskPriorities(),
      this.getCandidateTypes(),
      this.getFacultyRanks(),
      this.getHiringStages(),
      this.getTaskDefinitions()
    ]);

    return {
      taskCategories,
      taskPriorities,
      candidateTypes,
      facultyRanks,
      hiringStages,
      taskDefinitions
    };
  }
}
