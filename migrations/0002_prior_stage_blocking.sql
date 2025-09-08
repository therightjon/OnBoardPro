-- Add prior-stage blocking fields to candidates
ALTER TABLE candidates
  ADD COLUMN IF NOT EXISTS is_blocked_by_prior_stage boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS blocker_summary jsonb;

-- Create system settings table for global feature toggles
CREATE TABLE IF NOT EXISTS system_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  created_at timestamp DEFAULT now() NOT NULL,
  updated_at timestamp DEFAULT now() NOT NULL
);

-- Seed default for auto_regress_on_prior_open as false if not present
INSERT INTO system_settings (key, value)
SELECT 'auto_regress_on_prior_open', jsonb_build_object('enabled', false)
WHERE NOT EXISTS (
  SELECT 1 FROM system_settings WHERE key = 'auto_regress_on_prior_open'
);
