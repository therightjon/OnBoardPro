-- Migration: Add LOO Issued vs LOO Accepted Due Rule Types
-- Date: 2025-12-18
-- Description: Adds six new due rule types to distinguish between LOO issued and LOO accepted milestones

-- Add new LOO accepted-based rule types
ALTER TYPE due_rule_type ADD VALUE IF NOT EXISTS 'on_loo_accepted_date';
ALTER TYPE due_rule_type ADD VALUE IF NOT EXISTS 'days_before_loo_accepted';
ALTER TYPE due_rule_type ADD VALUE IF NOT EXISTS 'days_after_loo_accepted';

-- Add new LOO issued-based rule types
ALTER TYPE due_rule_type ADD VALUE IF NOT EXISTS 'on_loo_issued_date';
ALTER TYPE due_rule_type ADD VALUE IF NOT EXISTS 'days_before_loo_issued';
ALTER TYPE due_rule_type ADD VALUE IF NOT EXISTS 'days_after_loo_issued';

-- Note: Existing generic LOO rules (on_loo_date, days_before_loo, days_after_loo)
-- remain unchanged and continue to use the fallback mechanism (accepted → issued)
