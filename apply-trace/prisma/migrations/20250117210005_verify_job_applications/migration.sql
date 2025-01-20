-- Verify and fix job_applications table structure
DO $$ 
BEGIN
    -- Drop the existing id default if it exists
    ALTER TABLE "job_applications" ALTER COLUMN "id" DROP DEFAULT;
    
    -- Re-create the UUID default
    ALTER TABLE "job_applications" ALTER COLUMN "id" SET DEFAULT uuid_generate_v4();
    
    -- Ensure the id column is NOT NULL
    ALTER TABLE "job_applications" ALTER COLUMN "id" SET NOT NULL;
    
    -- Ensure it's the primary key
    ALTER TABLE "job_applications" DROP CONSTRAINT IF EXISTS "job_applications_pkey";
    ALTER TABLE "job_applications" ADD PRIMARY KEY ("id");
    
EXCEPTION
    WHEN others THEN
        -- If any errors occur, log them but continue
        RAISE NOTICE 'Error occurred: %', SQLERRM;
END $$; 