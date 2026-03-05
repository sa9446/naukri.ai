-- AlterTable
ALTER TABLE "candidate_analyses" ADD COLUMN     "highlights" TEXT[] DEFAULT ARRAY[]::TEXT[];
