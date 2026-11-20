-- Remove email OTP verification and enable normal one-to-one messaging.
--
-- Every account created while OTP was mandatory but never verified is promoted
-- to ACTIVE before the PENDING_VERIFICATION enum value disappears: those members
-- can now sign in and use the platform with the password they already chose.
UPDATE "User" SET "status" = 'ACTIVE' WHERE "status" = 'PENDING_VERIFICATION';

-- AlterEnum: AccountStatus no longer has PENDING_VERIFICATION.
BEGIN;
CREATE TYPE "AccountStatus_new" AS ENUM ('ACTIVE', 'SUSPENDED', 'DEACTIVATED');
ALTER TABLE "public"."User" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "User" ALTER COLUMN "status" TYPE "AccountStatus_new" USING ("status"::text::"AccountStatus_new");
ALTER TYPE "AccountStatus" RENAME TO "AccountStatus_old";
ALTER TYPE "AccountStatus_new" RENAME TO "AccountStatus";
DROP TYPE "public"."AccountStatus_old";
ALTER TABLE "User" ALTER COLUMN "status" SET DEFAULT 'ACTIVE';
COMMIT;

-- AlterEnum: email verification is no longer a reason to mint a token.
-- Any outstanding verification token is retired by the column drop below; the
-- password-reset purpose stays untouched.
DELETE FROM "AuthToken" WHERE "purpose" = 'EMAIL_VERIFICATION';
BEGIN;
CREATE TYPE "AuthTokenPurpose_new" AS ENUM ('PASSWORD_RESET');
ALTER TABLE "AuthToken" ALTER COLUMN "purpose" TYPE "AuthTokenPurpose_new" USING ("purpose"::text::"AuthTokenPurpose_new");
ALTER TYPE "AuthTokenPurpose" RENAME TO "AuthTokenPurpose_old";
ALTER TYPE "AuthTokenPurpose_new" RENAME TO "AuthTokenPurpose";
DROP TYPE "public"."AuthTokenPurpose_old";
COMMIT;

-- DropForeignKey
ALTER TABLE "OtpCode" DROP CONSTRAINT "OtpCode_userId_fkey";

-- DropTable
DROP TABLE "OtpCode";

-- DropEnum
DROP TYPE "OtpPurpose";

-- AlterTable: OTP state leaves the account; presence state joins it.
ALTER TABLE "User" DROP COLUMN "emailVerifiedAt",
ADD COLUMN     "lastSeenAt" TIMESTAMP(3),
ALTER COLUMN "status" SET DEFAULT 'ACTIVE';

-- AlterTable: delivery/read receipts and sender-side deletion.
ALTER TABLE "Message" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "deliveredAt" TIMESTAMP(3),
ADD COLUMN     "readAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Message_conversationId_readAt_idx" ON "Message"("conversationId", "readAt");
