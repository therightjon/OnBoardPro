/**
 * Event Factory
 *
 * Helper functions for creating domain events with proper metadata
 */

import { randomUUID } from "node:crypto";
import type {
  DomainEvent,
  AnyDomainEvent,
  CandidateCreatedEvent,
  CandidateStatusChangedEvent,
  CandidateStageChangedEvent,
  TemplateAppliedEvent,
  TaskCreatedEvent,
  TaskAssignedEvent,
  TaskStatusChangedEvent,
  TaskCompletedEvent,
  CommentCreatedEvent,
  TemplateCreatedEvent,
  TemplateUpdatedEvent,
  TemplateClonedEvent,
  UserCreatedEvent,
  UserLoggedInEvent,
  UserRoleChangedEvent
} from "./event-types";

/**
 * Context for creating events
 */
export interface EventContext {
  /** User who triggered the event */
  actorId?: string | null;
  /** Correlation ID for tracking related events */
  correlationId?: string;
  /** Causation ID (the event that caused this event) */
  causationId?: string;
  /** Additional metadata */
  metadata?: Record<string, any>;
}

/**
 * Create a base domain event with required fields
 */
function createBaseEvent<T extends DomainEvent>(
  type: T["type"],
  aggregateId: string,
  aggregateType: T["aggregateType"],
  payload: T["payload"],
  context: EventContext = {}
): T {
  return {
    id: randomUUID(),
    type,
    timestamp: new Date(),
    actorId: context.actorId ?? null,
    aggregateId,
    aggregateType,
    payload,
    correlationId: context.correlationId,
    causationId: context.causationId,
    metadata: context.metadata
  } as T;
}

// ============================================================================
// CANDIDATE EVENT FACTORIES
// ============================================================================

/**
 * Create a CandidateCreated event
 */
export function candidateCreated(
  candidateId: string,
  payload: {
    firstName: string;
    lastName: string;
    email: string;
    departmentId: string | null;
    divisionId: string | null;
    managerId: string | null;
  },
  context?: EventContext
): CandidateCreatedEvent {
  return createBaseEvent<CandidateCreatedEvent>(
    "candidate.created",
    candidateId,
    "candidate",
    { candidateId, ...payload },
    context
  );
}

/**
 * Create a CandidateStatusChanged event
 */
export function candidateStatusChanged(
  candidateId: string,
  payload: {
    previousStatus: string;
    newStatus: string;
    reason?: string;
  },
  context?: EventContext
): CandidateStatusChangedEvent {
  return createBaseEvent<CandidateStatusChangedEvent>(
    "candidate.status_changed",
    candidateId,
    "candidate",
    { candidateId, ...payload },
    context
  );
}

/**
 * Create a CandidateStageChanged event
 */
export function candidateStageChanged(
  candidateId: string,
  payload: {
    previousStageId: string | null;
    newStageId: string | null;
    stageName: string;
    automated: boolean;
  },
  context?: EventContext
): CandidateStageChangedEvent {
  return createBaseEvent<CandidateStageChangedEvent>(
    "candidate.stage_changed",
    candidateId,
    "candidate",
    { candidateId, ...payload },
    context
  );
}

/**
 * Create a TemplateApplied event
 */
export function templateApplied(
  candidateId: string,
  payload: {
    templateId: string;
    templateName: string;
    tasksCreated: number;
    stagesCreated: number;
  },
  context?: EventContext
): TemplateAppliedEvent {
  return createBaseEvent<TemplateAppliedEvent>(
    "candidate.template_applied",
    candidateId,
    "candidate",
    { candidateId, ...payload },
    context
  );
}

/**
 * Create a CandidateArchived event
 */
export function candidateArchived(
  candidateId: string,
  payload: {
    reason?: string;
  },
  context?: EventContext
) {
  return createBaseEvent(
    "candidate.archived",
    candidateId,
    "candidate",
    { candidateId, ...payload },
    context
  );
}

/**
 * Create a CandidateRestored event
 */
export function candidateRestored(
  candidateId: string,
  context?: EventContext
) {
  return createBaseEvent(
    "candidate.restored",
    candidateId,
    "candidate",
    { candidateId },
    context
  );
}

// ============================================================================
// TASK EVENT FACTORIES
// ============================================================================

/**
 * Create a TaskCreated event
 */
export function taskCreated(
  taskId: string,
  payload: {
    candidateId: string;
    title: string;
    assigneeUserId: string | null;
    assigneeRole: string | null;
    dueAt: Date | null;
    isRequired: boolean;
    fromTemplate: boolean;
  },
  context?: EventContext
): TaskCreatedEvent {
  return createBaseEvent<TaskCreatedEvent>(
    "task.created",
    taskId,
    "candidate_task",
    { taskId, ...payload },
    context
  );
}

/**
 * Create a TaskAssigned event
 */
export function taskAssigned(
  taskId: string,
  payload: {
    candidateId: string;
    taskTitle: string;
    assigneeUserId: string;
    previousAssigneeId: string | null;
    dueAt: Date | null;
  },
  context?: EventContext
): TaskAssignedEvent {
  return createBaseEvent<TaskAssignedEvent>(
    "task.assigned",
    taskId,
    "candidate_task",
    { taskId, ...payload },
    context
  );
}

/**
 * Create a TaskStatusChanged event
 */
export function taskStatusChanged(
  taskId: string,
  payload: {
    candidateId: string;
    taskTitle: string;
    previousStatus: string;
    newStatus: string;
    assigneeUserId: string | null;
  },
  context?: EventContext
): TaskStatusChangedEvent {
  return createBaseEvent<TaskStatusChangedEvent>(
    "task.status_changed",
    taskId,
    "candidate_task",
    { taskId, ...payload },
    context
  );
}

/**
 * Create a TaskCompleted event
 */
export function taskCompleted(
  taskId: string,
  payload: {
    candidateId: string;
    taskTitle: string;
    completedBy: string;
    completedAt: Date;
    dueAt: Date | null;
    wasOverdue: boolean;
  },
  context?: EventContext
): TaskCompletedEvent {
  return createBaseEvent<TaskCompletedEvent>(
    "task.completed",
    taskId,
    "candidate_task",
    { taskId, ...payload },
    context
  );
}

/**
 * Create a TaskDueDateChanged event
 */
export function taskDueDateChanged(
  taskId: string,
  payload: {
    candidateId: string;
    taskTitle: string;
    previousDueDate: Date | null;
    newDueDate: Date | null;
    assigneeUserId: string | null;
  },
  context?: EventContext
) {
  return createBaseEvent(
    "task.due_date_changed",
    taskId,
    "candidate_task",
    { taskId, ...payload },
    context
  );
}

/**
 * Create a TaskDeleted event
 */
export function taskDeleted(
  taskId: string,
  payload: {
    candidateId: string;
    taskTitle: string;
    reason?: string;
  },
  context?: EventContext
) {
  return createBaseEvent(
    "task.deleted",
    taskId,
    "candidate_task",
    { taskId, ...payload },
    context
  );
}

// ============================================================================
// COMMENT EVENT FACTORIES
// ============================================================================

/**
 * Create a CommentCreated event
 */
export function commentCreated(
  commentId: string,
  payload: {
    entityType: 'candidate' | 'task';
    entityId: string;
    authorUserId: string;
    commentBody: string;
    visibility: 'internal' | 'candidate_visible';
    mentionedUserKeys: string[];
    parentId: string | null;
  },
  context?: EventContext
): CommentCreatedEvent {
  return createBaseEvent<CommentCreatedEvent>(
    "comment.created",
    commentId,
    "comment",
    { commentId, ...payload },
    context
  );
}

// ============================================================================
// FOLLOWER EVENT FACTORIES
// ============================================================================

/**
 * Create a CandidateFollowed event
 */
export function candidateFollowed(
  candidateId: string,
  userId: string,
  context?: EventContext
) {
  return createBaseEvent(
    "candidate.followed",
    candidateId,
    "candidate",
    { candidateId, userId },
    context
  );
}

/**
 * Create a CandidateUnfollowed event
 */
export function candidateUnfollowed(
  candidateId: string,
  userId: string,
  context?: EventContext
) {
  return createBaseEvent(
    "candidate.unfollowed",
    candidateId,
    "candidate",
    { candidateId, userId },
    context
  );
}

// ============================================================================
// TEMPLATE EVENT FACTORIES
// ============================================================================

/**
 * Create a TemplateCreated event
 */
export function templateCreated(
  templateId: string,
  payload: {
    templateName: string;
    description: string | null;
  },
  context?: EventContext
): TemplateCreatedEvent {
  return createBaseEvent<TemplateCreatedEvent>(
    "template.created",
    templateId,
    "template",
    { templateId, ...payload },
    context
  );
}

/**
 * Create a TemplateUpdated event
 */
export function templateUpdated(
  templateId: string,
  payload: {
    templateName: string;
    changes: string[];
  },
  context?: EventContext
): TemplateUpdatedEvent {
  return createBaseEvent<TemplateUpdatedEvent>(
    "template.updated",
    templateId,
    "template",
    { templateId, ...payload },
    context
  );
}

/**
 * Create a TemplateCloned event
 */
export function templateCloned(
  newTemplateId: string,
  payload: {
    originalTemplateId: string;
    newTemplateName: string;
  },
  context?: EventContext
): TemplateClonedEvent {
  return createBaseEvent<TemplateClonedEvent>(
    "template.cloned",
    newTemplateId,
    "template",
    { newTemplateId, ...payload },
    context
  );
}

// ============================================================================
// USER EVENT FACTORIES
// ============================================================================

/**
 * Create a UserCreated event
 */
export function userCreated(
  userId: string,
  payload: {
    email: string;
    role: string;
    invited: boolean;
  },
  context?: EventContext
): UserCreatedEvent {
  return createBaseEvent<UserCreatedEvent>(
    "user.created",
    userId,
    "user",
    { userId, ...payload },
    context
  );
}

/**
 * Create a UserLoggedIn event
 */
export function userLoggedIn(
  userId: string,
  payload: {
    provider: string;
    ipAddress?: string;
  },
  context?: EventContext
): UserLoggedInEvent {
  return createBaseEvent<UserLoggedInEvent>(
    "user.logged_in",
    userId,
    "user",
    { userId, ...payload },
    context
  );
}

/**
 * Create a UserRoleChanged event
 */
export function userRoleChanged(
  userId: string,
  payload: {
    previousRoles: string[];
    newRoles: string[];
    changedBy: string;
  },
  context?: EventContext
): UserRoleChangedEvent {
  return createBaseEvent<UserRoleChangedEvent>(
    "user.role_changed",
    userId,
    "user",
    { userId, ...payload },
    context
  );
}
