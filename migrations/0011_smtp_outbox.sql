DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'smtp_security') THEN
    CREATE TYPE smtp_security AS ENUM ('none', 'starttls', 'ssl_tls');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'smtp_auth_type') THEN
    CREATE TYPE smtp_auth_type AS ENUM ('none', 'plain', 'login', 'cram_md5', 'xoauth2');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS smtp_settings (
  id text PRIMARY KEY DEFAULT 'primary',
  enabled boolean NOT NULL DEFAULT false,
  hostname text,
  port integer,
  security smtp_security NOT NULL DEFAULT 'none',
  auth_type smtp_auth_type NOT NULL DEFAULT 'none',
  username text,
  encrypted_password jsonb,
  encryption_version text,
  password_set_at timestamptz,
  from_name text,
  from_email text,
  allow_header_spoofing boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO smtp_settings (id)
VALUES ('primary')
ON CONFLICT (id) DO NOTHING;

CREATE TABLE notification_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id uuid NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending',
  retry_count integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  digest_candidate boolean NOT NULL DEFAULT false,
  last_error text,
  delivered_at timestamptz
);

CREATE INDEX notification_outbox_status_next_attempt_idx
  ON notification_outbox (status, next_attempt_at);

CREATE UNIQUE INDEX notification_outbox_notification_unique
  ON notification_outbox (notification_id);
