/**
 * Notification Event Handler
 *
 * Creates notifications in response to domain events
 */

import type { EventBus } from "../EventBus";
import type {
  TaskCreatedEvent,
  TaskAssignedEvent,
  TaskCompletedEvent,
  CommentCreatedEvent,
  CandidateStageChangedEvent,
  TemplateAppliedEvent
} from "../event-types";
import { getNotificationRepository, getCandidateRepository } from "../../services/service-factory";

/**
 * Register notification handlers with the event bus
 */
export function registerNotificationHandlers(eventBus: EventBus): void {
  // Task created -> notify assignee (if assigned)
  eventBus.on<TaskCreatedEvent>("task.created", async (event) => {
    const { assigneeUserId, title, candidateId, dueAt } = event.payload;

    if (!assigneeUserId) {
      return; // No assignee to notify
    }

    let message = `You have been assigned a new task: ${title}`;
    if (dueAt) {
      const dueDateStr = new Date(dueAt).toLocaleDateString();
      message += ` (due ${dueDateStr})`;
    }

    await createNotification({
      recipientUserId: assigneeUserId,
      eventType: "task.created",
      title: "New Task Assigned",
      message,
      actorUserId: event.actorId,
      relatedEntityType: "candidate_task",
      relatedEntityId: event.aggregateId,
      contextCandidateId: candidateId
    });
  });

  // Task assigned -> notify assignee
  eventBus.on<TaskAssignedEvent>("task.assigned", async (event) => {
    const { assigneeUserId, taskTitle, candidateId, dueAt } = event.payload;

    if (!assigneeUserId) {
      return; // No assignee to notify
    }

    let message = `You have been assigned a new task: ${taskTitle}`;
    if (dueAt) {
      const dueDateStr = new Date(dueAt).toLocaleDateString();
      message += ` (due ${dueDateStr})`;
    }

    await createNotification({
      recipientUserId: assigneeUserId,
      eventType: "task.assigned",
      title: "New Task Assigned",
      message,
      actorUserId: event.actorId,
      relatedEntityType: "candidate_task",
      relatedEntityId: event.aggregateId,
      contextCandidateId: candidateId
    });
  });

  // Task completed -> notify candidate manager and followers
  eventBus.on<TaskCompletedEvent>("task.completed", async (event) => {
    const { candidateId, taskTitle, completedBy, wasOverdue } = event.payload;

    // Get candidate to find manager using repository
    const candidateRepo = getCandidateRepository();
    const candidate = await candidateRepo.getCandidateForNotification(candidateId);

    if (!candidate) {
      return;
    }

    let message = `Task "${taskTitle}" was completed`;
    if (wasOverdue) {
      message += " (was overdue)";
    }

    // Notify manager if exists
    if (candidate.managerId && candidate.managerId !== completedBy) {
      await createNotification({
        recipientUserId: candidate.managerId,
        eventType: "task.completed",
        title: "Task Completed",
        message,
        actorUserId: completedBy,
        relatedEntityType: "candidate_task",
        relatedEntityId: event.aggregateId,
        contextCandidateId: candidateId
      });
    }

    // Notify followers
    const { getCandidateService } = await import("../../services/service-factory");
    const candidateService = getCandidateService();
    const followers = await candidateService.getFollowers(candidateId);
    
    for (const follower of followers) {
      // Don't notify the person who completed the task or the manager (already notified)
      if (follower.userId !== completedBy && follower.userId !== candidate.managerId) {
        await createNotification({
          recipientUserId: follower.userId,
          eventType: "task.completed",
          title: "Task Completed",
          message,
          actorUserId: completedBy,
          relatedEntityType: "candidate_task",
          relatedEntityId: event.aggregateId,
          contextCandidateId: candidateId
        });
      }
    }
  });

  // Comment created -> notify mentioned users and watchers
  eventBus.on<CommentCreatedEvent>("comment.created", async (event) => {
    const {
      entityType,
      entityId,
      authorUserId,
      commentBody,
      visibility,
      mentionedUserKeys
    } = event.payload;

    // Import notification utilities and services
    const {
      resolveMentionedUsers,
      createNotifications
    } = await import("../../features/notifications/services");
    const { buildCommentSnippet } = await import("../../utils/notification.utils");
    const { getCandidateService, getTaskService } = await import("../../services/service-factory");

    const candidateService = getCandidateService();
    const taskService = getTaskService();

    // Resolve mentioned users
    const mentionedUsers = mentionedUserKeys.length > 0
      ? await resolveMentionedUsers(mentionedUserKeys)
      : [];

    const mentionRecipientIds = new Set(mentionedUsers.map(u => u.id));
    const watcherIds = new Set<string>();

    // Get watchers based on entity type
    if (entityType === 'candidate') {
      const candidate = await candidateService.getCandidate(entityId);
      if (candidate) {
        // Get candidate followers
        const followers = await candidateService.getFollowers(entityId);
        followers.forEach(f => watcherIds.add(f.userId));

        // Add manager as watcher
        if (candidate.managerId) {
          watcherIds.add(candidate.managerId);
        }
      }
    } else if (entityType === 'task') {
      const task = await taskService.getTask(entityId);
      if (task && task.assigneeKind === 'user' && task.assigneeUserId) {
        watcherIds.add(task.assigneeUserId);
      }
    }

    // Remove mentioned users from watchers (they get separate notifications)
    mentionedUsers.forEach(u => watcherIds.delete(u.id));

    // Don't notify the author
    watcherIds.delete(authorUserId);

    const snippet = buildCommentSnippet(commentBody);

    // Get context for notification payload
    let contextCandidateId: string | null = null;
    let candidateName = '';

    if (entityType === 'candidate') {
      contextCandidateId = entityId;
      const candidate = await candidateService.getCandidate(entityId);
      if (candidate) {
        candidateName = `${candidate.firstName} ${candidate.lastName}`;
      }
    } else if (entityType === 'task') {
      const task = await taskService.getTask(entityId);
      if (task) {
        contextCandidateId = task.candidateId;
        const candidate = await candidateService.getCandidate(task.candidateId);
        if (candidate) {
          candidateName = `${candidate.firstName} ${candidate.lastName}`;
        }
      }
    }

    const basePayload = {
      actor: { id: authorUserId },
      comment: {
        id: event.aggregateId,
        preview: snippet,
        visibility
      },
      candidate: contextCandidateId ? {
        id: contextCandidateId,
        name: candidateName
      } : undefined,
      source: entityType
    };

    // Map visibility: candidate_visible -> external, internal -> internal
    const notificationVisibility: "internal" | "external" =
      visibility === 'candidate_visible' ? 'external' : 'internal';

    // Notify watchers
    const watcherList = Array.from(watcherIds);
    if (watcherList.length > 0) {
      await createNotifications({
        type: "comment.created",
        actorId: authorUserId,
        recipients: watcherList,
        entity: { type: "comment", id: event.aggregateId },
        payload: { ...basePayload, reason: 'comment' },
        visibility: notificationVisibility
      });
    }

    // Notify mentioned users
    const mentionList = Array.from(mentionRecipientIds);
    if (mentionList.length > 0) {
      await createNotifications({
        type: "mention",
        actorId: authorUserId,
        recipients: mentionList,
        entity: { type: "comment", id: event.aggregateId },
        payload: { ...basePayload, reason: 'mention' },
        visibility: notificationVisibility
      });
    }
  });

  // Candidate stage changed -> notify manager and followers
  eventBus.on<CandidateStageChangedEvent>("candidate.stage_changed", async (event) => {
    const { candidateId, stageName, automated } = event.payload;

    // Get candidate to find manager using repository
    const candidateRepo = getCandidateRepository();
    const candidate = await candidateRepo.getCandidateForNotification(candidateId);

    if (!candidate) {
      return;
    }

    let message = `Candidate ${candidate.firstName} ${candidate.lastName} moved to ${stageName}`;
    if (automated) {
      message += " (automatically)";
    }

    // Notify manager if exists
    if (candidate.managerId) {
      await createNotification({
        recipientUserId: candidate.managerId,
        eventType: "candidate.statusChange",
        title: "Candidate Stage Changed",
        message,
        actorUserId: event.actorId,
        relatedEntityType: "candidate",
        relatedEntityId: candidateId,
        contextCandidateId: candidateId
      });
    }

    // Notify followers
    const { getCandidateService } = await import("../../services/service-factory");
    const candidateService = getCandidateService();
    const followers = await candidateService.getFollowers(candidateId);
    
    for (const follower of followers) {
      // Don't notify the actor or the manager (already notified)
      if (follower.userId !== event.actorId && follower.userId !== candidate.managerId) {
        await createNotification({
          recipientUserId: follower.userId,
          eventType: "candidate.statusChange",
          title: "Candidate Stage Changed",
          message,
          actorUserId: event.actorId,
          relatedEntityType: "candidate",
          relatedEntityId: candidateId,
          contextCandidateId: candidateId
        });
      }
    }
  });

  // Template applied -> notify manager
  eventBus.on<TemplateAppliedEvent>("candidate.template_applied", async (event) => {
    const { candidateId, templateName, tasksCreated } = event.payload;

    // Get candidate to find manager using repository
    const candidateRepo = getCandidateRepository();
    const candidate = await candidateRepo.getCandidateForNotification(candidateId);

    if (!candidate || !candidate.managerId) {
      return;
    }

    const message = `Template "${templateName}" applied to ${candidate.firstName} ${candidate.lastName} (${tasksCreated} tasks created)`;

    await createNotification({
      recipientUserId: candidate.managerId,
      eventType: "candidate.statusChange",
      title: "Template Applied",
      message,
      actorUserId: event.actorId,
      relatedEntityType: "candidate",
      relatedEntityId: candidateId,
      contextCandidateId: candidateId
    });
  });
}

/**
 * Create a notification using the repository
 */
async function createNotification(params: {
  recipientUserId: string;
  eventType: string;
  title: string;
  message: string;
  actorUserId: string | null | undefined;
  relatedEntityType: string;
  relatedEntityId: string;
  contextCandidateId: string | null;
}): Promise<void> {
  try {
    const notificationRepo = getNotificationRepository();
    await notificationRepo.createNotification(params);
  } catch (error) {
    console.error("Failed to create notification:", error);
    // Don't throw - notification creation failure shouldn't break the event flow
  }
}
