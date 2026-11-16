-- CreateEnum
CREATE TYPE "MediaType" AS ENUM ('IMAGE', 'VIDEO');

-- CreateEnum
CREATE TYPE "MediaVisibility" AS ENUM ('PRIVATE', 'PUBLIC');

-- CreateEnum
CREATE TYPE "CompressionStatus" AS ENUM ('PENDING', 'PROCESSING', 'OPTIMIZED', 'SKIPPED', 'FAILED');

-- CreateEnum
CREATE TYPE "ProcessingStatus" AS ENUM ('PENDING', 'PROCESSING', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "UploadStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED', 'ABORTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "AiRole" AS ENUM ('USER', 'ASSISTANT', 'SYSTEM');

-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "attachmentMediaId" UUID;

-- CreateTable
CREATE TABLE "MediaAsset" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "mediaType" "MediaType" NOT NULL,
    "bucket" TEXT NOT NULL,
    "originalFileName" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "originalStoragePath" TEXT,
    "thumbnailPath" TEXT,
    "originalSizeBytes" BIGINT NOT NULL,
    "storedSizeBytes" BIGINT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "originalMimeType" TEXT NOT NULL,
    "fileExtension" TEXT NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "durationSeconds" DOUBLE PRECISION,
    "frameRate" DOUBLE PRECISION,
    "bitRate" INTEGER,
    "checksumSha256" TEXT,
    "compressionStatus" "CompressionStatus" NOT NULL DEFAULT 'PENDING',
    "processingStatus" "ProcessingStatus" NOT NULL DEFAULT 'PENDING',
    "visibility" "MediaVisibility" NOT NULL DEFAULT 'PRIVATE',
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaUploadSession" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "clientUploadId" TEXT NOT NULL,
    "mediaType" "MediaType" NOT NULL,
    "bucket" TEXT NOT NULL,
    "originalFileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "totalBytes" BIGINT NOT NULL,
    "receivedBytes" BIGINT NOT NULL DEFAULT 0,
    "chunkCount" INTEGER NOT NULL DEFAULT 0,
    "status" "UploadStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "storagePath" TEXT,
    "assetId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MediaUploadSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Favorite" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "favoriteUserId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Favorite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiConversation" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'New conversation',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiMessage" (
    "id" UUID NOT NULL,
    "conversationId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "role" "AiRole" NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MediaAsset_userId_createdAt_idx" ON "MediaAsset"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "MediaAsset_userId_mediaType_idx" ON "MediaAsset"("userId", "mediaType");

-- CreateIndex
CREATE INDEX "MediaAsset_processingStatus_idx" ON "MediaAsset"("processingStatus");

-- CreateIndex
CREATE INDEX "MediaUploadSession_userId_status_idx" ON "MediaUploadSession"("userId", "status");

-- CreateIndex
CREATE INDEX "MediaUploadSession_expiresAt_idx" ON "MediaUploadSession"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "MediaUploadSession_userId_clientUploadId_key" ON "MediaUploadSession"("userId", "clientUploadId");

-- CreateIndex
CREATE INDEX "Favorite_userId_createdAt_idx" ON "Favorite"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Favorite_favoriteUserId_idx" ON "Favorite"("favoriteUserId");

-- CreateIndex
CREATE UNIQUE INDEX "Favorite_userId_favoriteUserId_key" ON "Favorite"("userId", "favoriteUserId");

-- CreateIndex
CREATE INDEX "AiConversation_userId_updatedAt_idx" ON "AiConversation"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "AiMessage_conversationId_createdAt_idx" ON "AiMessage"("conversationId", "createdAt");

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_attachmentMediaId_fkey" FOREIGN KEY ("attachmentMediaId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaUploadSession" ADD CONSTRAINT "MediaUploadSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Favorite" ADD CONSTRAINT "Favorite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Favorite" ADD CONSTRAINT "Favorite_favoriteUserId_fkey" FOREIGN KEY ("favoriteUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiConversation" ADD CONSTRAINT "AiConversation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiMessage" ADD CONSTRAINT "AiMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "AiConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiMessage" ADD CONSTRAINT "AiMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Database-level integrity for the media / favourites / AI tables, matching the
-- style of the earlier integrity_constraints migration. These cannot be
-- expressed in the Prisma schema.
-- ---------------------------------------------------------------------------

-- Nobody may favourite themselves.
ALTER TABLE "Favorite" ADD CONSTRAINT "Favorite_no_self" CHECK ("userId" <> "favoriteUserId");

-- Recorded sizes are never negative.
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_sizes_non_negative"
  CHECK ("originalSizeBytes" >= 0 AND "storedSizeBytes" >= 0);

-- A stored object must not be larger than the original it was derived from,
-- except for video, where the stored object *is* the original.
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_stored_not_larger"
  CHECK ("mediaType" = 'VIDEO' OR "storedSizeBytes" <= "originalSizeBytes");

-- Dimensions and media measurements, when present, must be sane.
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_dimensions_positive"
  CHECK (("width" IS NULL OR "width" > 0) AND ("height" IS NULL OR "height" > 0));
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_duration_non_negative"
  CHECK ("durationSeconds" IS NULL OR "durationSeconds" >= 0);
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_bitrate_non_negative"
  CHECK ("bitRate" IS NULL OR "bitRate" >= 0);

-- A video always carries a checksum so integrity can be re-verified later.
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_video_checksum"
  CHECK ("mediaType" <> 'VIDEO' OR "checksumSha256" IS NOT NULL);

-- Resumable-upload accounting can never exceed the declared total.
ALTER TABLE "MediaUploadSession" ADD CONSTRAINT "MediaUploadSession_byte_accounting"
  CHECK ("totalBytes" > 0 AND "receivedBytes" >= 0 AND "receivedBytes" <= "totalBytes" AND "chunkCount" >= 0);

-- AI messages must have content.
ALTER TABLE "AiMessage" ADD CONSTRAINT "AiMessage_content_not_blank" CHECK (length(btrim("content")) > 0);
