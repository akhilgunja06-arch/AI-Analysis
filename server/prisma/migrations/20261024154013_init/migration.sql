-- CreateEnum
CREATE TYPE "Role" AS ENUM ('MEMBER', 'MODERATOR', 'ADMIN');

-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('PENDING_VERIFICATION', 'ACTIVE', 'SUSPENDED', 'DEACTIVATED');

-- CreateEnum
CREATE TYPE "SkillDirection" AS ENUM ('TEACH', 'LEARN');

-- CreateEnum
CREATE TYPE "SkillLevel" AS ENUM ('BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'EXPERT');

-- CreateEnum
CREATE TYPE "SessionFormat" AS ENUM ('ONLINE', 'IN_PERSON', 'EITHER');

-- CreateEnum
CREATE TYPE "ExchangeStatus" AS ENUM ('PENDING', 'COUNTERED', 'ACCEPTED', 'ACTIVE', 'PAUSED', 'COMPLETED', 'DECLINED', 'WITHDRAWN', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ExchangeRole" AS ENUM ('INITIATOR', 'RECIPIENT');

-- CreateEnum
CREATE TYPE "ParticipantStatus" AS ENUM ('INVITED', 'AGREED', 'COMPLETED', 'LEFT');

-- CreateEnum
CREATE TYPE "MilestoneStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'DONE');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('SCHEDULED', 'COMPLETED', 'CANCELLED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('EXCHANGE_REQUEST', 'EXCHANGE_ACCEPTED', 'EXCHANGE_DECLINED', 'EXCHANGE_COUNTERED', 'EXCHANGE_ACTIVE', 'EXCHANGE_COMPLETED', 'EXCHANGE_CANCELLED', 'SESSION_SCHEDULED', 'SESSION_UPDATED', 'SESSION_CANCELLED', 'SESSION_REMINDER', 'MESSAGE', 'REVIEW_RECEIVED', 'FOLLOW', 'COMMUNITY_REPLY', 'MODERATION', 'SYSTEM');

-- CreateEnum
CREATE TYPE "ReportTargetType" AS ENUM ('USER', 'MESSAGE', 'REVIEW', 'COMMUNITY_POST', 'COMMUNITY_COMMENT');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('OPEN', 'UNDER_REVIEW', 'RESOLVED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "ReportReason" AS ENUM ('SPAM', 'HARASSMENT', 'INAPPROPRIATE_CONTENT', 'FAKE_PROFILE', 'NO_SHOW', 'OTHER');

-- CreateEnum
CREATE TYPE "ModerationAction" AS ENUM ('NONE', 'CONTENT_HIDDEN', 'CONTENT_REMOVED', 'WARNING_ISSUED', 'USER_SUSPENDED', 'USER_REINSTATED', 'REPORT_DISMISSED');

-- CreateEnum
CREATE TYPE "PostStatus" AS ENUM ('PUBLISHED', 'HIDDEN', 'REMOVED');

-- CreateEnum
CREATE TYPE "AuthTokenPurpose" AS ENUM ('EMAIL_VERIFICATION', 'PASSWORD_RESET');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'MEMBER',
    "status" "AccountStatus" NOT NULL DEFAULT 'PENDING_VERIFICATION',
    "emailVerifiedAt" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "deactivatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Profile" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "displayName" TEXT NOT NULL,
    "headline" TEXT,
    "bio" TEXT,
    "avatarUrl" TEXT,
    "location" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "languages" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "websiteUrl" TEXT,
    "githubUrl" TEXT,
    "linkedinUrl" TEXT,
    "preferredFormat" "SessionFormat" NOT NULL DEFAULT 'ONLINE',
    "learningGoals" TEXT,
    "weeklyAvailabilityHours" INTEGER,
    "onboardingCompletedAt" TIMESTAMP(3),
    "onboardingStep" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Profile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserPreference" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "publicProfile" BOOLEAN NOT NULL DEFAULT true,
    "showEmail" BOOLEAN NOT NULL DEFAULT false,
    "showLocation" BOOLEAN NOT NULL DEFAULT true,
    "showLanguages" BOOLEAN NOT NULL DEFAULT true,
    "showAvailability" BOOLEAN NOT NULL DEFAULT true,
    "showCompletedExchanges" BOOLEAN NOT NULL DEFAULT true,
    "allowExchangeRequests" BOOLEAN NOT NULL DEFAULT true,
    "allowMessagesFrom" TEXT NOT NULL DEFAULT 'MEMBERS',
    "emailOnExchange" BOOLEAN NOT NULL DEFAULT true,
    "emailOnMessage" BOOLEAN NOT NULL DEFAULT false,
    "emailOnSession" BOOLEAN NOT NULL DEFAULT true,
    "emailOnReview" BOOLEAN NOT NULL DEFAULT true,
    "emailOnCommunity" BOOLEAN NOT NULL DEFAULT false,
    "inAppOnEverything" BOOLEAN NOT NULL DEFAULT true,
    "weeklyDigest" BOOLEAN NOT NULL DEFAULT true,
    "reducedMotion" BOOLEAN NOT NULL DEFAULT false,
    "theme" TEXT NOT NULL DEFAULT 'system',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthSession" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "refreshTokenHash" TEXT NOT NULL,
    "userAgent" TEXT,
    "ipAddress" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuthSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthToken" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "purpose" "AuthTokenPurpose" NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuthToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SkillCategory" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "icon" TEXT,
    "color" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SkillCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Skill" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "categoryId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Skill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserSkill" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "skillId" UUID NOT NULL,
    "direction" "SkillDirection" NOT NULL,
    "level" "SkillLevel" NOT NULL DEFAULT 'INTERMEDIATE',
    "description" TEXT,
    "outcomes" TEXT,
    "portfolioUrl" TEXT,
    "yearsExperience" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserSkill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Availability" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "weekday" INTEGER NOT NULL,
    "startMinute" INTEGER NOT NULL,
    "endMinute" INTEGER NOT NULL,
    "format" "SessionFormat" NOT NULL DEFAULT 'ONLINE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Availability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExchangeRequest" (
    "id" UUID NOT NULL,
    "initiatorId" UUID NOT NULL,
    "recipientId" UUID NOT NULL,
    "offeredSkillId" UUID,
    "requestedSkillId" UUID,
    "message" TEXT,
    "goals" TEXT,
    "sessionMinutes" INTEGER NOT NULL DEFAULT 60,
    "sessionsPerWeek" INTEGER NOT NULL DEFAULT 1,
    "totalSessions" INTEGER NOT NULL DEFAULT 6,
    "preferredFormat" "SessionFormat" NOT NULL DEFAULT 'ONLINE',
    "status" "ExchangeStatus" NOT NULL DEFAULT 'PENDING',
    "parentRequestId" UUID,
    "respondedAt" TIMESTAMP(3),
    "exchangeId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExchangeRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Exchange" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "createdById" UUID NOT NULL,
    "status" "ExchangeStatus" NOT NULL DEFAULT 'ACTIVE',
    "goals" TEXT,
    "sessionMinutes" INTEGER NOT NULL DEFAULT 60,
    "totalSessions" INTEGER NOT NULL DEFAULT 6,
    "preferredFormat" "SessionFormat" NOT NULL DEFAULT 'ONLINE',
    "creditValue" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "pausedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancellationReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Exchange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExchangeParticipant" (
    "id" UUID NOT NULL,
    "exchangeId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "role" "ExchangeRole" NOT NULL DEFAULT 'INITIATOR',
    "status" "ParticipantStatus" NOT NULL DEFAULT 'INVITED',
    "teachesSkillId" UUID,
    "learnsSkillId" UUID,
    "agreedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExchangeParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Milestone" (
    "id" UUID NOT NULL,
    "exchangeId" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "MilestoneStatus" NOT NULL DEFAULT 'PENDING',
    "dueAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Milestone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" UUID NOT NULL,
    "exchangeId" UUID NOT NULL,
    "hostId" UUID NOT NULL,
    "title" TEXT,
    "agenda" TEXT,
    "notes" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "format" "SessionFormat" NOT NULL DEFAULT 'ONLINE',
    "meetingUrl" TEXT,
    "location" TEXT,
    "status" "SessionStatus" NOT NULL DEFAULT 'SCHEDULED',
    "reminderSentAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelledById" UUID,
    "cancellationReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExchangeEvent" (
    "id" UUID NOT NULL,
    "exchangeId" UUID NOT NULL,
    "actorId" UUID,
    "type" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExchangeEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conversation" (
    "id" UUID NOT NULL,
    "directKey" TEXT,
    "isGroup" BOOLEAN NOT NULL DEFAULT false,
    "title" TEXT,
    "exchangeId" UUID,
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConversationParticipant" (
    "id" UUID NOT NULL,
    "conversationId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "lastReadAt" TIMESTAMP(3),
    "muted" BOOLEAN NOT NULL DEFAULT false,
    "blocked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConversationParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" UUID NOT NULL,
    "conversationId" UUID NOT NULL,
    "senderId" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "attachmentUrl" TEXT,
    "attachmentName" TEXT,
    "attachmentType" TEXT,
    "hiddenAt" TIMESTAMP(3),
    "hiddenById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "link" TEXT,
    "metadata" JSONB,
    "readAt" TIMESTAMP(3),
    "emailedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Review" (
    "id" UUID NOT NULL,
    "exchangeId" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "subjectId" UUID NOT NULL,
    "rating" INTEGER NOT NULL,
    "teachingRating" INTEGER,
    "communicationRating" INTEGER,
    "reliabilityRating" INTEGER,
    "comment" TEXT,
    "hiddenAt" TIMESTAMP(3),
    "hiddenById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Follow" (
    "id" UUID NOT NULL,
    "followerId" UUID NOT NULL,
    "followingId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Follow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommunityPost" (
    "id" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "categoryId" UUID,
    "skillId" UUID,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "postType" TEXT NOT NULL DEFAULT 'DISCUSSION',
    "resourceUrl" TEXT,
    "status" "PostStatus" NOT NULL DEFAULT 'PUBLISHED',
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "commentCount" INTEGER NOT NULL DEFAULT 0,
    "voteCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommunityPost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommunityComment" (
    "id" UUID NOT NULL,
    "postId" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "parentId" UUID,
    "body" TEXT NOT NULL,
    "isAnswer" BOOLEAN NOT NULL DEFAULT false,
    "voteCount" INTEGER NOT NULL DEFAULT 0,
    "status" "PostStatus" NOT NULL DEFAULT 'PUBLISHED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommunityComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommunityPostVote" (
    "id" UUID NOT NULL,
    "postId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommunityPostVote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommunityCommentVote" (
    "id" UUID NOT NULL,
    "commentId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommunityCommentVote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Report" (
    "id" UUID NOT NULL,
    "reporterId" UUID NOT NULL,
    "targetType" "ReportTargetType" NOT NULL,
    "targetUserId" UUID,
    "targetId" UUID,
    "reason" "ReportReason" NOT NULL,
    "details" TEXT,
    "status" "ReportStatus" NOT NULL DEFAULT 'OPEN',
    "resolutionNote" TEXT,
    "actionTaken" "ModerationAction" NOT NULL DEFAULT 'NONE',
    "handledById" UUID,
    "handledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserBlock" (
    "id" UUID NOT NULL,
    "blockerId" UUID NOT NULL,
    "blockedId" UUID NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserBlock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" UUID NOT NULL,
    "actorId" UUID,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "summary" TEXT NOT NULL,
    "metadata" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportTicket" (
    "id" UUID NOT NULL,
    "userId" UUID,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupportTicket_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE INDEX "User_status_idx" ON "User"("status");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE INDEX "User_createdAt_idx" ON "User"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Profile_userId_key" ON "Profile"("userId");

-- CreateIndex
CREATE INDEX "Profile_location_idx" ON "Profile"("location");

-- CreateIndex
CREATE INDEX "Profile_timezone_idx" ON "Profile"("timezone");

-- CreateIndex
CREATE UNIQUE INDEX "UserPreference_userId_key" ON "UserPreference"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "AuthSession_refreshTokenHash_key" ON "AuthSession"("refreshTokenHash");

-- CreateIndex
CREATE INDEX "AuthSession_userId_idx" ON "AuthSession"("userId");

-- CreateIndex
CREATE INDEX "AuthSession_expiresAt_idx" ON "AuthSession"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "AuthToken_tokenHash_key" ON "AuthToken"("tokenHash");

-- CreateIndex
CREATE INDEX "AuthToken_userId_purpose_idx" ON "AuthToken"("userId", "purpose");

-- CreateIndex
CREATE UNIQUE INDEX "SkillCategory_slug_key" ON "SkillCategory"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "SkillCategory_name_key" ON "SkillCategory"("name");

-- CreateIndex
CREATE INDEX "SkillCategory_sortOrder_idx" ON "SkillCategory"("sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "Skill_slug_key" ON "Skill"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Skill_name_key" ON "Skill"("name");

-- CreateIndex
CREATE INDEX "Skill_categoryId_idx" ON "Skill"("categoryId");

-- CreateIndex
CREATE INDEX "Skill_name_idx" ON "Skill"("name");

-- CreateIndex
CREATE INDEX "UserSkill_skillId_direction_isActive_idx" ON "UserSkill"("skillId", "direction", "isActive");

-- CreateIndex
CREATE INDEX "UserSkill_userId_direction_idx" ON "UserSkill"("userId", "direction");

-- CreateIndex
CREATE UNIQUE INDEX "UserSkill_userId_skillId_direction_key" ON "UserSkill"("userId", "skillId", "direction");

-- CreateIndex
CREATE INDEX "Availability_userId_weekday_idx" ON "Availability"("userId", "weekday");

-- CreateIndex
CREATE INDEX "ExchangeRequest_recipientId_status_idx" ON "ExchangeRequest"("recipientId", "status");

-- CreateIndex
CREATE INDEX "ExchangeRequest_initiatorId_status_idx" ON "ExchangeRequest"("initiatorId", "status");

-- CreateIndex
CREATE INDEX "ExchangeRequest_createdAt_idx" ON "ExchangeRequest"("createdAt");

-- CreateIndex
CREATE INDEX "Exchange_status_idx" ON "Exchange"("status");

-- CreateIndex
CREATE INDEX "Exchange_createdAt_idx" ON "Exchange"("createdAt");

-- CreateIndex
CREATE INDEX "ExchangeParticipant_userId_status_idx" ON "ExchangeParticipant"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ExchangeParticipant_exchangeId_userId_key" ON "ExchangeParticipant"("exchangeId", "userId");

-- CreateIndex
CREATE INDEX "Milestone_exchangeId_status_idx" ON "Milestone"("exchangeId", "status");

-- CreateIndex
CREATE INDEX "Session_exchangeId_startsAt_idx" ON "Session"("exchangeId", "startsAt");

-- CreateIndex
CREATE INDEX "Session_hostId_startsAt_idx" ON "Session"("hostId", "startsAt");

-- CreateIndex
CREATE INDEX "Session_startsAt_status_idx" ON "Session"("startsAt", "status");

-- CreateIndex
CREATE INDEX "ExchangeEvent_exchangeId_createdAt_idx" ON "ExchangeEvent"("exchangeId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Conversation_directKey_key" ON "Conversation"("directKey");

-- CreateIndex
CREATE INDEX "Conversation_lastMessageAt_idx" ON "Conversation"("lastMessageAt");

-- CreateIndex
CREATE INDEX "ConversationParticipant_userId_idx" ON "ConversationParticipant"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ConversationParticipant_conversationId_userId_key" ON "ConversationParticipant"("conversationId", "userId");

-- CreateIndex
CREATE INDEX "Message_conversationId_createdAt_idx" ON "Message"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "Message_senderId_idx" ON "Message"("senderId");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_createdAt_idx" ON "Notification"("userId", "readAt", "createdAt");

-- CreateIndex
CREATE INDEX "Review_subjectId_createdAt_idx" ON "Review"("subjectId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Review_exchangeId_authorId_key" ON "Review"("exchangeId", "authorId");

-- CreateIndex
CREATE INDEX "Follow_followingId_idx" ON "Follow"("followingId");

-- CreateIndex
CREATE UNIQUE INDEX "Follow_followerId_followingId_key" ON "Follow"("followerId", "followingId");

-- CreateIndex
CREATE INDEX "CommunityPost_createdAt_idx" ON "CommunityPost"("createdAt");

-- CreateIndex
CREATE INDEX "CommunityPost_categoryId_createdAt_idx" ON "CommunityPost"("categoryId", "createdAt");

-- CreateIndex
CREATE INDEX "CommunityPost_status_idx" ON "CommunityPost"("status");

-- CreateIndex
CREATE INDEX "CommunityComment_postId_createdAt_idx" ON "CommunityComment"("postId", "createdAt");

-- CreateIndex
CREATE INDEX "CommunityComment_authorId_idx" ON "CommunityComment"("authorId");

-- CreateIndex
CREATE UNIQUE INDEX "CommunityPostVote_postId_userId_key" ON "CommunityPostVote"("postId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "CommunityCommentVote_commentId_userId_key" ON "CommunityCommentVote"("commentId", "userId");

-- CreateIndex
CREATE INDEX "Report_status_createdAt_idx" ON "Report"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Report_targetType_targetId_idx" ON "Report"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "UserBlock_blockedId_idx" ON "UserBlock"("blockedId");

-- CreateIndex
CREATE UNIQUE INDEX "UserBlock_blockerId_blockedId_key" ON "UserBlock"("blockerId", "blockedId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "SupportTicket_status_createdAt_idx" ON "SupportTicket"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "Profile" ADD CONSTRAINT "Profile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPreference" ADD CONSTRAINT "UserPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthSession" ADD CONSTRAINT "AuthSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthToken" ADD CONSTRAINT "AuthToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Skill" ADD CONSTRAINT "Skill_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "SkillCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSkill" ADD CONSTRAINT "UserSkill_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSkill" ADD CONSTRAINT "UserSkill_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Availability" ADD CONSTRAINT "Availability_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExchangeRequest" ADD CONSTRAINT "ExchangeRequest_initiatorId_fkey" FOREIGN KEY ("initiatorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExchangeRequest" ADD CONSTRAINT "ExchangeRequest_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExchangeRequest" ADD CONSTRAINT "ExchangeRequest_offeredSkillId_fkey" FOREIGN KEY ("offeredSkillId") REFERENCES "Skill"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExchangeRequest" ADD CONSTRAINT "ExchangeRequest_requestedSkillId_fkey" FOREIGN KEY ("requestedSkillId") REFERENCES "Skill"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExchangeRequest" ADD CONSTRAINT "ExchangeRequest_parentRequestId_fkey" FOREIGN KEY ("parentRequestId") REFERENCES "ExchangeRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExchangeRequest" ADD CONSTRAINT "ExchangeRequest_exchangeId_fkey" FOREIGN KEY ("exchangeId") REFERENCES "Exchange"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Exchange" ADD CONSTRAINT "Exchange_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExchangeParticipant" ADD CONSTRAINT "ExchangeParticipant_exchangeId_fkey" FOREIGN KEY ("exchangeId") REFERENCES "Exchange"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExchangeParticipant" ADD CONSTRAINT "ExchangeParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Milestone" ADD CONSTRAINT "Milestone_exchangeId_fkey" FOREIGN KEY ("exchangeId") REFERENCES "Exchange"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Milestone" ADD CONSTRAINT "Milestone_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_exchangeId_fkey" FOREIGN KEY ("exchangeId") REFERENCES "Exchange"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExchangeEvent" ADD CONSTRAINT "ExchangeEvent_exchangeId_fkey" FOREIGN KEY ("exchangeId") REFERENCES "Exchange"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationParticipant" ADD CONSTRAINT "ConversationParticipant_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationParticipant" ADD CONSTRAINT "ConversationParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_exchangeId_fkey" FOREIGN KEY ("exchangeId") REFERENCES "Exchange"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Follow" ADD CONSTRAINT "Follow_followerId_fkey" FOREIGN KEY ("followerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Follow" ADD CONSTRAINT "Follow_followingId_fkey" FOREIGN KEY ("followingId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityPost" ADD CONSTRAINT "CommunityPost_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityPost" ADD CONSTRAINT "CommunityPost_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "SkillCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityComment" ADD CONSTRAINT "CommunityComment_postId_fkey" FOREIGN KEY ("postId") REFERENCES "CommunityPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityComment" ADD CONSTRAINT "CommunityComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityComment" ADD CONSTRAINT "CommunityComment_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "CommunityComment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityPostVote" ADD CONSTRAINT "CommunityPostVote_postId_fkey" FOREIGN KEY ("postId") REFERENCES "CommunityPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityPostVote" ADD CONSTRAINT "CommunityPostVote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityCommentVote" ADD CONSTRAINT "CommunityCommentVote_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "CommunityComment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityCommentVote" ADD CONSTRAINT "CommunityCommentVote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserBlock" ADD CONSTRAINT "UserBlock_blockerId_fkey" FOREIGN KEY ("blockerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserBlock" ADD CONSTRAINT "UserBlock_blockedId_fkey" FOREIGN KEY ("blockedId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
