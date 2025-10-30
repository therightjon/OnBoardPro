DO $$ BEGIN
  CREATE TYPE stage_phase AS ENUM ('pre_hire', 'onboarding');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE template_stages
  ADD COLUMN IF NOT EXISTS phase stage_phase NOT NULL DEFAULT 'pre_hire';

UPDATE template_stages ts
SET phase = hs.phase
FROM hiring_stages hs
WHERE ts.stage_id = hs.id;

ALTER TABLE template_tasks
  ADD COLUMN IF NOT EXISTS template_stage_id uuid;

UPDATE template_tasks tt
SET template_stage_id = ts.id
FROM template_stages ts
WHERE ts.template_id = tt.template_id
  AND ts.stage_id = tt.stage_id
  AND tt.template_stage_id IS NULL;

ALTER TABLE template_tasks
  ALTER COLUMN template_stage_id SET NOT NULL;

ALTER TABLE template_tasks
  ADD CONSTRAINT template_tasks_template_stage_id_fkey
  FOREIGN KEY (template_stage_id)
  REFERENCES template_stages(id)
  ON DELETE CASCADE;

ALTER TABLE candidate_tasks
  ADD COLUMN IF NOT EXISTS template_stage_id uuid;

ALTER TABLE candidate_tasks
  ADD COLUMN IF NOT EXISTS phase_snapshot stage_phase;

UPDATE candidate_tasks ct
SET template_stage_id = ts.id,
    phase_snapshot = ts.phase
FROM candidates c
JOIN template_stages ts ON ts.template_id = c.template_applied_from_id
WHERE ct.candidate_id = c.id
  AND ts.stage_id = ct.stage_id
  AND ct.template_stage_id IS NULL;

ALTER TABLE candidate_tasks
  ADD CONSTRAINT candidate_tasks_template_stage_id_fkey
  FOREIGN KEY (template_stage_id)
  REFERENCES template_stages(id)
  ON DELETE SET NULL;

ALTER TABLE hiring_stages
  DROP COLUMN IF EXISTS phase;
