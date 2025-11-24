ALTER TABLE "candidates"
ADD COLUMN IF NOT EXISTS "status_before_archive" "candidate_status";
