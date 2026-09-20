-- AlterTable
ALTER TABLE "Customer" ADD COLUMN "photo" TEXT;

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN "blocked" BOOLEAN NOT NULL DEFAULT false;