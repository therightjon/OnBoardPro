/**
 * Domain Event Types
 *
 * Defines all domain events that can occur in the OnBoardPro system.
 * Events represent state changes and significant occurrences in the domain.
 */

/**
 * Base domain event interface
 * All domain events must extend this interface
 */
export interface DomainEvent {
  /** Unique identifier for this event instance */
  id: string;
  /** Type of the event (e.g., "candidate.created") */
  type: string;
  /** Timestamp when the event occurred */
  timestamp: Date;
  /** User who triggered the event (null for system events) */
  actorId: string | null;
  /** Aggregate ID (the main entity this event is about) */
  aggregateId: string;
  /** Aggregate type (e.g., "candidate", "task") */
  aggregateType: string;
  /** Event-specific payload data */
  payload: Record<string, any>;
  /** Correlation ID for tracking related events */
  correlationId?: string;
  /** Causation ID (the event that caused this event) */
  causationId?: string;
  /** Metadata for additional context */
  metadata?: Record<string, any>;
}

/**
 * Event handler function type
 */
export type EventHandler<T extends DomainEvent = DomainEvent> = (event: T) => Promise<void> | void;

/**
 * Event middleware function type
 */
export type EventMiddleware = (
  event: DomainEvent,
  next: () => Promise<void>
) => Promise<void>;

// ============================================================================
// CANDIDATE EVENTS
// ============================================================================

/**
 * Candidate was created
 */
export interface CandidateCreatedEvent extends DomainEvent {
  type: "candidate.created";
  aggregateType: "candidate";
  payload: {
    candidateId: string;
    firstName: string;
    lastName: string;
    email: string;
    departmentId: string | null;
    divisionId: string | null;
    managerId: string | null;
  };
}

/**
 * Candidate status changed
 */
export interface CandidateStatusChangedEvent extends DomainEvent {
  type: "candidate.status_changed";
  aggregateType: "candidate";
  payload: {
    candidateId: string;
    previousStatus: string;
    newStatus: string;
    reason?: string;
  };
}

/**
 * Candidate hiring stage changed
 */
export interface CandidateStageChangedEvent extends DomainEvent {
  type: "candidate.stage_changed";
  aggregateType: "candidate";
  payload: {
    candidateId: string;
    previousStageId: string | null;
    newStageId: string | null;
    stageName: string;
    automated: boolean;
  };
}

/**
 * Template was applied to candidate
 */
export interface TemplateAppliedEvent extends DomainEvent {
  type: "candidate.template_applied";
  aggregateType: "candidate";
  payload: {
    candidateId: string;
    templateId: string;
    templateName: string;
    tasksCreated: number;
    stagesCreated: number;
  };
}

/**
 * Candidate was archived
 */
export interface CandidateArchivedEvent extends DomainEvent {
  type: "candidate.archived";
  aggregateType: "candidate";
  payload: {
    candidateId: string;
    reason?: string;
  };
}

/**
 * Candidate was restored from archive
 */
export interface CandidateRestoredEvent extends DomainEvent {
  type: "candidate.restored";
  aggregateType: "candidate";
  payload: {
    candidateId: string;
  };
}

// ============================================================================
// TASK EVENTS
// ============================================================================

/**
 * Task was created
 */
export interface TaskCreatedEvent extends DomainEvent {
  type: "task.created";
  aggregateType: "candidate_task";
  payload: {
    taskId: string;
    candidateId: string;
    title: string;
    assigneeUserId: string | null;
    assigneeRole: string | null;
    dueAt: Date | null;
    isRequired: boolean;
    fromTemplate: boolean;
  };
}

/**
 * Task was assigned to a user
 */
export interface TaskAssignedEvent extends DomainEvent {
  type: "task.assigned";
  aggregateType: "candidate_task";
  payload: {
    taskId: string;
    candidateId: string;
    taskTitle: string;
    assigneeUserId: string;
    previousAssigneeId: string | null;
    dueAt: Date | null;
  };
}

/**
 * Task status changed
 */
export interface TaskStatusChangedEvent extends DomainEvent {
  type: "task.status_changed";
  aggregateType: "candidate_task";
  payload: {
    taskId: string;
    candidateId: string;
    taskTitle: string;
    previousStatus: string;
    newStatus: string;
    assigneeUserId: string | null;
  };
}

/**
 * Task was completed
 */
export interface TaskCompletedEvent extends DomainEvent {
  type: "task.completed";
  aggregateType: "candidate_task";
  payload: {
    taskId: string;
    candidateId: string;
    taskTitle: string;
    completedBy: string;
    completedAt: Date;
    dueAt: Date | null;
    wasOverdue: boolean;
  };
}

/**
 * Task due date changed
 */
export interface TaskDueDateChangedEvent extends DomainEvent {
  type: "task.due_date_changed";
  aggregateType: "candidate_task";
  payload: {
    taskId: string;
    candidateId: string;
    taskTitle: string;
    previousDueDate: Date | null;
    newDueDate: Date | null;
    assigneeUserId: string | null;
  };
}

/**
 * Task was deleted/archived
 */
export interface TaskDeletedEvent extends DomainEvent {
  type: "task.deleted";
  aggregateType: "candidate_task";
  payload: {
    taskId: string;
    candidateId: string;
    taskTitle: string;
    reason?: string;
  };
}

// ============================================================================
// COMMENT EVENTS
// ============================================================================

/**
 * Comment was created
 */
export interface CommentCreatedEvent extends DomainEvent {
  type: "comment.created";
  aggregateType: "comment";
  payload: {
    commentId: string;
    candidateId: string;
    authorId: string;
    content: string;
    mentionedUserIds: string[];
  };
}

// ============================================================================
// FOLLOWER EVENTS
// ============================================================================

/**
 * User started following a candidate
 */
export interface CandidateFollowedEvent extends DomainEvent {
  type: "candidate.followed";
  aggregateType: "candidate";
  payload: {
    candidateId: string;
    userId: string;
  };
}

/**
 * User stopped following a candidate
 */
export interface CandidateUnfollowedEvent extends DomainEvent {
  type: "candidate.unfollowed";
  aggregateType: "candidate";
  payload: {
    candidateId: string;
    userId: string;
  };
}

// ============================================================================
// TEMPLATE EVENTS
// ============================================================================

/**
 * Template was created
 */
export interface TemplateCreatedEvent extends DomainEvent {
  type: "template.created";
  aggregateType: "template";
  payload: {
    templateId: string;
    templateName: string;
    description: string | null;
  };
}

/**
 * Template was updated
 */
export interface TemplateUpdatedEvent extends DomainEvent {
  type: "template.updated";
  aggregateType: "template";
  payload: {
    templateId: string;
    templateName: string;
    changes: string[];
  };
}

/**
 * Template was cloned
 */
export interface TemplateClonedEvent extends DomainEvent {
  type: "template.cloned";
  aggregateType: "template";
  payload: {
    originalTemplateId: string;
    newTemplateId: string;
    newTemplateName: string;
  };
}

// ============================================================================
// USER EVENTS
// ============================================================================

/**
 * User was created/invited
 */
export interface UserCreatedEvent extends DomainEvent {
  type: "user.created";
  aggregateType: "user";
  payload: {
    userId: string;
    email: string;
    role: string;
    invited: boolean;
  };
}

/**
 * User logged in
 */
export interface UserLoggedInEvent extends DomainEvent {
  type: "user.logged_in";
  aggregateType: "user";
  payload: {
    userId: string;
    provider: string;
    ipAddress?: string;
  };
}

/**
 * User role changed
 */
export interface UserRoleChangedEvent extends DomainEvent {
  type: "user.role_changed";
  aggregateType: "user";
  payload: {
    userId: string;
    previousRoles: string[];
    newRoles: string[];
    changedBy: string;
  };
}

// ============================================================================
// UNION TYPE OF ALL EVENTS
// ============================================================================

/**
 * Union type of all domain events
 */
export type AnyDomainEvent =
  | CandidateCreatedEvent
  | CandidateStatusChangedEvent
  | CandidateStageChangedEvent
  | TemplateAppliedEvent
  | CandidateArchivedEvent
  | CandidateRestoredEvent
  | TaskCreatedEvent
  | TaskAssignedEvent
  | TaskStatusChangedEvent
  | TaskCompletedEvent
  | TaskDueDateChangedEvent
  | TaskDeletedEvent
  | CommentCreatedEvent
  | CandidateFollowedEvent
  | CandidateUnfollowedEvent
  | TemplateCreatedEvent
  | TemplateUpdatedEvent
  | TemplateClonedEvent
  | UserCreatedEvent
  | UserLoggedInEvent
  | UserRoleChangedEvent;

/**
 * Event type string literals
 */
export type EventType = AnyDomainEvent["type"];

/**
 * Aggregate type string literals
 */
export type AggregateType = AnyDomainEvent["aggregateType"];
