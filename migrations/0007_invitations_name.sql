-- Add first and last name to invitations for pre-filling user profile
ALTER TABLE invitations
  ADD COLUMN IF NOT EXISTS first_name text;

ALTER TABLE invitations
  ADD COLUMN IF NOT EXISTS last_name text;

