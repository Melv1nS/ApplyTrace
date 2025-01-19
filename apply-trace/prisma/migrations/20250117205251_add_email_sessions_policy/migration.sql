-- Drop the migration if it exists
DROP TABLE IF EXISTS "email_sessions";

-- Create the table
CREATE TABLE "email_sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "access_token" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_sessions_pkey" PRIMARY KEY ("id")
);

-- Create indexes
CREATE UNIQUE INDEX "email_sessions_user_id_key" ON "email_sessions"("user_id");
CREATE UNIQUE INDEX "email_sessions_email_key" ON "email_sessions"("email");
CREATE INDEX "email_sessions_user_id_idx" ON "email_sessions"("user_id");
CREATE INDEX "email_sessions_email_idx" ON "email_sessions"("email"); 