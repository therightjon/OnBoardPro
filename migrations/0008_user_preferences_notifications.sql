DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_preferences' AND column_name = 'notify_in_app'
  ) THEN
    ALTER TABLE user_preferences ADD COLUMN notify_in_app boolean;
    UPDATE user_preferences SET notify_in_app = true WHERE notify_in_app IS NULL;
    ALTER TABLE user_preferences ALTER COLUMN notify_in_app SET DEFAULT true;
    ALTER TABLE user_preferences ALTER COLUMN notify_in_app SET NOT NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_preferences' AND column_name = 'notify_email'
  ) THEN
    ALTER TABLE user_preferences ADD COLUMN notify_email boolean;
    UPDATE user_preferences SET notify_email = false WHERE notify_email IS NULL;
    ALTER TABLE user_preferences ALTER COLUMN notify_email SET DEFAULT false;
    ALTER TABLE user_preferences ALTER COLUMN notify_email SET NOT NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_preferences' AND column_name = 'digest_frequency'
  ) THEN
    ALTER TABLE user_preferences ADD COLUMN digest_frequency text;
    UPDATE user_preferences SET digest_frequency = 'immediate' WHERE digest_frequency IS NULL;
    ALTER TABLE user_preferences ALTER COLUMN digest_frequency SET DEFAULT 'immediate';
    ALTER TABLE user_preferences ALTER COLUMN digest_frequency SET NOT NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'user_preferences_digest_frequency_check'
      AND conrelid = 'user_preferences'::regclass
  ) THEN
    ALTER TABLE user_preferences
      ADD CONSTRAINT user_preferences_digest_frequency_check
      CHECK (digest_frequency IN ('immediate', 'hourly', 'daily'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_preferences' AND column_name = 'quiet_hours_start'
  ) THEN
    ALTER TABLE user_preferences ADD COLUMN quiet_hours_start time;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_preferences' AND column_name = 'quiet_hours_end'
  ) THEN
    ALTER TABLE user_preferences ADD COLUMN quiet_hours_end time;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_preferences' AND column_name = 'event_subscriptions'
  ) THEN
    ALTER TABLE user_preferences ADD COLUMN event_subscriptions jsonb;
    UPDATE user_preferences SET event_subscriptions = '{}'::jsonb WHERE event_subscriptions IS NULL;
    ALTER TABLE user_preferences ALTER COLUMN event_subscriptions SET DEFAULT '{}'::jsonb;
    ALTER TABLE user_preferences ALTER COLUMN event_subscriptions SET NOT NULL;
  END IF;
END $$;

-- migrate:down
ALTER TABLE user_preferences
  DROP CONSTRAINT IF EXISTS user_preferences_digest_frequency_check;

ALTER TABLE user_preferences
  DROP COLUMN IF EXISTS event_subscriptions,
  DROP COLUMN IF EXISTS quiet_hours_end,
  DROP COLUMN IF EXISTS quiet_hours_start,
  DROP COLUMN IF EXISTS digest_frequency,
  DROP COLUMN IF EXISTS notify_email,
  DROP COLUMN IF EXISTS notify_in_app;
