-- Repair migration for environments that missed 0025_smtp_rate_limits.sql.
-- Safe to run on databases where the columns already exist.
ALTER TABLE smtp_settings
  ADD COLUMN IF NOT EXISTS rate_limit_per_minute integer NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS rate_limit_per_hour integer NOT NULL DEFAULT 500;
