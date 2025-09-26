-- Role-based task assignments and deadline tracking

DO $$
BEGIN
  CREATE TYPE task_assignee_kind AS ENUM ('user', 'role');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Template task defaults
DO $$
BEGIN
  ALTER TABLE template_tasks RENAME COLUMN default_assignee_id TO default_assignee_user_id;
EXCEPTION
  WHEN undefined_column THEN NULL;
END $$;

ALTER TABLE template_tasks
  ADD COLUMN IF NOT EXISTS default_assignee_kind task_assignee_kind,
  ADD COLUMN IF NOT EXISTS default_assignee_role text;

UPDATE template_tasks
SET default_assignee_kind = COALESCE(default_assignee_kind, 'user')
WHERE default_assignee_kind IS NULL;

ALTER TABLE template_tasks
  ALTER COLUMN default_assignee_kind SET NOT NULL,
  ALTER COLUMN default_assignee_kind SET DEFAULT 'user';

ALTER TABLE template_tasks
  DROP CONSTRAINT IF EXISTS template_tasks_default_assignee_check;

ALTER TABLE template_tasks
  ADD CONSTRAINT template_tasks_default_assignee_check
  CHECK (
    (default_assignee_kind = 'user' AND default_assignee_role IS NULL)
    OR
    (default_assignee_kind = 'role' AND default_assignee_role IS NOT NULL AND default_assignee_user_id IS NULL)
    OR
    (default_assignee_user_id IS NULL AND default_assignee_role IS NULL)
  );

-- Candidate task assignments
DO $$
BEGIN
  ALTER TABLE candidate_tasks RENAME COLUMN assignee_id TO assignee_user_id;
EXCEPTION
  WHEN undefined_column THEN NULL;
END $$;

ALTER TABLE candidate_tasks
  ADD COLUMN IF NOT EXISTS assignee_kind task_assignee_kind,
  ADD COLUMN IF NOT EXISTS assignee_role text,
  ADD COLUMN IF NOT EXISTS assignee_resolved_at timestamptz,
  ADD COLUMN IF NOT EXISTS due_soon_notified_at timestamptz;

UPDATE candidate_tasks
SET assignee_kind = COALESCE(assignee_kind, 'user')
WHERE assignee_kind IS NULL;

ALTER TABLE candidate_tasks
  ALTER COLUMN assignee_kind SET NOT NULL,
  ALTER COLUMN assignee_kind SET DEFAULT 'user';

ALTER TABLE candidate_tasks
  DROP CONSTRAINT IF EXISTS candidate_tasks_assignee_check;

ALTER TABLE candidate_tasks
  ADD CONSTRAINT candidate_tasks_assignee_check
  CHECK (
    (assignee_kind = 'user' AND assignee_role IS NULL)
    OR
    (assignee_kind = 'role' AND assignee_role IS NOT NULL AND assignee_user_id IS NULL)
    OR
    (assignee_user_id IS NULL AND assignee_role IS NULL)
  );

-- Refresh indexes
DROP INDEX IF EXISTS idx_candidate_tasks_assignee_id;
CREATE INDEX IF NOT EXISTS idx_candidate_tasks_assignee_user_id
  ON candidate_tasks(assignee_user_id) WHERE status <> 'done';

-- Candidate linking metadata
ALTER TABLE candidates
  ADD COLUMN IF NOT EXISTS linked_user_id uuid REFERENCES users(id);

CREATE INDEX IF NOT EXISTS candidates_linked_user_idx
  ON candidates(linked_user_id);

-- Notification idempotency keys
CREATE TABLE IF NOT EXISTS notification_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS notification_keys_key_user_idx
  ON notification_keys(key, user_id);
