-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('APPLIED', 'REJECTED', 'INTERVIEW_SCHEDULED', 'OFFER_RECEIVED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "email_sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "access_token" TEXT NOT NULL,
    "refresh_token" TEXT NOT NULL,
    "last_history_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_applications" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "company_name" TEXT NOT NULL,
    "role_title" TEXT NOT NULL,
    "applied_date" TIMESTAMP(3) NOT NULL,
    "email_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_applications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "email_sessions_email_key" ON "email_sessions"("email");

-- CreateIndex
CREATE UNIQUE INDEX "job_applications_email_id_key" ON "job_applications"("email_id");
