-- Set template_tasks.is_required default to TRUE and backfill existing rows
ALTER TABLE template_tasks ALTER COLUMN is_required SET DEFAULT true;
UPDATE template_tasks SET is_required = true WHERE is_required IS NOT TRUE;

-- Backfill candidate_tasks.required to TRUE for legacy data
UPDATE candidate_tasks SET required = true WHERE required IS NOT TRUE;
