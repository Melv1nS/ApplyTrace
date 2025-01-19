-- Grant usage on schema
GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;

-- Grant table permissions
GRANT ALL ON TABLE "email_sessions" TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE "email_sessions" TO authenticated;
GRANT SELECT ON TABLE "email_sessions" TO anon;

-- Grant sequence permissions if any
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO service_role; 