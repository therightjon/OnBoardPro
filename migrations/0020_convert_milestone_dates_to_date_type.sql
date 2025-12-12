-- Migration: Convert milestone date fields from TIMESTAMP to DATE
-- This migration ensures all user-facing milestone dates are stored as DATE type
-- without time components, avoiding timezone conversion issues.
--
-- Changes:
-- 1. offer_letter_issued_at: TIMESTAMP → DATE
-- 2. offer_letter_accepted_at: TIMESTAMP → DATE
-- 3. anticipated_start_date: TIMESTAMP → DATE
--
-- Note: System timestamps (created_at, updated_at, template_applied_at, etc.)
-- remain as TIMESTAMP since they need time precision.

-- 1) Convert offer_letter_issued_at from TIMESTAMP to DATE
-- Extract just the date part, discarding time and timezone info
ALTER TABLE candidates
ALTER COLUMN offer_letter_issued_at TYPE DATE USING DATE(offer_letter_issued_at);

-- 2) Convert offer_letter_accepted_at from TIMESTAMP to DATE
ALTER TABLE candidates
ALTER COLUMN offer_letter_accepted_at TYPE DATE USING DATE(offer_letter_accepted_at);

-- 3) Convert anticipated_start_date from TIMESTAMP to DATE
ALTER TABLE candidates
ALTER COLUMN anticipated_start_date TYPE DATE USING DATE(anticipated_start_date);

-- 4) Add comments documenting the columns
COMMENT ON COLUMN candidates.offer_letter_issued_at IS 'Date the Letter of Offer was issued to the candidate. DATE type (no time component).';
COMMENT ON COLUMN candidates.offer_letter_accepted_at IS 'Date the candidate accepted the Letter of Offer. DATE type (no time component).';
COMMENT ON COLUMN candidates.anticipated_start_date IS 'Anticipated start date for the candidate. DATE type (no time component).';
