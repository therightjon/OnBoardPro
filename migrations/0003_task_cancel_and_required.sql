-- Add cancel_reason and updated_by to candidate_tasks
ALTER TABLE candidate_tasks
  ADD COLUMN IF NOT EXISTS cancel_reason text,
  ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES users(id);

-- Add is_required to template_tasks
ALTER TABLE template_tasks
  ADD COLUMN IF NOT EXISTS is_required boolean NOT NULL DEFAULT false;

-- Create audit_log table
CREATE TABLE IF NOT EXISTS audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  actor_id uuid REFERENCES users(id),
  candidate_id uuid REFERENCES candidates(id),
  task_id uuid REFERENCES candidate_tasks(id),
  event_type text NOT NULL,
  details jsonb
);
