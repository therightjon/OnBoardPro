DO $$ BEGIN
  CREATE TYPE stage_phase AS ENUM ('pre_hire', 'onboarding');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE hiring_stages
  ADD COLUMN IF NOT EXISTS phase stage_phase NOT NULL DEFAULT 'pre_hire';

ALTER TABLE candidates RENAME COLUMN start_date TO anticipated_start_date;
ALTER TABLE candidates
  ALTER COLUMN anticipated_start_date TYPE timestamptz USING anticipated_start_date::timestamptz,
  ALTER COLUMN anticipated_start_date DROP NOT NULL;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS offer_letter_issued_at timestamptz;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS offer_letter_accepted_at timestamptz;

DO $$ BEGIN
  ALTER TYPE due_rule_type ADD VALUE 'on_loo_date';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TYPE due_rule_type ADD VALUE 'days_before_loo';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TYPE due_rule_type ADD VALUE 'days_after_loo';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE candidate_tasks ADD COLUMN IF NOT EXISTS due_rule_type due_rule_type;
ALTER TABLE candidate_tasks ADD COLUMN IF NOT EXISTS due_rule_value integer;
ALTER TABLE candidate_tasks ADD COLUMN IF NOT EXISTS fixed_date date;
ALTER TABLE candidate_tasks ADD COLUMN IF NOT EXISTS pending_anchor boolean NOT NULL DEFAULT false;
