import type { Express } from "express";
import { createNotifications } from "../features/notifications/services";
import { getCandidateService, getTaskService, getUserService } from "../services/service-factory";

const COMMENT_SNIPPET_LIMIT = 240;

/**
 * Builds a display label for a user actor (name or email)
 * @param user - The user object
 * @returns Display label for the user
 */
export function buildActorLabel(user: Express.User): string {
  const parts = [user.firstName, user.lastName].filter(Boolean);
  return parts.join(" ").trim() || user.email || user.id;
}

/**
 * Builds a snippet of a comment for notifications (truncated to limit)
 * @param body - The comment body text
 * @param limit - Character limit for the snippet (default 240)
 * @returns Truncated comment snippet with ellipsis if needed
 */
export function buildCommentSnippet(body: string, limit = COMMENT_SNIPPET_LIMIT): string {
  const normalized = (body ?? "").replace(/\s+/g, " ").trim();
  if (normalized.length <= limit) {
    return normalized;
  }
  return normalized.slice(0, limit - 3).trimEnd() + "...";
}

/**
 * Gathers notification context for a candidate including watchers
 * @param candidateId - The candidate ID
 * @returns Object containing the candidate and set of watcher user IDs
 */
export async function gatherCandidateNotificationContext(candidateId: string) {
  const candidateService = getCandidateService();
  const [candidate, followers] = await Promise.all([
    candidateService.getCandidate(candidateId),
    candidateService.getFollowers(candidateId)
  ]);

  const watcherIds = new Set<string>();
  if (candidate?.primaryOwnerId) {
    watcherIds.add(candidate.primaryOwnerId);
  }
  for (const follower of followers) {
    watcherIds.add(follower.userId);
  }

  return { candidate, watcherIds } as const;
}

/**
 * Gathers all assignee user IDs for active tasks on a candidate
 * @param candidateId - The candidate ID
 * @returns Array of unique assignee user IDs
 */
export async function gatherCandidateAssigneeIds(candidateId: string): Promise<string[]> {
  const taskService = getTaskService();
  const tasks = await taskService.getTasks({ candidateId });
  const ids = new Set<string>();
  for (const task of tasks) {
    if (task.assigneeKind === 'user' && task.assigneeUserId && task.status !== 'done' && task.status !== 'canceled') {
      ids.add(task.assigneeUserId);
    }
  }
  return Array.from(ids);
}

/**
 * Notifies task assignees when a task is assigned or status changes
 * @param task - The task object
 * @param actor - The user performing the action
 * @param reason - The reason for the notification ('assignment' or 'status_change')
 * @param extraPayload - Additional payload data (optional)
 */
export async function notifyTaskAssignees(task: any, actor: Express.User, reason: 'assignment' | 'status_change', extraPayload?: Record<string, unknown>) {
  if (task?.assigneeKind !== 'user' || !task?.assigneeUserId) {
    return;
  }

  const candidateService = getCandidateService();
  const userService = getUserService();
  const candidate = await candidateService.getCandidate(task.candidateId);
  const actorName = buildActorLabel(actor);
  const payload = {
    actor: { id: actor.id, name: actorName },
    task: {
      id: task.id,
      title: task.title,
      status: task.status,
      assigneeUserId: task.assigneeUserId ?? null,
    },
    candidate: candidate ? {
      id: candidate.id,
      name: `${candidate.firstName} ${candidate.lastName}`
    } : { id: task.candidateId },
    reason,
    ...extraPayload
  } as const;

  // Determine recipient visibility: candidates receive external notifications
  // while staff/internal users receive internal notifications.
  try {
    const recipient = await userService.getUser(task.assigneeUserId);
    const visibility = recipient?.role === 'candidate' ? 'external' : 'internal';
    await createNotifications({
      type: "task.assigned",
      actorId: actor.id,
      recipients: [task.assigneeUserId],
      entity: { type: "task", id: task.id },
      payload,
      visibility
    });
  } catch {
    // If user lookup fails, default to internal to avoid leaking externally
    await createNotifications({
      type: "task.assigned",
      actorId: actor.id,
      recipients: [task.assigneeUserId],
      entity: { type: "task", id: task.id },
      payload,
      visibility: "internal"
    });
  }
}

/**
 * Notifies watchers and assignees when a candidate's stage changes
 * @param params - Parameters for the stage change notification
 * @param params.candidateId - The candidate ID
 * @param params.actor - The user performing the action
 * @param params.fromStageId - The previous stage ID (optional)
 * @param params.toStageId - The new stage ID
 * @param params.toStageName - The new stage name (optional)
 */
export async function notifyCandidateStageChange(params: { candidateId: string; actor: Express.User; fromStageId?: string | null; toStageId: string; toStageName?: string | null }) {
  const { candidateId, actor, fromStageId, toStageId, toStageName } = params;
  const [{ candidate, watcherIds }, assigneeIds] = await Promise.all([
    gatherCandidateNotificationContext(candidateId),
    gatherCandidateAssigneeIds(candidateId)
  ]);

  for (const assigneeId of assigneeIds) {
    watcherIds.add(assigneeId);
  }

  if (watcherIds.size === 0) {
    return;
  }

  const actorName = buildActorLabel(actor);
  const payload = {
    actor: { id: actor.id, name: actorName },
    candidate: candidate ? {
      id: candidate.id,
      name: `${candidate.firstName} ${candidate.lastName}`
    } : { id: candidateId },
    stage: {
      fromStageId: fromStageId ?? null,
      toStageId,
      toStageName: toStageName ?? null
    }
  } as const;

  await createNotifications({
    type: "stage.changed",
    actorId: actor.id,
    recipients: Array.from(watcherIds),
    entity: { type: "candidate", id: candidateId },
    payload,
    visibility: "internal"
  });
}
