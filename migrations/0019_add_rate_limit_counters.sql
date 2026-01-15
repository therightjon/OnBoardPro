CREATE TABLE IF NOT EXISTS rate_limit_counters (
  type text NOT NULL,
  key text NOT NULL,
  count integer NOT NULL DEFAULT 0,
  reset_at timestamptz NOT NULL,
  CONSTRAINT rate_limit_counters_pkey PRIMARY KEY (type, key)
);
