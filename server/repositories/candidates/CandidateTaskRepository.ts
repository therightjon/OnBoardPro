/**
 * Candidate Task Repository
 *
 * Repository for managing candidate tasks with comprehensive authorization
 * and filtering. Handles task CRUD operations, task assignment resolution,
 * and dashboard KPI calculations.
 */

import { eq, and, desc, inArray, sql } from "drizzle-orm";
import {
  candidateTasks,
  candidates,
  candidateTemplateStages,
  hiringStages,
  users,
  taskPriorities,
  taskCategories,
  type CandidateTask,
  type InsertCandidateTask,
} from "@shared/schemas";
import { BaseRepository } from "../base/BaseRepository";
import type { AuthorizationContext, TemplateExpansionTask } from "../base/types";

/**
 * Helper function to ensure Date objects are properly handled
 */
function ensureDate(input?: Date | string | null): Date | null {
  if (!input) return null;
  const date = input instanceof Date ? new Date(input.getTime()) : new Date(input);
  if (Number.isNaN(date.getTime())) return null;
  // Normalize to UTC date
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/**
 * Repository for candidate task-related data operations
 * Extends BaseRepository to inherit authorization helpers
 */
export class CandidateTaskRepository extends BaseRepository {
  /**
   * Get a list of candidate tasks with filtering and authorization
   *
   * CRITICAL: This method has complex authorization logic!
   * - Filters tasks by assignee, candidate, and status
   * - Applies candidate status filtering for My Tasks queries
   * - Enforces authorization based on candidate visibility
   * - For candidates, only shows tasks assigned to them
   *
   * @param filters - Optional filters including assigneeId, candidateId, status
   * @param auth - Optional authorization context for access control
   * @returns Array of tasks with candidate and assignee information
   */
  async getCandidateTasks(filters?: any, auth?: AuthorizationContext): Promise<any[]> {
    const whereConditions = [eq(candidateTasks.archived, false)];

    if (filters?.assigneeId) {
      whereConditions.push(eq(candidateTasks.assigneeUserId, filters.assigneeId));
    }

    if (filters?.candidateId) {
      whereConditions.push(eq(candidateTasks.candidateId, filters.candidateId));
    }

    if (filters?.status) {
      whereConditions.push(eq(candidateTasks.status, filters.status));
    }

    // Add candidate status filtering for My Tasks queries
    if (filters?.assigneeId) {
      // Handle new individual flags if provided
      if (filters?.showArchived !== undefined || filters?.showCanceled !== undefined || filters?.showCompleted !== undefined) {
        const allowedStatuses = ['active', 'on_hold'] as const;
        const statusArray: any[] = [...allowedStatuses];
        if (filters.showArchived) statusArray.push('archived');
        if (filters.showCanceled) statusArray.push('canceled');
        if (filters.showCompleted) statusArray.push('completed');
        whereConditions.push(inArray(candidates.status, statusArray));
      }
      // Fallback to old includeClosed logic for backward compatibility
      else if (filters?.includeClosed !== true) {
        whereConditions.push(
          inArray(candidates.status, ['active', 'on_hold'] as any[])
        );
      }
    }

    const rawTasks = await this.db
      .select({
        id: candidateTasks.id,
        candidateId: candidateTasks.candidateId,
        title: candidateTasks.title,
        description: candidateTasks.description,
        notes: candidateTasks.notes,
        stage_id: candidateTasks.stageId,
        template_stage_id: candidateTasks.templateStageId,
        stage_name: hiringStages.name,
        stage_order_index: candidateTemplateStages.orderIndex,
        assignee_id: candidateTasks.assigneeUserId,
        assignee_kind: candidateTasks.assigneeKind,
        assignee_role: candidateTasks.assigneeRole,
        assignee_resolved_at: candidateTasks.assigneeResolvedAt,
        assignee_firstName: users.firstName,
        assignee_lastName: users.lastName,
        priority: candidateTasks.priority,
        priority_name: taskPriorities.name,
        category_id: candidateTasks.categoryId,
        category_name: taskCategories.name,
        dueAt: candidateTasks.dueAt,
        due_rule_type: candidateTasks.dueRuleType,
        due_rule_value: candidateTasks.dueRuleValue,
        fixed_date: candidateTasks.fixedDate,
        pending_anchor: candidateTasks.pendingAnchor,
        phase_snapshot: candidateTasks.phaseSnapshot,
        status: candidateTasks.status,
        required: candidateTasks.required,
        is_prerequisite_task: candidateTasks.isPrerequisiteTask,
        cancel_reason: candidateTasks.cancelReason,
        due_soon_notified_at: candidateTasks.dueSoonNotifiedAt,
        updated_at: candidateTasks.updatedAt,
        // Add candidate fields to prevent "Unknown Candidate"
        candidate_id: candidates.id,
        candidate_first_name: candidates.firstName,
        candidate_last_name: candidates.lastName,
        candidate_status: candidates.status,
        candidate_department_id: candidates.departmentId,
        candidate_division_id: candidates.divisionId,
        candidate_manager_id: candidates.managerId,
        candidate_linked_user_id: candidates.linkedUserId
      })
      .from(candidateTasks)
      .innerJoin(candidates, eq(candidateTasks.candidateId, candidates.id)) // INNER JOIN to guarantee candidate data
      .leftJoin(candidateTemplateStages, and(
        eq(candidateTemplateStages.candidateId, candidateTasks.candidateId),
        eq(candidateTemplateStages.stageId, candidateTasks.stageId)
      ))
      .leftJoin(hiringStages, eq(hiringStages.id, candidateTasks.stageId))
      .leftJoin(users, eq(users.id, candidateTasks.assigneeUserId))
      .leftJoin(taskPriorities, eq(taskPriorities.name, candidateTasks.priority))
      .leftJoin(taskCategories, eq(taskCategories.id, candidateTasks.categoryId))
      .where(and(...whereConditions))
      .orderBy(desc(candidateTasks.dueAt), desc(candidateTasks.updatedAt));

    // Transform the flat structure to match frontend expectations
    let tasks = rawTasks.map(task => ({
      ...task,
      dueRuleType: task.due_rule_type,
      dueRuleValue: task.due_rule_value,
      fixedDate: task.fixed_date,
      pendingAnchor: task.pending_anchor,
      templateStageId: task.template_stage_id,
      phaseSnapshot: task.phase_snapshot,
      isPrerequisiteTask: task.is_prerequisite_task,
      assignee: task.assignee_firstName || task.assignee_lastName ? {
        id: task.assignee_id,
        firstName: task.assignee_firstName,
        lastName: task.assignee_lastName
      } : null,
      assigneeUserId: task.assignee_id,
      assigneeKind: task.assignee_kind,
      assigneeRole: task.assignee_role,
      assigneeResolvedAt: task.assignee_resolved_at,
      dueSoonNotifiedAt: task.due_soon_notified_at,
      candidate: {
        id: task.candidate_id,
        firstName: task.candidate_first_name,
        lastName: task.candidate_last_name,
        status: task.candidate_status
      },
      candidateDepartmentId: task.candidate_department_id,
      candidateDivisionId: task.candidate_division_id,
      candidateManagerId: task.candidate_manager_id,
      candidateLinkedUserId: task.candidate_linked_user_id
    }));

    // CRITICAL: Authorization filtering for non-privileged users
    if (auth && !auth.privileged) {
      tasks = tasks.filter((task) => {
        // Check department scope
        if (task.candidateDepartmentId && auth.departmentIds.has(task.candidateDepartmentId)) {
          return true;
        }
        // Check division scope
        if (task.candidateDivisionId && auth.divisionIds.has(task.candidateDivisionId)) {
          return true;
        }
        // Check manager scope
        if (auth.roles.has("manager") && task.candidateManagerId === auth.userId) {
          return true;
        }
        // Check candidate self-access
        if (auth.roles.has("candidate") && task.candidateLinkedUserId === auth.userId) {
          return true;
        }
        // Check explicit candidate grants
        if (task.candidate?.id && auth.managedCandidateIds.has(task.candidate.id)) {
          return true;
        }
        return false;
      });

      // Candidates can only see their own assigned tasks
      if (auth.isCandidate && auth.userId) {
        tasks = tasks.filter((task) => task.assigneeUserId === auth.userId);
      }
    }

    // Remove temporary authorization fields before returning
    return tasks.map(({ candidateDepartmentId, candidateDivisionId, candidateManagerId, candidateLinkedUserId, ...rest }) => rest);
  }

  /**
   * Get dashboard tasks for KPI calculations
   *
   * Returns all non-archived tasks from active or on_hold candidates.
   * Used for calculating dashboard metrics.
   *
   * @returns Array of tasks with assignee information
   */
  async getDashboardTasks(): Promise<any[]> {
    // Get all tasks from candidates with active or on_hold status for KPI calculations
    const rawTasks = await this.db
      .select({
        id: candidateTasks.id,
        candidateId: candidateTasks.candidateId,
        title: candidateTasks.title,
        description: candidateTasks.description,
        assignee_id: candidateTasks.assigneeUserId,
        assignee_kind: candidateTasks.assigneeKind,
        assignee_role: candidateTasks.assigneeRole,
        assignee_resolved_at: candidateTasks.assigneeResolvedAt,
        assignee_firstName: users.firstName,
        assignee_lastName: users.lastName,
        priority: candidateTasks.priority,
        dueAt: candidateTasks.dueAt,
        status: candidateTasks.status,
        required: candidateTasks.required,
        cancel_reason: candidateTasks.cancelReason,
        due_soon_notified_at: candidateTasks.dueSoonNotifiedAt,
        updated_at: candidateTasks.updatedAt,
        candidate_status: candidates.status
      })
      .from(candidateTasks)
      .innerJoin(candidates, eq(candidateTasks.candidateId, candidates.id))
      .leftJoin(users, eq(users.id, candidateTasks.assigneeUserId))
      .where(and(
        eq(candidateTasks.archived, false),
        inArray(candidates.status, ['active', 'on_hold'])
      ))
      .orderBy(desc(candidateTasks.dueAt), desc(candidateTasks.updatedAt));

    return rawTasks.map(task => ({
      ...task,
      assignee: task.assignee_firstName || task.assignee_lastName ? {
        id: task.assignee_id,
        firstName: task.assignee_firstName,
        lastName: task.assignee_lastName
      } : null,
      assigneeUserId: task.assignee_id,
      assigneeKind: task.assignee_kind,
      assigneeRole: task.assignee_role,
      assigneeResolvedAt: task.assignee_resolved_at,
      dueSoonNotifiedAt: task.due_soon_notified_at,
    }));
  }

  /**
   * Get a single candidate task by ID
   *
   * @param id - Task ID
   * @returns Task or undefined if not found/archived
   */
  async getCandidateTask(id: string): Promise<CandidateTask | undefined> {
    const [task] = await this.db
      .select()
      .from(candidateTasks)
      .where(and(eq(candidateTasks.id, id), eq(candidateTasks.archived, false)));

    return task || undefined;
  }

  /**
   * Create a new candidate task
   *
   * @param insertTask - Task data to insert
   * @returns Created task
   */
  async createCandidateTask(insertTask: InsertCandidateTask): Promise<CandidateTask> {
    const payload: InsertCandidateTask = {
      ...insertTask,
      dueAt: insertTask.dueAt ? ensureDate(insertTask.dueAt) : null,
    };

    const [task] = await this.db
      .insert(candidateTasks)
      .values(payload)
      .returning();

    return task;
  }

  /**
   * Update a candidate task's fields
   *
   * @param id - Task ID
   * @param data - Partial task data to update
   * @returns Updated task or undefined if not found
   */
  async updateCandidateTask(id: string, data: Partial<CandidateTask>): Promise<CandidateTask | undefined> {
    const update: Partial<CandidateTask> = { ...data };

    // Ensure dueAt is properly handled as a Date
    if (Object.prototype.hasOwnProperty.call(update, 'dueAt')) {
      update.dueAt = update.dueAt ? ensureDate(update.dueAt) : null;
    }

    const [task] = await this.db
      .update(candidateTasks)
      .set({ ...update, updatedAt: new Date() })
      .where(and(eq(candidateTasks.id, id), eq(candidateTasks.archived, false)))
      .returning();

    return task || undefined;
  }

  /**
   * Hard delete a candidate task
   *
   * Sets deletedAt timestamp. Note: This is a soft delete operation.
   *
   * @param id - Task ID
   */
  async deleteCandidateTask(id: string): Promise<void> {
    await this.db
      .update(candidateTasks)
      .set({ deletedAt: new Date() })
      .where(eq(candidateTasks.id, id));
  }

  /**
   * Archive a candidate task (soft delete)
   *
   * Sets archived flag to true.
   *
   * @param id - Task ID
   */
  async archiveCandidateTask(id: string): Promise<void> {
    await this.db
      .update(candidateTasks)
      .set({ archived: true, updatedAt: new Date() })
      .where(eq(candidateTasks.id, id));
  }

  /**
   * Resolve candidate self-assignments
   *
   * Converts role-based assignments of 'candidate.self' to direct user assignments.
   * This is called when a candidate is linked to a user account.
   *
   * @param candidateId - Candidate ID
   * @param userId - User ID to assign tasks to
   * @returns Array of tasks that were updated
   */
  async resolveCandidateSelfAssignments(
    candidateId: string,
    userId: string
  ): Promise<TemplateExpansionTask[]> {
    const now = new Date();

    const rows = await this.db
      .update(candidateTasks)
      .set({
        assigneeKind: 'user',
        assigneeUserId: userId,
        assigneeRole: null,
        assigneeResolvedAt: now,
        updatedAt: now,
      })
      .where(and(
        eq(candidateTasks.candidateId, candidateId),
        eq(candidateTasks.assigneeKind, 'role'),
        eq(candidateTasks.assigneeRole, 'candidate.self'),
        eq(candidateTasks.archived, false)
      ))
      .returning({
        id: candidateTasks.id,
        candidateId: candidateTasks.candidateId,
        assigneeUserId: candidateTasks.assigneeUserId,
        assigneeKind: candidateTasks.assigneeKind,
        assigneeRole: candidateTasks.assigneeRole,
        title: candidateTasks.title,
        status: candidateTasks.status,
        dueAt: candidateTasks.dueAt,
        pendingAnchor: candidateTasks.pendingAnchor,
      });

    return rows;
  }

  /**
   * Reset all non-archived candidate tasks to a fresh state for reactivation.
   * Clears completion/cancellation markers and due dates so anchors can be recomputed.
   * 
   * This is called when a candidate is being reactivated after being archived/completed.
   *
   * @param candidateId - Candidate ID
   * @returns Number of tasks that were reset
   */
  async resetCandidateTasksForReactivation(candidateId: string): Promise<number> {
    const now = new Date();
    const reset = await this.db
      .update(candidateTasks)
      .set({
        status: 'todo',
        completedAt: null,
        cancelReason: null,
        dueAt: null,
        pendingAnchor: true,
        updatedAt: now
      })
      .where(and(eq(candidateTasks.candidateId, candidateId), eq(candidateTasks.archived, false)))
      .returning({ id: candidateTasks.id });

    return reset.length;
  }
}
