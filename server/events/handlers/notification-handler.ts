/**
 * Notification Event Handler
 *
 * Creates notifications in response to domain events
 */

import type { EventBus } from "../EventBus";
import type {
  TaskAssignedEvent,
  TaskCompletedEvent,
  CommentCreatedEvent,
  CandidateStageChangedEvent,
  TemplateAppliedEvent
} from "../event-types";
import { db } from "../../db/connection";
import { notifications } from "@shared/schemas";
import { randomUUID } from "node:crypto";

/**
 * Register notification handlers with the event bus
 */
export function registerNotificationHandlers(eventBus: EventBus): void {
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

    // Get candidate to find manager
    const candidate = await db.query.candidates.findFirst({
      where: (candidates, { eq }) => eq(candidates.id, candidateId)
    });

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

    // TODO: Also notify followers (requires follower query)
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

    // Import notification utilities
    const {
      resolveMentionedUsers,
      createNotifications
    } = await import("../../features/notifications/services");
    const { buildCommentSnippet } = await import("../../utils/notification.utils");
    const { storage } = await import("../../db/storage");

    // Resolve mentioned users
    const mentionedUsers = mentionedUserKeys.length > 0
      ? await resolveMentionedUsers(mentionedUserKeys)
      : [];

    const mentionRecipientIds = new Set(mentionedUsers.map(u => u.id));
    const watcherIds = new Set<string>();

    // Get watchers based on entity type
    if (entityType === 'candidate') {
      const candidate = await storage.getCandidate(entityId);
      if (candidate) {
        // Get candidate followers
        const followers = await storage.getCandidateFollowers(entityId);
        followers.forEach(f => watcherIds.add(f.userId));

        // Add manager as watcher
        if (candidate.managerId) {
          watcherIds.add(candidate.managerId);
        }
      }
    } else if (entityType === 'task') {
      const task = await storage.getCandidateTask(entityId);
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
      const candidate = await storage.getCandidate(entityId);
      if (candidate) {
        candidateName = `${candidate.firstName} ${candidate.lastName}`;
      }
    } else if (entityType === 'task') {
      const task = await storage.getCandidateTask(entityId);
      if (task) {
        contextCandidateId = task.candidateId;
        const candidate = await storage.getCandidate(task.candidateId);
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

    // Get candidate to find manager
    const candidate = await db.query.candidates.findFirst({
      where: (candidates, { eq }) => eq(candidates.id, candidateId)
    });

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

    // TODO: Also notify followers
  });

  // Template applied -> notify manager
  eventBus.on<TemplateAppliedEvent>("candidate.template_applied", async (event) => {
    const { candidateId, templateName, tasksCreated } = event.payload;

    // Get candidate to find manager
    const candidate = await db.query.candidates.findFirst({
      where: (candidates, { eq }) => eq(candidates.id, candidateId)
    });

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
 * Create a notification in the database
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
    // Map relatedEntityType to entityType enum
    let entityType: 'candidate' | 'task' | 'comment' = 'task';
    if (params.relatedEntityType === 'candidate') {
      entityType = 'candidate';
    } else if (params.relatedEntityType === 'comment') {
      entityType = 'comment';
    } else if (params.relatedEntityType === 'candidate_task') {
      entityType = 'task';
    }

    await db.insert(notifications).values({
      id: randomUUID(),
      userId: params.recipientUserId,
      type: params.eventType,
      entityType,
      entityId: params.relatedEntityId,
      payload: {
        title: params.title,
        message: params.message,
        actorId: params.actorUserId,
        contextCandidateId: params.contextCandidateId
      },
      isRead: false,
      readAt: null,
      deliveredChannels: []
    });
  } catch (error) {
    console.error("Failed to create notification:", error);
    // Don't throw - notification creation failure shouldn't break the event flow
  }
}
