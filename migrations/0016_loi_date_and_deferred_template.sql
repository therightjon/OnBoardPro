-- Migration: Add Letter of Intent Date and Deferred Template Application
-- This migration adds support for:
-- 1. Letter of Intent date (required at candidate creation, immutable)
-- 2. Deferred template application (template selected at creation, applied on LOO acceptance)

-- 1) Add letter_of_intent_date column to candidates table
ALTER TABLE candidates
ADD COLUMN IF NOT EXISTS letter_of_intent_date DATE;

-- 2) Create indexes for efficient querying by hiring phase
CREATE INDEX IF NOT EXISTS idx_candidates_loi_date ON candidates(letter_of_intent_date);

-- 3) Backfill existing candidates: set LOI date to created_at date
-- (Per user request - Option 2)
UPDATE candidates
SET letter_of_intent_date = DATE(created_at)
WHERE letter_of_intent_date IS NULL;

-- 4) Add comment documenting the column purpose
COMMENT ON COLUMN candidates.letter_of_intent_date IS 'Date the Letter of Intent was issued. Required at creation, immutable after.';

-- 5) Document the deferred template application behavior
-- When templateAppliedFromId is set but templateAppliedAt is NULL:
--   This indicates the template is "selected but not yet applied"
--   Template will be expanded when offerLetterAcceptedAt is set
COMMENT ON COLUMN candidates.template_applied_from_id IS 'FK to templates table. When set with template_applied_at=NULL, indicates template is selected but deferred until LOO acceptance.';
COMMENT ON COLUMN candidates.template_applied_at IS 'Timestamp when template was expanded into tasks. NULL indicates template is selected but not yet applied.';
