-- Add rate limiting columns to smtp_settings
ALTER TABLE smtp_settings
  ADD COLUMN rate_limit_per_minute integer NOT NULL DEFAULT 30,
  ADD COLUMN rate_limit_per_hour integer NOT NULL DEFAULT 500;
