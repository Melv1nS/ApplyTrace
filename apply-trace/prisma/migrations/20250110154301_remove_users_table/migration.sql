/*
  Warnings:

  - You are about to drop the `users` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "job_applications" DROP CONSTRAINT "job_applications_user_id_fkey";

-- DropTable
DROP TABLE "users";
