-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Set default UUID for id column
ALTER TABLE "job_applications" ALTER COLUMN "id" SET DEFAULT uuid_generate_v4();

-- Function to safely get auth.uid() or null
CREATE OR REPLACE FUNCTION get_auth_uid() 
RETURNS text AS $$
BEGIN
    IF EXISTS (
        SELECT 1 
        FROM information_schema.schemata 
        WHERE schema_name = 'auth'
    ) THEN
        -- Return auth.uid() if auth schema exists
        RETURN current_setting('request.jwt.claim.sub', true);
    ELSE
        -- Return null if auth schema doesn't exist
        RETURN null;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Enable RLS on the table
ALTER TABLE "job_applications" ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Allow service role full access to job_applications" ON "job_applications";
DROP POLICY IF EXISTS "Allow users to read their own applications" ON "job_applications";
DROP POLICY IF EXISTS "Allow users to update their own applications" ON "job_applications";
DROP POLICY IF EXISTS "Allow users to insert their own applications" ON "job_applications";

-- Create policies
CREATE POLICY "Allow service role full access to job_applications"
ON "job_applications"
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "Allow users to read their own applications"
ON "job_applications"
FOR SELECT
TO authenticated
USING (COALESCE(get_auth_uid(), '') = user_id);

CREATE POLICY "Allow users to update their own applications"
ON "job_applications"
FOR UPDATE
TO authenticated
USING (COALESCE(get_auth_uid(), '') = user_id)
WITH CHECK (COALESCE(get_auth_uid(), '') = user_id);

CREATE POLICY "Allow users to insert their own applications"
ON "job_applications"
FOR INSERT
TO authenticated
WITH CHECK (COALESCE(get_auth_uid(), '') = user_id);

-- Grant necessary permissions
GRANT ALL ON "job_applications" TO service_role;
GRANT SELECT, INSERT, UPDATE ON "job_applications" TO authenticated;

-- Force RLS to be enabled
ALTER TABLE "job_applications" FORCE ROW LEVEL SECURITY; 