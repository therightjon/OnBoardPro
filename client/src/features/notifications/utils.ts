import { format } from "date-fns";
import type { LucideIcon } from "lucide-react";
import { Bell, MessageCircle, AtSign, ClipboardList, Flag, CheckCircle, UserRound } from "lucide-react";
import type { NotificationRecord } from "./types";

export interface NotificationDisplayData {
  title: string;
  body?: string;
  link?: string;
  icon: LucideIcon;
}

function getActorName(payload: Record<string, unknown> | null | undefined): string | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const actor = (payload as any).actor;
  if (actor && typeof actor === "object" && typeof actor.name === "string") {
    return actor.name;
  }
  return undefined;
}

function getCandidateLink(payload: Record<string, unknown> | null | undefined): string | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const candidate = (payload as any).candidate;
  if (candidate && typeof candidate === "object" && typeof candidate.id === "string") {
    return `/candidates/${candidate.id}`;
  }
  const contextCandidateId = (payload as any).contextCandidateId;
  if (typeof contextCandidateId === "string" && contextCandidateId.trim()) {
    return `/candidates/${contextCandidateId}`;
  }
  return undefined;
}

function getCandidateName(payload: Record<string, unknown> | null | undefined): string | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const candidate = (payload as any).candidate;
  if (candidate && typeof candidate === "object" && typeof candidate.name === "string") {
    return candidate.name;
  }
  const contextCandidateName = (payload as any).contextCandidateName;
  if (typeof contextCandidateName === "string" && contextCandidateName.trim()) {
    return contextCandidateName;
  }
  return undefined;
}

function getTaskInfo(payload: Record<string, unknown> | null | undefined): {
  id?: string;
  title?: string;
  status?: string;
  dueAt?: string;
  assigneeUserId?: string;
} {
  if (!payload || typeof payload !== "object") return {};
  const task = (payload as any).task;
  if (task && typeof task === "object") {
    return {
      id: typeof task.id === "string" ? task.id : undefined,
      title: typeof task.title === "string" ? task.title : undefined,
      status: typeof task.status === "string" ? task.status : undefined,
      dueAt: typeof task.dueAt === "string" ? task.dueAt : undefined,
      assigneeUserId: typeof (task as any).assigneeUserId === "string" ? (task as any).assigneeUserId : undefined,
    };
  }
  const fallbackTitle = typeof (payload as any).taskTitle === "string"
    ? (payload as any).taskTitle
    : typeof (payload as any).title === "string"
      ? (payload as any).title
      : undefined;
  return fallbackTitle ? { title: fallbackTitle } : {};
}

function getStageInfo(payload: Record<string, unknown> | null | undefined): { toStageName?: string } {
  if (!payload || typeof payload !== "object") return {};
  const stage = (payload as any).stage;
  if (stage && typeof stage === "object" && typeof stage.toStageName === "string") {
    return { toStageName: stage.toStageName };
  }
  return {};
}

function getCommentPreview(payload: Record<string, unknown> | null | undefined): string | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const comment = (payload as any).comment;
  if (comment && typeof comment === "object" && typeof comment.preview === "string") {
    return comment.preview;
  }
  return undefined;
}

function getReason(payload: Record<string, unknown> | null | undefined): string | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const reason = (payload as any).reason;
  if (typeof reason === "string") {
    return reason;
  }
  return undefined;
}

function formatTaskDueDate(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return undefined;
  }
  return format(parsed, "MMM d, yyyy");
}

function buildTaskLink(notification: NotificationRecord, payload: Record<string, unknown> | null | undefined, fallbackCandidateLink?: string): string | undefined {
  const task = getTaskInfo(payload);
  if (task.id) {
    const assignedToRecipient = task.assigneeUserId && task.assigneeUserId === notification.userId;
    if (assignedToRecipient || notification.type === "task.assigned") {
      return `/tasks/mine?taskId=${task.id}`;
    }
  }
  return fallbackCandidateLink ?? (task.id ? "/tasks/mine" : undefined);
}

function getLegacyTitle(payload: Record<string, unknown> | null | undefined): string | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const rawTitle = (payload as any).title;
  if (typeof rawTitle === "string" && rawTitle.trim()) {
    return rawTitle.trim();
  }
  return undefined;
}

function getLegacyMessage(payload: Record<string, unknown> | null | undefined): string | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const rawMessage = (payload as any).message;
  if (typeof rawMessage === "string" && rawMessage.trim()) {
    return rawMessage.trim();
  }
  return undefined;
}

export function mapNotificationToDisplay(notification: NotificationRecord): NotificationDisplayData {
  const payload = notification.payload ?? {};
  const actorName = getActorName(payload);
  const candidateName = getCandidateName(payload);
  const commentPreview = getCommentPreview(payload);
  const task = getTaskInfo(payload);
  const stage = getStageInfo(payload);
  const reason = getReason(payload);
  const candidateLink = getCandidateLink(payload);
  const legacyTitle = getLegacyTitle(payload);
  const legacyMessage = getLegacyMessage(payload);

  switch (notification.type) {
    case "comment.created": {
      const source = typeof (payload as any).source === "string" ? (payload as any).source : undefined;
      const link = candidateLink;
      const baseTitle = actorName ? `${actorName} commented` : "New comment";
      if (source === "task" && task.title) {
        return {
          title: `${baseTitle} on "${task.title}"`,
          body: commentPreview,
          link: link,
          icon: MessageCircle,
        };
      }
      return {
        title: candidateName ? `${baseTitle} on ${candidateName}` : baseTitle,
        body: commentPreview,
        link: link,
        icon: MessageCircle,
      };
    }
    case "mention": {
      const link = candidateLink;
      const title = actorName ? `${actorName} mentioned you` : "You were mentioned";
      return {
        title,
        body: commentPreview,
        link,
        icon: AtSign,
      };
    }
    case "task.assigned": {
      const link = buildTaskLink(notification, payload, candidateLink) ?? "/tasks/mine";
      const preferredTitle = task.title ?? legacyTitle;
      const title = preferredTitle ? `Task "${preferredTitle}"` : "Task update";
      if (reason === "status_change") {
        return {
          title: `${title} marked ${task.status ?? "updated"}`,
          body: legacyMessage ?? (candidateName ? `Candidate ${candidateName}` : undefined),
          link,
          icon: ClipboardList,
        };
      }
      return {
        title: `${title} assigned to you`,
        body: legacyMessage ?? (candidateName ? `Candidate ${candidateName}` : undefined),
        link,
        icon: ClipboardList,
      };
    }
    case "task.created": {
      const link = buildTaskLink(notification, payload, candidateLink) ?? candidateLink;
      const title = legacyTitle ?? (task.title ? `Task "${task.title}" created` : "Task created");
      const body = legacyMessage ?? (candidateName ? `Candidate ${candidateName}` : undefined);
      return {
        title,
        body,
        link,
        icon: ClipboardList,
      };
    }
    case "task.completed": {
      const link = buildTaskLink(notification, payload, candidateLink) ?? candidateLink;
      const title = legacyTitle ?? (task.title ? `Task "${task.title}" completed` : "Task completed");
      const body = legacyMessage ?? (candidateName ? `Candidate ${candidateName}` : undefined);
      return {
        title,
        body,
        link,
        icon: CheckCircle,
      };
    }
    case "stage.changed": {
      const link = candidateLink;
      const targetName = stage.toStageName ?? "a new stage";
      const title = candidateName ? `${candidateName} moved to ${targetName}` : `Stage changed to ${targetName}`;
      return {
        title,
        body: actorName ? `by ${actorName}` : undefined,
        link,
        icon: Flag,
      };
    }
    case "candidate.owner_changed": {
      const link = candidateLink;
      const variant = typeof (payload as any).variant === "string" ? (payload as any).variant : undefined;
      const name = candidateName ?? "Candidate";
      const title =
        variant === "former"
          ? `${name} reassigned to a new owner`
          : `You are now the owner for ${name}`;
      const body = actorName ? `Updated by ${actorName}` : undefined;
      return {
        title,
        body,
        link,
        icon: variant === "former" ? UserRound : UserRound,
      };
    }
    case "task.due_soon":
    case "task.overdue": {
      const link = buildTaskLink(notification, payload, candidateLink) ?? candidateLink ?? "/tasks/mine";
      const taskTitle = task.title ?? legacyTitle;
      const baseTitle = taskTitle ? `Task "${taskTitle}"` : "Task update";
      const statusText = notification.type === "task.due_soon" ? "due soon" : "overdue";
      const dueDate = formatTaskDueDate(task.dueAt);
      const bodyParts: string[] = [];
      const bodyCandidate = candidateName ? `Candidate ${candidateName}` : undefined;
      const bodyDue = dueDate ? `Due ${dueDate}` : undefined;
      if (bodyCandidate) bodyParts.push(bodyCandidate);
      if (bodyDue) bodyParts.push(bodyDue);
      const body = legacyMessage ?? (bodyParts.length > 0 ? bodyParts.join(" - ") : undefined);
      return {
        title: `${baseTitle} ${statusText}`,
        body,
        link,
        icon: ClipboardList,
      };
    }
    default: {
      if (legacyTitle || legacyMessage) {
        return {
          title: legacyTitle ?? notification.type,
          body: legacyMessage ?? commentPreview,
          link: candidateLink,
          icon: Bell,
        };
      }
      return {
        title: notification.type,
        body: commentPreview,
        link: candidateLink,
        icon: Bell,
      };
    }
  }
}

export interface FormattedUnreadCount {
  count: number;
  badgeText: string;
  showBadge: boolean;
  announcement: string;
}

export function formatUnreadCount(value: number | null | undefined): FormattedUnreadCount {
  const numeric = typeof value === "number" && Number.isFinite(value) ? Math.floor(value) : 0;
  const count = numeric > 0 ? numeric : 0;
  const constrained = count > 99 ? "99+" : String(count);
  const showBadge = count > 0;
  const announcement = `${count} unread notification${count === 1 ? "" : "s"}`;

  return {
    count,
    badgeText: constrained,
    showBadge,
    announcement,
  };
}
