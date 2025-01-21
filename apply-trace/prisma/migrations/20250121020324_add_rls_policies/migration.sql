-- Enable RLS on the job_applications table
ALTER TABLE "job_applications" ENABLE ROW LEVEL SECURITY;

-- Create policies for job_applications
CREATE POLICY "Enable read access for users" ON "job_applications"
    FOR SELECT
    TO authenticated
    USING (auth.uid()::text = user_id);

CREATE POLICY "Enable insert access for users" ON "job_applications"
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY "Enable update access for users" ON "job_applications"
    FOR UPDATE
    TO authenticated
    USING (auth.uid()::text = user_id)
    WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY "Enable delete access for users" ON "job_applications"
    FOR DELETE
    TO authenticated
    USING (auth.uid()::text = user_id);

-- Enable RLS on the email_sessions table
ALTER TABLE "email_sessions" ENABLE ROW LEVEL SECURITY;

-- Create policies for email_sessions
CREATE POLICY "Enable read access for users" ON "email_sessions"
    FOR SELECT
    TO authenticated
    USING (auth.uid()::text = user_id);

CREATE POLICY "Enable insert access for users" ON "email_sessions"
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY "Enable update access for users" ON "email_sessions"
    FOR UPDATE
    TO authenticated
    USING (auth.uid()::text = user_id)
    WITH CHECK (auth.uid()::text = user_id); 