-- Add unique constraint to email_id
ALTER TABLE "job_applications" ADD CONSTRAINT "job_applications_email_id_unique" UNIQUE ("email_id");

-- Clean up any existing duplicates before adding the constraint
-- Keep the first entry for each email_id
WITH duplicates AS (
  SELECT id, email_id,
    ROW_NUMBER() OVER (PARTITION BY email_id ORDER BY applied_date) as rn
  FROM "job_applications"
  WHERE email_id IS NOT NULL
)
DELETE FROM "job_applications"
WHERE id IN (
  SELECT id 
  FROM duplicates 
  WHERE rn > 1
); 