-- Grant usage on schema
GRANT USAGE ON SCHEMA public TO authenticated, service_role;

-- Grant access to the job_applications table
GRANT ALL ON TABLE public.job_applications TO authenticated, service_role;

-- Grant access to the email_sessions table
GRANT ALL ON TABLE public.email_sessions TO authenticated, service_role;

-- Grant usage on sequences (if any)
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role; 