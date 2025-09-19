import type { NotificationRecord } from "./types";
import type { LucideIcon } from "lucide-react";
import { Bell, MessageCircle, AtSign, ClipboardList, Flag } from "lucide-react";

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
  return undefined;
}

function getCandidateName(payload: Record<string, unknown> | null | undefined): string | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const candidate = (payload as any).candidate;
  if (candidate && typeof candidate === "object" && typeof candidate.name === "string") {
    return candidate.name;
  }
  return undefined;
}

function getTaskInfo(payload: Record<string, unknown> | null | undefined): { id?: string; title?: string; status?: string } {
  if (!payload || typeof payload !== "object") return {};
  const task = (payload as any).task;
  if (task && typeof task === "object") {
    return {
      id: typeof task.id === "string" ? task.id : undefined,
      title: typeof task.title === "string" ? task.title : undefined,
      status: typeof task.status === "string" ? task.status : undefined,
    };
  }
  return {};
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

export function mapNotificationToDisplay(notification: NotificationRecord): NotificationDisplayData {
  const payload = notification.payload ?? {};
  const actorName = getActorName(payload);
  const candidateName = getCandidateName(payload);
  const commentPreview = getCommentPreview(payload);
  const task = getTaskInfo(payload);
  const stage = getStageInfo(payload);
  const reason = getReason(payload);

  switch (notification.type) {
    case "comment.created": {
      const source = typeof (payload as any).source === "string" ? (payload as any).source : undefined;
      const link = getCandidateLink(payload);
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
      const link = getCandidateLink(payload);
      const title = actorName ? `${actorName} mentioned you` : "You were mentioned";
      return {
        title,
        body: commentPreview,
        link,
        icon: AtSign,
      };
    }
    case "task.assigned": {
      const link = task.id ? getCandidateLink(payload) ?? `/tasks/mine` : `/tasks/mine`;
      const title = task.title ? `Task "${task.title}"` : "Task update";
      if (reason === "status_change") {
        return {
          title: `${title} marked ${task.status ?? "updated"}`,
          body: candidateName ? `Candidate ${candidateName}` : undefined,
          link,
          icon: ClipboardList,
        };
      }
      return {
        title: `${title} assigned to you`,
        body: candidateName ? `Candidate ${candidateName}` : undefined,
        link,
        icon: ClipboardList,
      };
    }
    case "stage.changed": {
      const link = getCandidateLink(payload);
      const targetName = stage.toStageName ?? "a new stage";
      const title = candidateName ? `${candidateName} moved to ${targetName}` : `Stage changed to ${targetName}`;
      return {
        title,
        body: actorName ? `by ${actorName}` : undefined,
        link,
        icon: Flag,
      };
    }
    default: {
      return {
        title: notification.type,
        body: commentPreview,
        link: getCandidateLink(payload),
        icon: Bell,
      };
    }
  }
}
