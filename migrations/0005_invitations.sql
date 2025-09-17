-- Invitations to support invite-only onboarding and LDAP provisioning
CREATE EXTENSION IF NOT EXISTS citext;

CREATE TABLE IF NOT EXISTS invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email citext NOT NULL,
  username citext NOT NULL,
  roles text[] NOT NULL,
  token text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  invited_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS invitations_email_unique ON invitations (lower(email));
CREATE UNIQUE INDEX IF NOT EXISTS invitations_token_unique ON invitations (token);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'invitations_email_has_at'
  ) THEN
    ALTER TABLE invitations
      ADD CONSTRAINT invitations_email_has_at
      CHECK (position('@' IN email) > 1);
  END IF;
END $$;
