-- Migration 0026: Email Templates
-- Adds editable email templates table and seeds all default templates.

CREATE TABLE IF NOT EXISTS email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_type TEXT NOT NULL,
  subject_template TEXT NOT NULL,
  body_template TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS email_templates_notification_type_unique
  ON email_templates (notification_type);

-- Seed default templates (matching current hardcoded templates in templates.ts)

INSERT INTO email_templates (notification_type, subject_template, body_template) VALUES
(
  'comment.created',
  '[OnBoardPro] New comment on {{candidate_name}}',
  '<p>{{actor_name}} added a comment on {{candidate_name}}: {{comment_preview}}</p><p><a href="{{notification_link}}">View in OnBoardPro</a></p>'
),
(
  'mention',
  '[OnBoardPro] You were mentioned',
  '<p>{{actor_name}} mentioned you in a comment on {{candidate_name}}.</p><p><a href="{{notification_link}}">View in OnBoardPro</a></p>'
),
(
  'task.created',
  '[OnBoardPro] Task assigned: {{task_title}}',
  '<p>{{actor_name}} assigned the task "{{task_title}}".</p><p><a href="{{notification_link}}">View in OnBoardPro</a></p>'
),
(
  'task.assigned',
  '[OnBoardPro] Task assigned: {{task_title}}',
  '<p>{{actor_name}} assigned the task "{{task_title}}".</p><p><a href="{{notification_link}}">View in OnBoardPro</a></p>'
),
(
  'task.completed',
  '[OnBoardPro] Task completed: {{task_title}}',
  '<p>Task "{{task_title}}" for {{candidate_name}} was completed{{was_overdue}}.</p><p><a href="{{notification_link}}">View in OnBoardPro</a></p>'
),
(
  'task.due_soon',
  '[OnBoardPro] Task due soon: {{task_title}}',
  '<p>The task "{{task_title}}" is coming due soon.</p><p><a href="{{notification_link}}">View in OnBoardPro</a></p>'
),
(
  'task.overdue',
  '[OnBoardPro] Task overdue: {{task_title}}',
  '<p>The task "{{task_title}}" is overdue. Please review.</p><p><a href="{{notification_link}}">View in OnBoardPro</a></p>'
),
(
  'stage.changed',
  '[OnBoardPro] Stage update for {{candidate_name}}',
  '<p>{{candidate_name}} moved to {{stage_name}}.</p><p><a href="{{notification_link}}">View in OnBoardPro</a></p>'
),
(
  'candidate.template_applied',
  '[OnBoardPro] Template applied to {{candidate_name}}',
  '<p>Template "{{template_name}}" was applied to {{candidate_name}}.</p><p><a href="{{notification_link}}">View in OnBoardPro</a></p>'
),
(
  'candidate.owner_changed',
  '[OnBoardPro] Ownership update for {{candidate_name}}',
  '<p>Ownership for {{candidate_name}} has changed.</p><p><a href="{{notification_link}}">View in OnBoardPro</a></p>'
),
(
  'digest',
  '[OnBoardPro] Your {{digest_frequency}} notifications',
  '<p>Your {{digest_frequency}} digest is ready. Here are your recent notifications:</p>{{digest_items}}<p><a href="{{notifications_url}}">Open notifications</a></p>'
)
ON CONFLICT (notification_type) DO NOTHING;
