-- Create the publication if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication
    WHERE pubname = 'supabase_realtime'
  ) THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
END
$$;

-- Enable replication for real-time
ALTER PUBLICATION supabase_realtime ADD TABLE job_applications;

-- Add policy for real-time subscriptions
CREATE POLICY "Enable real-time for users" ON job_applications
    FOR SELECT TO authenticated
    USING (get_auth_uid() = user_id);

-- Enable replica identity for real-time updates
ALTER TABLE job_applications REPLICA IDENTITY FULL; 