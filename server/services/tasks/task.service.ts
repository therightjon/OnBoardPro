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

export interface CreateTaskInput {
  data: InsertCandidateTask;
  actorId?: string;
}

export interface UpdateTaskInput {
  id: string;
  data: Partial<CandidateTask>;
  actorId?: string;
}

export interface AssignTaskInput {
  taskId: string;
  assigneeUserId: string;
  actorId?: string;
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
    const { taskId, assigneeUserId, actorId } = input;

    return this.updateTask({
      id: taskId,
      data: {
        assigneeUserId,
        assigneeKind: 'user',
        assigneeRole: null,
        assigneeResolvedAt: new Date()
      },
      actorId
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
    // TODO: Publish taskArchived event
  }

  /**
   * Delete a task permanently
   */
  async deleteTask(id: string, actorId?: string): Promise<void> {
    await this.taskRepo.deleteCandidateTask(id);
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
