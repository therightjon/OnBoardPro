import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  boolean,
  timestamp,
  uniqueIndex
} from "drizzle-orm/pg-core";
import { users } from "./auth.schema";
import { z } from "zod";

/**
 * All notification types that have email templates.
 * "digest" is a special meta-type for the digest wrapper layout.
 */
export const EMAIL_TEMPLATE_TYPES = [
  "comment.created",
  "mention",
  "task.created",
  "task.assigned",
  "task.completed",
  "task.due_soon",
  "task.overdue",
  "stage.changed",
  "candidate.template_applied",
  "candidate.owner_changed",
  "digest"
] as const;

export type EmailTemplateType = typeof EMAIL_TEMPLATE_TYPES[number];

/** Human-readable labels for each template type */
export const EMAIL_TEMPLATE_LABELS: Record<EmailTemplateType, string> = {
  "comment.created": "Comment Created",
  "mention": "Mention",
  "task.created": "Task Created",
  "task.assigned": "Task Assigned",
  "task.completed": "Task Completed",
  "task.due_soon": "Task Due Soon",
  "task.overdue": "Task Overdue",
  "stage.changed": "Stage Changed",
  "candidate.template_applied": "Template Applied",
  "candidate.owner_changed": "Ownership Changed",
  "digest": "Digest Summary"
};

// Email templates table
export const emailTemplates = pgTable("email_templates", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  notificationType: text("notification_type").notNull(),
  subjectTemplate: text("subject_template").notNull(),
  bodyTemplate: text("body_template").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
}, (t) => ({
  notificationTypeUniqueIdx: uniqueIndex("email_templates_notification_type_unique").on(t.notificationType)
}));

// Type exports
export type EmailTemplate = typeof emailTemplates.$inferSelect;
export type InsertEmailTemplate = typeof emailTemplates.$inferInsert;

// ============================================================================
// Template variable definitions — grouped by category
// ============================================================================

export interface TemplateVariable {
  name: string;
  label: string;
  description: string;
  category: string;
}

export const TEMPLATE_VARIABLE_CATEGORIES = [
  "Candidate",
  "Task",
  "Actor",
  "Stage",
  "Template",
  "Comment",
  "System",
  "Digest"
] as const;

export const TEMPLATE_VARIABLES: TemplateVariable[] = [
  // Candidate
  { name: "candidate_name", label: "Candidate Name", description: "Full name of the candidate", category: "Candidate" },
  { name: "candidate_first_name", label: "First Name", description: "Candidate's first name", category: "Candidate" },
  { name: "candidate_last_name", label: "Last Name", description: "Candidate's last name", category: "Candidate" },
  // Task
  { name: "task_title", label: "Task Title", description: "Title of the task", category: "Task" },
  { name: "task_due_date", label: "Due Date", description: "Task due date", category: "Task" },
  { name: "was_overdue", label: "Was Overdue", description: "Whether the task was overdue when completed", category: "Task" },
  // Actor
  { name: "actor_name", label: "Actor Name", description: "Name of the person who performed the action", category: "Actor" },
  // Stage
  { name: "stage_name", label: "Stage Name", description: "Name of the new/target stage", category: "Stage" },
  // Template
  { name: "template_name", label: "Template Name", description: "Name of the applied template", category: "Template" },
  { name: "tasks_created_count", label: "Tasks Created", description: "Number of tasks created from template", category: "Template" },
  // Comment
  { name: "comment_preview", label: "Comment Preview", description: "Preview text of the comment", category: "Comment" },
  // System
  { name: "app_name", label: "App Name", description: "Application name (OnBoardPro)", category: "System" },
  { name: "notification_link", label: "Notification Link", description: "Direct link to the notification", category: "System" },
  { name: "notifications_url", label: "Notifications URL", description: "Link to the notifications page", category: "System" },
  // Digest
  { name: "digest_frequency", label: "Digest Frequency", description: "Frequency label (Hourly, Daily)", category: "Digest" },
  { name: "digest_items", label: "Digest Items", description: "Rendered list of notification summaries", category: "Digest" },
];

/** Map of notification type → which variables are relevant */
export const VARIABLES_BY_TEMPLATE_TYPE: Record<EmailTemplateType, string[]> = {
  "comment.created": ["candidate_name", "candidate_first_name", "candidate_last_name", "actor_name", "comment_preview", "app_name", "notification_link"],
  "mention": ["candidate_name", "candidate_first_name", "candidate_last_name", "actor_name", "comment_preview", "app_name", "notification_link"],
  "task.created": ["task_title", "task_due_date", "actor_name", "candidate_name", "app_name", "notification_link"],
  "task.assigned": ["task_title", "task_due_date", "actor_name", "candidate_name", "app_name", "notification_link"],
  "task.completed": ["task_title", "candidate_name", "candidate_first_name", "candidate_last_name", "actor_name", "was_overdue", "app_name", "notification_link"],
  "task.due_soon": ["task_title", "task_due_date", "candidate_name", "app_name", "notification_link"],
  "task.overdue": ["task_title", "task_due_date", "candidate_name", "app_name", "notification_link"],
  "stage.changed": ["candidate_name", "candidate_first_name", "candidate_last_name", "stage_name", "actor_name", "app_name", "notification_link"],
  "candidate.template_applied": ["candidate_name", "candidate_first_name", "candidate_last_name", "template_name", "tasks_created_count", "actor_name", "app_name", "notification_link"],
  "candidate.owner_changed": ["candidate_name", "candidate_first_name", "candidate_last_name", "actor_name", "app_name", "notification_link"],
  "digest": ["digest_frequency", "digest_items", "app_name", "notifications_url"],
};

// ============================================================================
// Zod validation schemas
// ============================================================================

export const updateEmailTemplateSchema = z.object({
  subjectTemplate: z.string().min(1, "Subject is required").max(500, "Subject too long"),
  bodyTemplate: z.string().min(1, "Body is required").max(50000, "Body too long"),
  isActive: z.boolean().optional(),
});

export type UpdateEmailTemplateInput = z.infer<typeof updateEmailTemplateSchema>;

export const previewEmailTemplateSchema = z.object({
  subjectTemplate: z.string().optional(),
  bodyTemplate: z.string().optional(),
});
