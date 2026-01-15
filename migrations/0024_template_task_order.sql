-- Migration: Add order_index to template_tasks
-- Purpose: Enable drag-and-drop reordering of tasks within stages
-- Date: 2025-12-23

BEGIN;

-- Add order_index column with default 0
ALTER TABLE template_tasks
ADD COLUMN order_index INTEGER NOT NULL DEFAULT 0;

-- Set initial order_index values based on created_at ordering within each stage
-- This preserves existing task order for each stage
WITH ordered_tasks AS (
  SELECT 
    id,
    ROW_NUMBER() OVER (
      PARTITION BY template_stage_id 
      ORDER BY created_at ASC
    ) - 1 AS new_order_index
  FROM template_tasks
  WHERE archived = false
)
UPDATE template_tasks
SET order_index = ordered_tasks.new_order_index
FROM ordered_tasks
WHERE template_tasks.id = ordered_tasks.id;

-- Add index for efficient ordering queries
CREATE INDEX idx_template_tasks_stage_order ON template_tasks(template_stage_id, order_index) WHERE archived = false;

COMMIT;
