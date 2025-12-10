-- Extend audit_log to support CRUD auditing
ALTER TABLE audit_log
  ADD COLUMN IF NOT EXISTS resource_type text,
  ADD COLUMN IF NOT EXISTS resource_id text,
  ADD COLUMN IF NOT EXISTS action text;

-- Helpful indexes for filtering
CREATE INDEX IF NOT EXISTS audit_log_resource_idx ON audit_log (resource_type, resource_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_actor_idx ON audit_log (actor_id, occurred_at DESC);
