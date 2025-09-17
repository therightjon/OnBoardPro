-- Add department/division to invitations for org context capture
ALTER TABLE invitations
  ADD COLUMN IF NOT EXISTS department_id uuid REFERENCES departments(id);

ALTER TABLE invitations
  ADD COLUMN IF NOT EXISTS division_id uuid REFERENCES divisions(id);

