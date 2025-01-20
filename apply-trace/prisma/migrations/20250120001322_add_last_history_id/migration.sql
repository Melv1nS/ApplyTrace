/*
  Warnings:

  - You are about to drop the column `last_history_id` on the `email_sessions` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "email_sessions" DROP COLUMN "last_history_id";
