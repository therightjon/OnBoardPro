-- Migration: Add Template Prerequisites Support
-- This migration adds support for:
-- 1. Template tasks that expand immediately on candidate creation (prerequisites)
-- 2. LOI-based due date rules for prerequisite tasks
-- 3. Prerequisite condition evaluation (requires P&T approval, always apply)
-- 4. Tracking of prerequisite expansion separately from main template expansion

-- 1) Create prerequisite_condition enum
DO $$ BEGIN
  CREATE TYPE prerequisite_condition AS ENUM ('requires_pt', 'always');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 2) Add LOI-based due rule types to due_rule_type enum
ALTER TYPE due_rule_type ADD VALUE IF NOT EXISTS 'on_loi_date';
ALTER TYPE due_rule_type ADD VALUE IF NOT EXISTS 'days_before_loi';
ALTER TYPE due_rule_type ADD VALUE IF NOT EXISTS 'days_after_loi';

-- 3) Add prerequisite fields to template_tasks table
ALTER TABLE template_tasks
ADD COLUMN IF NOT EXISTS is_prerequisite BOOLEAN DEFAULT false NOT NULL,
ADD COLUMN IF NOT EXISTS prerequisite_condition prerequisite_condition;

-- 4) Add prerequisite expansion tracking to candidates table
ALTER TABLE candidates
ADD COLUMN IF NOT EXISTS template_prerequisites_expanded_at TIMESTAMP;

-- 5) Add prerequisite task flag to candidate_tasks table
ALTER TABLE candidate_tasks
ADD COLUMN IF NOT EXISTS is_prerequisite_task BOOLEAN DEFAULT false NOT NULL;

-- 6) Add requiresPT flag to faculty_ranks table
ALTER TABLE faculty_ranks
ADD COLUMN IF NOT EXISTS requires_pt BOOLEAN DEFAULT false NOT NULL;

-- 7) Create indexes for efficient prerequisite queries
CREATE INDEX IF NOT EXISTS idx_template_tasks_prerequisites
ON template_tasks(template_id, is_prerequisite)
WHERE is_prerequisite = true;

CREATE INDEX IF NOT EXISTS idx_candidate_tasks_prerequisite
ON candidate_tasks(candidate_id, is_prerequisite_task);

CREATE INDEX IF NOT EXISTS idx_candidates_prereq_expanded
ON candidates(template_prerequisites_expanded_at)
WHERE template_prerequisites_expanded_at IS NOT NULL;

-- 8) Add comments documenting the new columns
COMMENT ON COLUMN template_tasks.is_prerequisite IS
  'If true, this task expands immediately on candidate creation (not on LOO acceptance)';

COMMENT ON COLUMN template_tasks.prerequisite_condition IS
  'Condition that must be met for prerequisite task to be created. Options: requires_pt (Associate Professor+), always (all candidates)';

COMMENT ON COLUMN candidates.template_prerequisites_expanded_at IS
  'Timestamp when prerequisite tasks were created for this candidate';

COMMENT ON COLUMN candidate_tasks.is_prerequisite_task IS
  'If true, this task was created from a template prerequisite (expanded on candidate creation)';

COMMENT ON COLUMN faculty_ranks.requires_pt IS
  'If true, this faculty rank requires Promotion & Tenure approval before LOO can be issued';

-- 9) Update existing faculty ranks that require P&T approval
-- This is based on common academic ranks that typically require P&T approval
UPDATE faculty_ranks
SET requires_pt = true
WHERE LOWER(name) IN (
  'associate professor',
  'professor',
  'distinguished professor',
  'endowed professor',
  'full professor'
)
AND requires_pt = false;
