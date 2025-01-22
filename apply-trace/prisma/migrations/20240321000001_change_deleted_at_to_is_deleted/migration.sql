-- Rename deleted_at to is_deleted and change type to boolean
ALTER TABLE "job_applications" 
  DROP COLUMN IF EXISTS "deleted_at",
  ADD COLUMN "is_deleted" BOOLEAN NOT NULL DEFAULT false; 