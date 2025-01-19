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
ALTER TABLE "email_sessions" ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Allow service role full access to email_sessions" ON "email_sessions";
DROP POLICY IF EXISTS "Allow users to read their own sessions" ON "email_sessions";
DROP POLICY IF EXISTS "Allow users to update their own sessions" ON "email_sessions";
DROP POLICY IF EXISTS "Allow users to insert their own sessions" ON "email_sessions";

-- Create new policies using the safe function
CREATE POLICY "Allow service role full access to email_sessions"
ON "email_sessions"
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "Allow users to read their own sessions"
ON "email_sessions"
FOR SELECT
TO authenticated
USING (COALESCE(get_auth_uid(), '') = user_id::text);

CREATE POLICY "Allow users to update their own sessions"
ON "email_sessions"
FOR UPDATE
TO authenticated
USING (COALESCE(get_auth_uid(), '') = user_id::text)
WITH CHECK (COALESCE(get_auth_uid(), '') = user_id::text);

CREATE POLICY "Allow users to insert their own sessions"
ON "email_sessions"
FOR INSERT
TO authenticated
WITH CHECK (COALESCE(get_auth_uid(), '') = user_id::text);

-- Force RLS to be enabled
ALTER TABLE "email_sessions" FORCE ROW LEVEL SECURITY; 