-- Migration: Append date to archived template names
-- This migration appends the current date (MM-DD-YYYY) to all archived templates
-- to avoid naming conflicts when creating new templates with the same name.

UPDATE templates
SET
  name = name || ' ' || TO_CHAR(CURRENT_DATE, 'MM-DD-YYYY'),
  updated_at = CURRENT_TIMESTAMP
WHERE
  archived = true
  AND name NOT SIMILAR TO '% [0-9]{2}-[0-9]{2}-[0-9]{4}'; -- Only update if date not already appended
