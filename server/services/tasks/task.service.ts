/**
 * Task Service
 *
 * Business logic layer for task management
 * Handles task creation, assignment, status changes, and completion
 */

import type { InsertCandidateTask, CandidateTask } from "@shared/schemas";
import type { CandidateTaskRepository } from "../../repositories/candidates/CandidateTaskRepository";
import type { AuthorizationContext } from "../../repositories/base/types";
import { eventBus, taskCreated, taskAssigned, taskStatusChanged, taskCompleted } from "../../events";
import { writeAuditLog } from "../shared/audit-logger";

export interface CreateTaskInput {
  data: InsertCandidateTask;
  actorId?: string;
  requestId?: string;
}

export interface UpdateTaskInput {
  id: string;
  data: Partial<CandidateTask>;
  actorId?: string;
  requestId?: string;
}

export interface AssignTaskInput {
  taskId: string;
  assigneeUserId: string;
  actorId?: string;
  requestId?: string;
}

/**
 * Service for task-related business operations
 */
export class TaskService {
  constructor(
    private taskRepo: CandidateTaskRepository
  ) {}

  /**
   * Create a new task
   * Publishes taskCreated event which notifies assignee if present
   */
  async createTask(input: CreateTaskInput): Promise<CandidateTask> {
    const { data, actorId } = input;

    // Create the task
    const task = await this.taskRepo.createCandidateTask(data);

    await writeAuditLog({
      actorId,
      resourceType: "candidate_task",
      resourceId: task.id,
      taskId: task.id,
      candidateId: task.candidateId,
      action: "create",
      eventType: "task_created",
      requestId: input.requestId,
      details: {
        title: task.title,
        candidateId: task.candidateId,
        assigneeUserId: task.assigneeUserId,
        dueAt: task.dueAt,
        priority: task.priority
      }
    });

    // Publish domain event
    await eventBus.publish(taskCreated(task.id, {
      candidateId: task.candidateId,
      title: task.title,
      assigneeUserId: task.assigneeUserId,
      assigneeRole: task.assigneeKind === 'role' ? task.assigneeRole : null,
      dueAt: task.dueAt,
      isRequired: task.required || false,
      fromTemplate: false
    }, {
      actorId
    }));

    return task;
  }

  /**
   * Update a task
   * Detects and publishes events for assignment changes, status changes, and completion
   */
  async updateTask(input: UpdateTaskInput): Promise<CandidateTask | undefined> {
    const { id, data, actorId } = input;

    // Get existing task to detect changes
    const existingTask = await this.taskRepo.getCandidateTask(id);
    if (!existingTask) {
      return undefined;
    }

    // Update the task
    const updatedTask = await this.taskRepo.updateCandidateTask(id, data);
    if (!updatedTask) {
      return undefined;
    }

    const changes: Record<string, { before: any; after: any }> = {};
    for (const key of Object.keys(data)) {
      const before = (existingTask as any)[key];
      const after = (updatedTask as any)[key];
      if (before !== after) {
        changes[key] = { before, after };
      }
    }
    if (Object.keys(changes).length > 0) {
      await writeAuditLog({
        actorId,
        resourceType: "candidate_task",
        resourceId: id,
        taskId: id,
        candidateId: updatedTask.candidateId,
        action: "update",
        eventType: "task_updated",
        requestId: input.requestId,
        details: { changes }
      });
    }

    // Detect and publish assignment change event
    const assignmentChanged = Boolean(
      updatedTask.assigneeKind === 'user' &&
      updatedTask.assigneeUserId &&
      updatedTask.assigneeUserId !== existingTask.assigneeUserId
    );

    if (assignmentChanged && updatedTask.assigneeUserId) {
      await eventBus.publish(taskAssigned(updatedTask.id, {
        candidateId: updatedTask.candidateId,
        taskTitle: updatedTask.title,
        assigneeUserId: updatedTask.assigneeUserId,
        previousAssigneeId: existingTask.assigneeUserId,
        dueAt: updatedTask.dueAt
      }, {
        actorId
      }));
    }

    // Detect and publish status change event
    if (data.status && data.status !== existingTask.status) {
      await eventBus.publish(taskStatusChanged(updatedTask.id, {
        candidateId: updatedTask.candidateId,
        taskTitle: updatedTask.title,
        previousStatus: existingTask.status,
        newStatus: updatedTask.status,
        assigneeUserId: updatedTask.assigneeUserId
      }, {
        actorId
      }));

      // If status changed to done, publish completion event
      if (updatedTask.status === 'done' && updatedTask.completedAt) {
        const wasOverdue = !!(updatedTask.dueAt && updatedTask.dueAt < updatedTask.completedAt);

        await eventBus.publish(taskCompleted(updatedTask.id, {
          candidateId: updatedTask.candidateId,
          taskTitle: updatedTask.title,
          completedBy: actorId || 'unknown',
          completedAt: updatedTask.completedAt,
          dueAt: updatedTask.dueAt,
          wasOverdue
        }, {
          actorId
        }));
      }
    }

    return updatedTask;
  }

  /**
   * Assign a task to a user
   */
  async assignTask(input: AssignTaskInput): Promise<CandidateTask | undefined> {
    const { taskId, assigneeUserId, actorId, requestId } = input;

    return this.updateTask({
      id: taskId,
      data: {
        assigneeUserId,
        assigneeKind: 'user',
        assigneeRole: null,
        assigneeResolvedAt: new Date()
      },
      actorId,
      requestId
    });
  }

  /**
   * Mark a task as complete
   */
  async completeTask(taskId: string, actorId?: string): Promise<CandidateTask | undefined> {
    return this.updateTask({
      id: taskId,
      data: {
        status: 'done',
        completedAt: new Date()
      },
      actorId
    });
  }

  /**
   * Get a single task by ID
   */
  async getTask(id: string): Promise<CandidateTask | undefined> {
    return this.taskRepo.getCandidateTask(id);
  }

  /**
   * Get tasks with filtering and authorization
   */
  async getTasks(filters?: any, auth?: AuthorizationContext): Promise<CandidateTask[]> {
    return this.taskRepo.getCandidateTasks(filters, auth);
  }

  /**
   * Archive a task (soft delete)
   */
  async archiveTask(id: string, actorId?: string): Promise<void> {
    await this.taskRepo.archiveCandidateTask(id);
    await writeAuditLog({
      actorId,
      resourceType: "candidate_task",
      resourceId: id,
      taskId: id,
      action: "archive",
      eventType: "task_archived"
    });
    // TODO: Publish taskArchived event
  }

  /**
   * Delete a task permanently
   */
  async deleteTask(id: string, actorId?: string): Promise<void> {
    await this.taskRepo.deleteCandidateTask(id);
    await writeAuditLog({
      actorId,
      resourceType: "candidate_task",
      resourceId: id,
      taskId: id,
      action: "delete",
      eventType: "task_deleted"
    });
    // TODO: Publish taskDeleted event
  }

  /**
   * Get dashboard tasks for KPI calculations
   * Returns tasks from active/on_hold candidates
   */
  async getDashboardTasks(): Promise<any[]> {
    return this.taskRepo.getDashboardTasks();
  }
}
