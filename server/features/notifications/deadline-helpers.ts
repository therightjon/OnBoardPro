import { and, eq, gt, inArray, lt, lte, ne, sql } from "drizzle-orm";
import { db } from "../../db/connection";
import { candidateTasks, candidates, notificationKeys } from "@shared/schemas";
import { storage } from "../../db/storage";
import { createNotifications } from "./services/notify";
import type { Candidate } from "@shared/schemas";

const TASK_OPEN_STATUSES = new Set(["todo", "in_progress", "blocked"]);
const DUE_SOON_WINDOW_MS = 24 * 60 * 60 * 1000;

function isTaskOpen(status: string | null | undefined): boolean {
  return status ? TASK_OPEN_STATUSES.has(status) : false;
}

function buildNotificationKey(type: "task.due_soon" | "task.overdue", taskId: string, dueAt: Date): string {
  return `${type}:${taskId}:${dueAt.toISOString()}`;
}

async function recordNotificationKey(key: string, userId: string): Promise<boolean> {
  if (!userId) return false;
  const inserted = await db
    .insert(notificationKeys)
    .values({ key, userId })
    .onConflictDoNothing()
    .returning({ id: notificationKeys.id });
  return inserted.length > 0;
}

async function loadTask(taskId: string) {
  const rows = await db
    .select({
      id: candidateTasks.id,
      candidateId: candidateTasks.candidateId,
      title: candidateTasks.title,
      dueAt: candidateTasks.dueAt,
      status: candidateTasks.status,
      completedAt: candidateTasks.completedAt,
      archived: candidateTasks.archived,
      assigneeKind: candidateTasks.assigneeKind,
      assigneeUserId: candidateTasks.assigneeUserId,
      assigneeRole: candidateTasks.assigneeRole,
    })
    .from(candidateTasks)
    .where(eq(candidateTasks.id, taskId))
    .limit(1);

  if (rows.length === 0) {
    return null;
  }

  const task = rows[0];
  const candidate = await storage.getCandidate(task.candidateId);
  if (!candidate) {
    return null;
  }

  const followers = await storage.getCandidateFollowers(task.candidateId);
  const watcherIds = new Set<string>();
  if (candidate.primaryOwnerId) {
    watcherIds.add(candidate.primaryOwnerId);
  }
  for (const follower of followers) {
    watcherIds.add(follower.userId);
  }

  return { task, candidate, watcherIds };
}

function computeCandidateName(candidate: Candidate | undefined): string {
  if (!candidate) return "Candidate";
  const name = `${candidate.firstName ?? ""} ${candidate.lastName ?? ""}`.trim();
  return name || "Candidate";
}

async function emitTaskDueSoonInternal(
  task: any,
  candidate: Candidate,
  watcherIds: Set<string>,
  actorId: string | null,
) {
  if (!task.dueAt) return;
  const dueAt = new Date(task.dueAt);
  const keyBase = buildNotificationKey("task.due_soon", task.id, dueAt);
  const internalRecipients = new Set<string>();
  if (task.assigneeKind === "user" && task.assigneeUserId) {
    internalRecipients.add(task.assigneeUserId);
  }
  for (const id of watcherIds) {
    if (id) internalRecipients.add(id);
  }
  if (actorId) {
    internalRecipients.delete(actorId);
  }

  const candidateUserId = candidate.linkedUserId;
  const visibleToCandidate = Boolean(
    candidateUserId &&
    task.assigneeKind === "user" &&
    task.assigneeUserId &&
    candidateUserId === task.assigneeUserId
  );

  const candidateRecipients: string[] = [];
  if (visibleToCandidate && candidateUserId && candidateUserId !== actorId) {
    candidateRecipients.push(candidateUserId);
    internalRecipients.delete(candidateUserId);
  }

  const filteredInternal: string[] = [];
  for (const id of internalRecipients) {
    const shouldNotify = await recordNotificationKey(keyBase, id);
    if (shouldNotify) filteredInternal.push(id);
  }

  const filteredCandidate: string[] = [];
  for (const id of candidateRecipients) {
    const shouldNotify = await recordNotificationKey(keyBase, id);
    if (shouldNotify) filteredCandidate.push(id);
  }

  if (filteredInternal.length === 0 && filteredCandidate.length === 0) {
    return;
  }

  const candidateName = computeCandidateName(candidate);
  const payload = {
    task: {
      id: task.id,
      title: task.title,
      dueAt: dueAt.toISOString(),
      assigneeUserId: task.assigneeUserId ?? null,
    },
    candidate: {
      id: candidate.id,
      name: candidateName,
    },
    reason: "due_soon",
  } as const;

  if (filteredInternal.length > 0) {
    await createNotifications({
      type: "task.due_soon",
      actorId: actorId ?? null,
      recipients: filteredInternal,
      entity: { type: "task", id: task.id },
      payload,
      visibility: "internal",
    });
  }

  if (filteredCandidate.length > 0) {
    await createNotifications({
      type: "task.due_soon",
      actorId: actorId ?? null,
      recipients: filteredCandidate,
      entity: { type: "task", id: task.id },
      payload,
      visibility: "external",
    });
  }

  await db
    .update(candidateTasks)
    .set({ dueSoonNotifiedAt: new Date() })
    .where(eq(candidateTasks.id, task.id));
}

async function emitTaskOverdueInternal(
  task: any,
  candidate: Candidate,
  watcherIds: Set<string>,
  actorId: string | null,
) {
  if (!task.dueAt) return;
  const dueAt = new Date(task.dueAt);
  const keyBase = buildNotificationKey("task.overdue", task.id, dueAt);
  const internalRecipients = new Set<string>();
  if (task.assigneeKind === "user" && task.assigneeUserId) {
    internalRecipients.add(task.assigneeUserId);
  }
  for (const id of watcherIds) {
    if (id) internalRecipients.add(id);
  }
  if (actorId) {
    internalRecipients.delete(actorId);
  }

  const candidateUserId = candidate.linkedUserId;
  const visibleToCandidate = Boolean(
    candidateUserId &&
    task.assigneeKind === "user" &&
    task.assigneeUserId &&
    candidateUserId === task.assigneeUserId
  );

  const candidateRecipients: string[] = [];
  if (visibleToCandidate && candidateUserId && candidateUserId !== actorId) {
    candidateRecipients.push(candidateUserId);
    internalRecipients.delete(candidateUserId);
  }

  const filteredInternal: string[] = [];
  for (const id of internalRecipients) {
    const shouldNotify = await recordNotificationKey(keyBase, id);
    if (shouldNotify) filteredInternal.push(id);
  }

  const filteredCandidate: string[] = [];
  for (const id of candidateRecipients) {
    const shouldNotify = await recordNotificationKey(keyBase, id);
    if (shouldNotify) filteredCandidate.push(id);
  }

  if (filteredInternal.length === 0 && filteredCandidate.length === 0) {
    return;
  }

  const candidateName = computeCandidateName(candidate);
  const payload = {
    task: {
      id: task.id,
      title: task.title,
      dueAt: dueAt.toISOString(),
      assigneeUserId: task.assigneeUserId ?? null,
    },
    candidate: {
      id: candidate.id,
      name: candidateName,
    },
    reason: "overdue",
  } as const;

  if (filteredInternal.length > 0) {
    await createNotifications({
      type: "task.overdue",
      actorId: actorId ?? null,
      recipients: filteredInternal,
      entity: { type: "task", id: task.id },
      payload,
      visibility: "internal",
    });
  }

  if (filteredCandidate.length > 0) {
    await createNotifications({
      type: "task.overdue",
      actorId: actorId ?? null,
      recipients: filteredCandidate,
      entity: { type: "task", id: task.id },
      payload,
      visibility: "external",
    });
  }
}

export interface DeadlineOptions {
  actorId?: string | null;
}

export async function emitDeadlinesIfNeeded(taskId: string, options: DeadlineOptions = {}): Promise<void> {
  const loaded = await loadTask(taskId);
  if (!loaded) return;

  const { task, candidate, watcherIds } = loaded;
  if (!isTaskOpen(task.status) || task.archived) {
    return;
  }

  if (!task.dueAt) {
    return;
  }

  const now = new Date();
  const dueAt = new Date(task.dueAt);
  const actorId = options.actorId ?? null;

  const isOverdue = dueAt.getTime() < now.getTime() && !task.completedAt;
  if (isOverdue) {
    await emitTaskOverdueInternal(task, candidate, watcherIds, actorId);
    return; // overdue supersedes due soon
  }

  const windowStart = now.getTime();
  const windowEnd = windowStart + DUE_SOON_WINDOW_MS;
  if (dueAt.getTime() > windowStart && dueAt.getTime() <= windowEnd && !task.completedAt) {
    await emitTaskDueSoonInternal(task, candidate, watcherIds, actorId);
  }
}

interface ScanTaskRow {
  id: string;
  dueAt: Date;
}

export async function findOverdueTasks(limit: number): Promise<ScanTaskRow[]> {
  const now = new Date();
  const rows = await db
    .select({ id: candidateTasks.id, dueAt: candidateTasks.dueAt })
    .from(candidateTasks)
    .innerJoin(candidates, eq(candidateTasks.candidateId, candidates.id))
    .where(and(
      sql`${candidateTasks.dueAt} IS NOT NULL`,
      lt(candidateTasks.dueAt, now),
      eq(candidateTasks.archived, false),
      ne(candidateTasks.status, 'done'),
      ne(candidateTasks.status, 'canceled'),
      inArray(candidates.status, ['active', 'on_hold'])
    ))
    .orderBy(candidateTasks.dueAt)
    .limit(limit);
  return rows as ScanTaskRow[];
}

export async function findDueSoonTasks(limit: number): Promise<ScanTaskRow[]> {
  const now = new Date();
  const windowEnd = new Date(now.getTime() + DUE_SOON_WINDOW_MS);
  const rows = await db
    .select({ id: candidateTasks.id, dueAt: candidateTasks.dueAt })
    .from(candidateTasks)
    .innerJoin(candidates, eq(candidateTasks.candidateId, candidates.id))
    .where(and(
      sql`${candidateTasks.dueAt} IS NOT NULL`,
      gt(candidateTasks.dueAt, now),
      lte(candidateTasks.dueAt, windowEnd),
      eq(candidateTasks.archived, false),
      ne(candidateTasks.status, 'done'),
      ne(candidateTasks.status, 'canceled'),
      inArray(candidates.status, ['active', 'on_hold'])
    ))
    .orderBy(candidateTasks.dueAt)
    .limit(limit);
  return rows as ScanTaskRow[];
}
