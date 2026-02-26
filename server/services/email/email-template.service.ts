/**
 * Email Template Service
 *
 * Business logic for managing editable email templates.
 * Handles sanitization, variable validation, resolution, and preview rendering.
 */

import sanitizeHtml from "sanitize-html";
import { buildAppUrl } from "../../features/email/../../utils/app-url";
import { EmailTemplateRepository } from "../../repositories/email/EmailTemplateRepository";
import {
  type EmailTemplate,
  type EmailTemplateType,
  type UpdateEmailTemplateInput,
  TEMPLATE_VARIABLES,
  VARIABLES_BY_TEMPLATE_TYPE,
  EMAIL_TEMPLATE_TYPES,
  EMAIL_TEMPLATE_LABELS,
} from "@shared/schemas";

// ============================================================================
// Sanitization config — allow safe HTML tags for email rendering
// ============================================================================

const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    "p", "br", "hr", "strong", "b", "em", "i", "u", "s",
    "h1", "h2", "h3", "h4", "h5", "h6",
    "ul", "ol", "li",
    "a", "img",
    "div", "span",
    "table", "thead", "tbody", "tr", "th", "td",
    "blockquote", "pre", "code"
  ],
  allowedAttributes: {
    a: ["href", "target", "rel", "title"],
    img: ["src", "alt", "width", "height", "style"],
    td: ["style", "align", "valign", "width"],
    th: ["style", "align", "valign", "width"],
    table: ["style", "width", "cellpadding", "cellspacing", "border"],
    div: ["style", "align"],
    span: ["style"],
    p: ["style"],
    h1: ["style"], h2: ["style"], h3: ["style"],
    h4: ["style"], h5: ["style"], h6: ["style"],
  },
  allowedSchemes: ["http", "https", "mailto"],
  // Strip script tags and event handlers
  disallowedTagsMode: "discard",
};

// ============================================================================
// Sample data for preview rendering
// ============================================================================

const SAMPLE_DATA: Record<string, string> = {
  candidate_name: "Jane Smith",
  candidate_first_name: "Jane",
  candidate_last_name: "Smith",
  task_title: "Complete Background Check",
  task_due_date: "March 15, 2026",
  was_overdue: " (was overdue)",
  actor_name: "John Manager",
  stage_name: "Onboarding",
  template_name: "Standard Onboarding",
  tasks_created_count: "12",
  comment_preview: "Looks great, let's proceed with the next steps.",
  app_name: "OnBoardPro",
  notification_link: "#",
  notifications_url: "#",
  digest_frequency: "daily",
  digest_items: '<ul><li>Task "Complete Background Check" was completed. <a href="#">View</a></li><li>Jane Smith moved to Onboarding. <a href="#">View</a></li></ul>',
};

// ============================================================================
// Email HTML wrapper for professional email rendering
// ============================================================================

function wrapEmailHtml(bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>OnBoardPro</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;">
<tr><td align="center" style="padding:24px 16px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
<tr><td style="background-color:#1e293b;padding:20px 24px;text-align:center;">
<span style="color:#ffffff;font-size:18px;font-weight:600;">OnBoardPro</span>
</td></tr>
<tr><td style="padding:24px;color:#1e293b;font-size:14px;line-height:1.6;">
${bodyHtml}
</td></tr>
<tr><td style="padding:16px 24px;background-color:#f8fafc;text-align:center;font-size:12px;color:#64748b;border-top:1px solid #e2e8f0;">
Sent by OnBoardPro
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

// ============================================================================
// Service class
// ============================================================================

export class EmailTemplateService {
  constructor(private readonly repo: EmailTemplateRepository) {}

  /**
   * Get all templates with their metadata
   */
  async getAllTemplates(): Promise<(EmailTemplate & { label: string })[]> {
    const templates = await this.repo.getAll();
    return templates.map((t) => ({
      ...t,
      label: EMAIL_TEMPLATE_LABELS[t.notificationType as EmailTemplateType] ?? t.notificationType,
    }));
  }

  /**
   * Get a single template by type, with its available variables
   */
  async getTemplate(type: EmailTemplateType) {
    const template = await this.repo.getByType(type);
    if (!template) {
      return null;
    }
    const availableVarNames = VARIABLES_BY_TEMPLATE_TYPE[type] ?? [];
    const availableVariables = TEMPLATE_VARIABLES.filter((v) =>
      availableVarNames.includes(v.name)
    );
    return {
      ...template,
      label: EMAIL_TEMPLATE_LABELS[type] ?? type,
      availableVariables,
    };
  }

  /**
   * Update a template — sanitize HTML, validate variables, persist
   */
  async updateTemplate(
    type: EmailTemplateType,
    input: UpdateEmailTemplateInput,
    updatedBy: string
  ): Promise<EmailTemplate> {
    // Sanitize body HTML
    const sanitizedBody = sanitizeHtml(input.bodyTemplate, SANITIZE_OPTIONS);

    // Validate that only approved variables are used
    this.validateVariables(type, input.subjectTemplate);
    this.validateVariables(type, sanitizedBody);

    const updated = await this.repo.upsert(type, {
      subjectTemplate: input.subjectTemplate,
      bodyTemplate: sanitizedBody,
      updatedBy,
    });

    return updated;
  }

  /**
   * Reset a template to its factory default (re-seed from migration defaults)
   */
  async resetTemplate(type: EmailTemplateType, updatedBy: string): Promise<EmailTemplate> {
    const defaults = getDefaultTemplate(type);
    const updated = await this.repo.upsert(type, {
      subjectTemplate: defaults.subject,
      bodyTemplate: defaults.body,
      updatedBy,
    });
    return updated;
  }

  /**
   * Render a preview with sample data
   */
  renderPreview(
    type: EmailTemplateType,
    subjectTemplate?: string,
    bodyTemplate?: string
  ): { subject: string; html: string } {
    const resolvedSubject = this.resolveVariables(
      subjectTemplate ?? "",
      SAMPLE_DATA
    );
    const resolvedBody = this.resolveVariables(
      bodyTemplate ?? "",
      SAMPLE_DATA
    );
    return {
      subject: resolvedSubject,
      html: wrapEmailHtml(resolvedBody),
    };
  }

  /**
   * Resolve {{variable}} placeholders in a template string using payload data
   */
  resolveVariables(template: string, variables: Record<string, string>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (match, varName) => {
      return variables[varName] ?? match;
    });
  }

  /**
   * Build variable map from notification payload for a given template type
   */
  buildVariableMap(
    type: EmailTemplateType,
    payload: Record<string, any>,
    notificationId: string
  ): Record<string, string> {
    const candidate = payload?.candidate;
    const task = payload?.task;
    const actor = payload?.actor;
    const stage = payload?.stage;

    const candidateName = candidate?.name
      ?? [candidate?.firstName, candidate?.lastName].filter(Boolean).join(" ")
      ?? "Candidate";

    const vars: Record<string, string> = {
      candidate_name: candidateName,
      candidate_first_name: candidate?.firstName ?? "",
      candidate_last_name: candidate?.lastName ?? "",
      task_title: task?.title ?? "Task",
      task_due_date: task?.dueAt ? new Date(task.dueAt).toLocaleDateString() : "",
      was_overdue: payload?.wasOverdue ? " (was overdue)" : "",
      actor_name: actor?.name ?? "",
      stage_name: stage?.toStageName ?? "",
      template_name: payload?.templateName ?? "",
      tasks_created_count: payload?.tasksCreated != null ? String(payload.tasksCreated) : "",
      comment_preview: payload?.comment?.preview ?? "",
      app_name: "OnBoardPro",
      notification_link: buildAppUrl(`/notifications?focus=${notificationId}`),
      notifications_url: buildAppUrl("/notifications"),
    };

    return vars;
  }

  /**
   * Render a full email from a DB template + notification payload.
   * Returns { subject, text, html } ready for nodemailer.
   */
  renderFromTemplate(
    template: EmailTemplate,
    payload: Record<string, any>,
    notificationId: string
  ): { subject: string; text: string; html: string } {
    const vars = this.buildVariableMap(
      template.notificationType as EmailTemplateType,
      payload,
      notificationId
    );

    const subject = this.resolveVariables(template.subjectTemplate, vars);
    const bodyHtml = this.resolveVariables(template.bodyTemplate, vars);
    const html = wrapEmailHtml(bodyHtml);

    // Generate plain text by stripping HTML tags
    const text = bodyHtml.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();

    return { subject, text, html };
  }

  /**
   * Render a digest email from the digest template + individual item summaries.
   */
  renderDigestFromTemplate(
    digestTemplate: EmailTemplate,
    frequency: string,
    itemSummaries: { summary: string; link: string }[]
  ): { subject: string; text: string; html: string } {
    const listItems = itemSummaries
      .map((entry) => `<li>${entry.summary} <a href="${entry.link}">View</a></li>`)
      .join("");
    const digestItemsHtml = `<ul>${listItems}</ul>`;

    const frequencyLabel = frequency.charAt(0).toUpperCase() + frequency.slice(1);

    const vars: Record<string, string> = {
      digest_frequency: frequencyLabel.toLowerCase(),
      digest_items: digestItemsHtml,
      app_name: "OnBoardPro",
      notifications_url: buildAppUrl("/notifications"),
    };

    const subject = this.resolveVariables(digestTemplate.subjectTemplate, vars);
    const bodyHtml = this.resolveVariables(digestTemplate.bodyTemplate, vars);
    const html = wrapEmailHtml(bodyHtml);

    const textLines = itemSummaries.map(
      (entry, idx) => `${idx + 1}. ${entry.summary}\n   ${entry.link}`
    );
    const text = `${frequencyLabel} digest\n\n${textLines.join("\n")}\n`;

    return { subject, text, html };
  }

  /**
   * Validate that only approved variables are used in a template string.
   * Throws if unknown variables are found.
   */
  private validateVariables(type: EmailTemplateType, template: string): void {
    const allowed = new Set(VARIABLES_BY_TEMPLATE_TYPE[type] ?? []);
    const used = new Set<string>();
    const regex = /\{\{(\w+)\}\}/g;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(template)) !== null) {
      used.add(match[1]);
    }

    const unknown = [...used].filter((v) => !allowed.has(v));
    if (unknown.length > 0) {
      throw new Error(
        `Unknown template variables for "${type}": ${unknown.map((v) => `{{${v}}}`).join(", ")}. ` +
        `Allowed variables: ${[...allowed].map((v) => `{{${v}}}`).join(", ")}`
      );
    }
  }
}

// ============================================================================
// Factory default templates (matches migration seed data)
// ============================================================================

interface DefaultTemplate {
  subject: string;
  body: string;
}

const DEFAULT_TEMPLATES: Record<string, DefaultTemplate> = {
  "comment.created": {
    subject: "[OnBoardPro] New comment on {{candidate_name}}",
    body: '<p>{{actor_name}} added a comment on {{candidate_name}}: {{comment_preview}}</p><p><a href="{{notification_link}}">View in OnBoardPro</a></p>',
  },
  "mention": {
    subject: "[OnBoardPro] You were mentioned",
    body: '<p>{{actor_name}} mentioned you in a comment on {{candidate_name}}.</p><p><a href="{{notification_link}}">View in OnBoardPro</a></p>',
  },
  "task.created": {
    subject: "[OnBoardPro] Task assigned: {{task_title}}",
    body: '<p>{{actor_name}} assigned the task "{{task_title}}".</p><p><a href="{{notification_link}}">View in OnBoardPro</a></p>',
  },
  "task.assigned": {
    subject: "[OnBoardPro] Task assigned: {{task_title}}",
    body: '<p>{{actor_name}} assigned the task "{{task_title}}".</p><p><a href="{{notification_link}}">View in OnBoardPro</a></p>',
  },
  "task.completed": {
    subject: "[OnBoardPro] Task completed: {{task_title}}",
    body: '<p>Task "{{task_title}}" for {{candidate_name}} was completed{{was_overdue}}.</p><p><a href="{{notification_link}}">View in OnBoardPro</a></p>',
  },
  "task.due_soon": {
    subject: "[OnBoardPro] Task due soon: {{task_title}}",
    body: '<p>The task "{{task_title}}" is coming due soon.</p><p><a href="{{notification_link}}">View in OnBoardPro</a></p>',
  },
  "task.overdue": {
    subject: "[OnBoardPro] Task overdue: {{task_title}}",
    body: '<p>The task "{{task_title}}" is overdue. Please review.</p><p><a href="{{notification_link}}">View in OnBoardPro</a></p>',
  },
  "stage.changed": {
    subject: "[OnBoardPro] Stage update for {{candidate_name}}",
    body: '<p>{{candidate_name}} moved to {{stage_name}}.</p><p><a href="{{notification_link}}">View in OnBoardPro</a></p>',
  },
  "candidate.template_applied": {
    subject: "[OnBoardPro] Template applied to {{candidate_name}}",
    body: '<p>Template "{{template_name}}" was applied to {{candidate_name}}.</p><p><a href="{{notification_link}}">View in OnBoardPro</a></p>',
  },
  "candidate.owner_changed": {
    subject: "[OnBoardPro] Ownership update for {{candidate_name}}",
    body: '<p>Ownership for {{candidate_name}} has changed.</p><p><a href="{{notification_link}}">View in OnBoardPro</a></p>',
  },
  "digest": {
    subject: "[OnBoardPro] Your {{digest_frequency}} notifications",
    body: '<p>Your {{digest_frequency}} digest is ready. Here are your recent notifications:</p>{{digest_items}}<p><a href="{{notifications_url}}">Open notifications</a></p>',
  },
};

function getDefaultTemplate(type: EmailTemplateType): DefaultTemplate {
  return DEFAULT_TEMPLATES[type] ?? {
    subject: "[OnBoardPro] New notification",
    body: '<p>You have a new notification in OnBoardPro.</p><p><a href="{{notification_link}}">View in OnBoardPro</a></p>',
  };
}
