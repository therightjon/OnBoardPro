import type { Notification } from "@shared/schemas";
import { buildAppUrl } from "../../utils/app-url";

type FrequencyLabel = "Hourly" | "Daily" | "Weekly";

export interface NotificationForEmail {
  id: string;
  type: Notification["type"];
  payload: Record<string, any>;
  createdAt: Date;
}

export interface EmailRenderResult {
  subject: string;
  text: string;
  html: string;
}

function getCandidateName(payload: Record<string, any> | null | undefined): string {
  const candidate = payload?.candidate;
  if (!candidate) return "Candidate";
  if (typeof candidate.name === "string" && candidate.name.trim()) {
    return candidate.name.trim();
  }
  const first = candidate.firstName ?? "";
  const last = candidate.lastName ?? "";
  const combined = `${first} ${last}`.trim();
  return combined || "Candidate";
}

function buildNotificationLink(notificationId: string): string {
  return buildAppUrl(`/notifications?focus=${notificationId}`);
}

function formatTaskTitle(payload: Record<string, any> | null | undefined): string {
  const task = payload?.task;
  if (!task) return "Task";
  if (typeof task.title === "string" && task.title.trim()) {
    return task.title.trim();
  }
  return "Task";
}

export function summarizeNotification(notification: NotificationForEmail): { subject: string; summary: string } {
  const { type, payload } = notification;
  const actorName = payload?.actor?.name;
  switch (type) {
    case "comment.created": {
      const candidateName = getCandidateName(payload);
      const preview = payload?.comment?.preview ? String(payload.comment.preview) : "A new comment was posted.";
      return {
        subject: `[OnBoardPro] New comment on ${candidateName}`,
        summary: `${actorName ? `${actorName} added a comment` : "A new comment was added"} on ${candidateName}: ${preview}`,
      };
    }
    case "mention": {
      const candidateName = getCandidateName(payload);
      return {
        subject: `[OnBoardPro] You were mentioned`,
        summary: `${actorName ? `${actorName} mentioned you` : "You were mentioned"} in a comment on ${candidateName}.`,
      };
    }
    case "task.created":
    case "task.assigned": {
      const taskTitle = formatTaskTitle(payload);
      return {
        subject: `[OnBoardPro] Task assigned: ${taskTitle}`,
        summary: `${actorName ? `${actorName} assigned` : "You were assigned"} the task "${taskTitle}".`,
      };
    }
    case "task.completed": {
      const taskTitle = formatTaskTitle(payload);
      const candidateName = getCandidateName(payload);
      const wasOverdue = payload?.wasOverdue ? " (was overdue)" : "";
      return {
        subject: `[OnBoardPro] Task completed: ${taskTitle}`,
        summary: `Task "${taskTitle}" for ${candidateName} was completed${wasOverdue}.`,
      };
    }
    case "candidate.template_applied": {
      const candidateName = getCandidateName(payload);
      const templateName = payload?.templateName ?? "a template";
      return {
        subject: `[OnBoardPro] Template applied to ${candidateName}`,
        summary: `Template "${templateName}" was applied to ${candidateName}.`,
      };
    }
    case "task.due_soon": {
      const taskTitle = formatTaskTitle(payload);
      return {
        subject: `[OnBoardPro] Task due soon: ${taskTitle}`,
        summary: `The task "${taskTitle}" is coming due soon.`,
      };
    }
    case "task.overdue": {
      const taskTitle = formatTaskTitle(payload);
      return {
        subject: `[OnBoardPro] Task overdue: ${taskTitle}`,
        summary: `The task "${taskTitle}" is overdue. Please review.`,
      };
    }
    case "stage.changed": {
      const candidateName = getCandidateName(payload);
      const toStageName = payload?.stage?.toStageName ?? "a new stage";
      return {
        subject: `[OnBoardPro] Stage update for ${candidateName}`,
        summary: `${candidateName} moved to ${toStageName}.`,
      };
    }
    case "candidate.owner_changed": {
      const candidateName = getCandidateName(payload);
      return {
        subject: `[OnBoardPro] Ownership update for ${candidateName}`,
        summary: `Ownership for ${candidateName} has changed.`,
      };
    }
    default:
      return {
        subject: `[OnBoardPro] New notification`,
        summary: `You have a new notification in OnBoardPro.`,
      };
  }
}

function toFrequencyLabel(frequency: "hourly" | "daily" | "weekly"): FrequencyLabel {
  switch (frequency) {
    case "hourly":
      return "Hourly";
    case "daily":
      return "Daily";
    default:
      return "Weekly";
  }
}

export function renderImmediateEmail(notification: NotificationForEmail): EmailRenderResult {
  const { subject, summary } = summarizeNotification(notification);
  const link = buildNotificationLink(notification.id);

  const text = `${summary}\n\nView in OnBoardPro: ${link}\n`;
  const html = [
    `<p>${summary}</p>`,
    `<p><a href="${link}">View in OnBoardPro</a></p>`
  ].join("");

  return { subject, text, html };
}

export function renderDigestEmail(
  frequency: "hourly" | "daily" | "weekly",
  items: NotificationForEmail[]
): EmailRenderResult {
  const label = toFrequencyLabel(frequency);
  const subject = `[OnBoardPro] Your ${label} notifications`;

  const summaries = items.map((item) => {
    const { summary } = summarizeNotification(item);
    const link = buildNotificationLink(item.id);
    return { summary, link };
  });

  const textLines = summaries.map((entry, idx) => `${idx + 1}. ${entry.summary}\n   ${entry.link}`);
  const text = `${label} digest\n\n${textLines.join("\n")}\n`;

  const listItems = summaries
    .map((entry) => `<li>${entry.summary} <a href="${entry.link}">View</a></li>`)
    .join("");
  const html = [
    `<p>Your ${label.toLowerCase()} digest is ready. Here are your recent notifications:</p>`,
    `<ul>${listItems}</ul>`,
    `<p><a href="${buildAppUrl("/notifications")}">Open notifications</a></p>`
  ].join("");

  return { subject, text, html };
}
