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

  // Comment created with mentions -> notify mentioned users
  eventBus.on<CommentCreatedEvent>("comment.created", async (event) => {
    const { mentionedUserIds, candidateId, authorId } = event.payload;

    if (mentionedUserIds.length === 0) {
      return;
    }

    // Create notification for each mentioned user
    const notificationPromises = mentionedUserIds
      .filter(userId => userId !== authorId) // Don't notify the author
      .map(userId =>
        createNotification({
          recipientUserId: userId,
          eventType: "mention",
          title: "You were mentioned",
          message: "You were mentioned in a comment",
          actorUserId: authorId,
          relatedEntityType: "comment",
          relatedEntityId: event.aggregateId,
          contextCandidateId: candidateId
        })
      );

    await Promise.all(notificationPromises);
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
    await db.insert(notifications).values({
      id: randomUUID(),
      recipientUserId: params.recipientUserId,
      eventType: params.eventType,
      title: params.title,
      message: params.message,
      actorUserId: params.actorUserId ?? null,
      relatedEntityType: params.relatedEntityType,
      relatedEntityId: params.relatedEntityId,
      contextCandidateId: params.contextCandidateId,
      read: false,
      readAt: null,
      createdAt: new Date(),
      updatedAt: new Date()
    });
  } catch (error) {
    console.error("Failed to create notification:", error);
    // Don't throw - notification creation failure shouldn't break the event flow
  }
}
