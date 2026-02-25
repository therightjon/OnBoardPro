/**
 * Notification Event Handler
 *
 * Creates notifications in response to domain events.
 * Uses createNotifications (from notify.ts) which handles:
 *   1) user preference filtering
 *   2) in-app notification insert with coalescing
 *   3) outbox enqueue for email delivery
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
import { getCandidateRepository } from "../../services/service-factory";
import { createNotifications } from "../../features/notifications/services";
import { logger } from "../../utils/logger";

/**
 * Register notification handlers with the event bus
 */
export function registerNotificationHandlers(eventBus: EventBus): void {
  // Task created -> notify assignee (if assigned)
  eventBus.on<TaskCreatedEvent>("task.created", async (event) => {
    const { assigneeUserId, title, candidateId, dueAt, taskId } = event.payload;

    if (!assigneeUserId) {
      return; // No assignee to notify
    }

    try {
      await createNotifications({
        type: "task.created",
        actorId: event.actorId,
        recipients: [assigneeUserId],
        entity: { type: "task", id: taskId },
        payload: {
          actor: { id: event.actorId },
          task: { id: taskId, title, dueAt: dueAt ? new Date(dueAt).toISOString() : null },
          candidate: { id: candidateId },
          reason: "assignment",
        },
        visibility: "internal",
      });
    } catch (error) {
      logger.error("Failed to create task.created notification", error);
    }
  });

  // Task assigned -> notify assignee
  eventBus.on<TaskAssignedEvent>("task.assigned", async (event) => {
    const { assigneeUserId, taskTitle, candidateId, dueAt, taskId } = event.payload;

    if (!assigneeUserId) {
      return; // No assignee to notify
    }

    try {
      await createNotifications({
        type: "task.assigned",
        actorId: event.actorId,
        recipients: [assigneeUserId],
        entity: { type: "task", id: taskId },
        payload: {
          actor: { id: event.actorId },
          task: { id: taskId, title: taskTitle, dueAt: dueAt ? new Date(dueAt).toISOString() : null },
          candidate: { id: candidateId },
          reason: "assignment",
        },
        visibility: "internal",
      });
    } catch (error) {
      logger.error("Failed to create task.assigned notification", error);
    }
  });

  // Task completed -> notify candidate manager and followers
  eventBus.on<TaskCompletedEvent>("task.completed", async (event) => {
    const { candidateId, taskTitle, completedBy, wasOverdue, taskId } = event.payload;

    // Get candidate to find manager using repository
    const candidateRepo = getCandidateRepository();
    const candidate = await candidateRepo.getCandidateForNotification(candidateId);

    if (!candidate) {
      return;
    }

    // Collect recipients: manager + followers (excluding the actor)
    const recipients: string[] = [];
    if (candidate.managerId && candidate.managerId !== completedBy) {
      recipients.push(candidate.managerId);
    }

    const { getCandidateService } = await import("../../services/service-factory");
    const candidateService = getCandidateService();
    const followers = await candidateService.getFollowers(candidateId);
    for (const follower of followers) {
      if (follower.userId !== completedBy && follower.userId !== candidate.managerId) {
        recipients.push(follower.userId);
      }
    }

    if (recipients.length === 0) return;

    try {
      await createNotifications({
        type: "task.completed",
        actorId: completedBy,
        recipients,
        entity: { type: "task", id: taskId },
        payload: {
          actor: { id: completedBy },
          task: { id: taskId, title: taskTitle },
          candidate: { id: candidateId, name: `${candidate.firstName} ${candidate.lastName}` },
          wasOverdue,
        },
        visibility: "internal",
      });
    } catch (error) {
      logger.error("Failed to create task.completed notification", error);
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

    // Collect recipients: manager + followers (excluding the actor)
    const recipients: string[] = [];
    if (candidate.managerId && candidate.managerId !== event.actorId) {
      recipients.push(candidate.managerId);
    }

    const { getCandidateService } = await import("../../services/service-factory");
    const candidateService = getCandidateService();
    const followers = await candidateService.getFollowers(candidateId);
    for (const follower of followers) {
      if (follower.userId !== event.actorId && follower.userId !== candidate.managerId) {
        recipients.push(follower.userId);
      }
    }

    if (recipients.length === 0) return;

    try {
      await createNotifications({
        type: "stage.changed",
        actorId: event.actorId,
        recipients,
        entity: { type: "candidate", id: candidateId },
        payload: {
          actor: { id: event.actorId },
          stage: { toStageName: stageName },
          candidate: { id: candidateId, name: `${candidate.firstName} ${candidate.lastName}` },
          automated,
        },
        visibility: "internal",
      });
    } catch (error) {
      logger.error("Failed to create stage.changed notification", error);
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

    try {
      await createNotifications({
        type: "candidate.template_applied",
        actorId: event.actorId,
        recipients: [candidate.managerId],
        entity: { type: "candidate", id: candidateId },
        payload: {
          actor: { id: event.actorId },
          templateName,
          tasksCreated,
          candidate: { id: candidateId, name: `${candidate.firstName} ${candidate.lastName}` },
        },
        visibility: "internal",
      });
    } catch (error) {
      logger.error("Failed to create template_applied notification", error);
    }
  });
}
