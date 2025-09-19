DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'mention_key'
  ) THEN
    ALTER TABLE users ADD COLUMN mention_key text;
  END IF;
END $$;

-- Populate mention keys for existing users while ensuring uniqueness
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'mention_key'
  ) THEN
    WITH base AS (
      SELECT
        id,
        COALESCE(
          NULLIF(lower(regexp_replace(username, '[^a-z0-9]+', '.', 'g')), ''),
          NULLIF(lower(regexp_replace(first_name || '.' || last_name, '[^a-z0-9]+', '.', 'g')), ''),
          'user'
        ) AS base_key
      FROM users
    ),
    numbered AS (
      SELECT
        id,
        base_key,
        ROW_NUMBER() OVER (PARTITION BY base_key ORDER BY id) AS occurrence
      FROM base
    ),
    resolved AS (
      SELECT
        id,
        CASE
          WHEN occurrence = 1 THEN base_key
          ELSE base_key || '.' || occurrence::text
        END AS mention_key
      FROM numbered
    )
    UPDATE users u
    SET mention_key = resolved.mention_key
    FROM resolved
    WHERE u.id = resolved.id AND u.mention_key IS NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'mention_key'
  ) THEN
    ALTER TABLE users
      ALTER COLUMN mention_key SET NOT NULL;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS users_mention_key_unique
  ON users (mention_key);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'candidates' AND column_name = 'primary_owner_id'
  ) THEN
    ALTER TABLE candidates ADD COLUMN primary_owner_id uuid REFERENCES users(id);
    UPDATE candidates SET primary_owner_id = manager_id WHERE primary_owner_id IS NULL AND manager_id IS NOT NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS candidates_primary_owner_idx
  ON candidates (primary_owner_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_preferences' AND column_name = 'allow_self_notifications'
  ) THEN
    ALTER TABLE user_preferences ADD COLUMN allow_self_notifications boolean;
    UPDATE user_preferences SET allow_self_notifications = false WHERE allow_self_notifications IS NULL;
    ALTER TABLE user_preferences ALTER COLUMN allow_self_notifications SET DEFAULT false;
    ALTER TABLE user_preferences ALTER COLUMN allow_self_notifications SET NOT NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'mention_key'
  ) THEN
    RAISE NOTICE 'mention_key column missing, skipping index creation';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS candidate_followers (
  candidate_id uuid NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (candidate_id, user_id)
);

CREATE INDEX IF NOT EXISTS candidate_followers_user_idx
  ON candidate_followers (user_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'notification_entity'
  ) THEN
    CREATE TYPE notification_entity AS ENUM ('candidate', 'task', 'comment');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type text NOT NULL,
  entity_type notification_entity NOT NULL,
  entity_id uuid NOT NULL,
  payload jsonb NOT NULL,
  is_read boolean NOT NULL DEFAULT false,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  delivered_channels text[] NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS notifications_user_read_created_idx
  ON notifications (user_id, is_read, created_at DESC);

-- migrate:down
DROP INDEX IF EXISTS notifications_user_read_created_idx;
DROP TABLE IF EXISTS notifications;
DROP TYPE IF EXISTS notification_entity;
DROP INDEX IF EXISTS candidate_followers_user_idx;
DROP TABLE IF EXISTS candidate_followers;
DROP INDEX IF EXISTS candidates_primary_owner_idx;
ALTER TABLE candidates DROP COLUMN IF EXISTS primary_owner_id;
DROP INDEX IF EXISTS users_mention_key_unique;
ALTER TABLE users DROP COLUMN IF EXISTS mention_key;
ALTER TABLE user_preferences DROP COLUMN IF EXISTS allow_self_notifications;
