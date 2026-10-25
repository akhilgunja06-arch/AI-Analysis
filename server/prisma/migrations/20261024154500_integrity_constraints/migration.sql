-- Database-level integrity that cannot be expressed in the Prisma schema.

-- Ratings must be 1..5
ALTER TABLE "Review" ADD CONSTRAINT "Review_rating_range" CHECK ("rating" BETWEEN 1 AND 5);
ALTER TABLE "Review" ADD CONSTRAINT "Review_teaching_range" CHECK ("teachingRating" IS NULL OR "teachingRating" BETWEEN 1 AND 5);
ALTER TABLE "Review" ADD CONSTRAINT "Review_communication_range" CHECK ("communicationRating" IS NULL OR "communicationRating" BETWEEN 1 AND 5);
ALTER TABLE "Review" ADD CONSTRAINT "Review_reliability_range" CHECK ("reliabilityRating" IS NULL OR "reliabilityRating" BETWEEN 1 AND 5);
-- Nobody may review themselves
ALTER TABLE "Review" ADD CONSTRAINT "Review_no_self" CHECK ("authorId" <> "subjectId");

-- An exchange request can never be sent to yourself
ALTER TABLE "ExchangeRequest" ADD CONSTRAINT "ExchangeRequest_no_self" CHECK ("initiatorId" <> "recipientId");
-- Nobody follows or blocks themselves
ALTER TABLE "Follow" ADD CONSTRAINT "Follow_no_self" CHECK ("followerId" <> "followingId");
ALTER TABLE "UserBlock" ADD CONSTRAINT "UserBlock_no_self" CHECK ("blockerId" <> "blockedId");

-- Weekly availability window must be a valid weekday and a positive interval
ALTER TABLE "Availability" ADD CONSTRAINT "Availability_weekday_range" CHECK ("weekday" BETWEEN 0 AND 6);
ALTER TABLE "Availability" ADD CONSTRAINT "Availability_minute_range" CHECK ("startMinute" >= 0 AND "endMinute" <= 1440 AND "endMinute" > "startMinute");

-- Sessions must end after they start
ALTER TABLE "Session" ADD CONSTRAINT "Session_time_order" CHECK ("endsAt" > "startsAt");

-- Exchange numbers must be sane
ALTER TABLE "ExchangeRequest" ADD CONSTRAINT "ExchangeRequest_positive_numbers" CHECK ("sessionMinutes" > 0 AND "sessionsPerWeek" > 0 AND "totalSessions" > 0);
ALTER TABLE "Exchange" ADD CONSTRAINT "Exchange_positive_numbers" CHECK ("sessionMinutes" > 0 AND "totalSessions" > 0);

-- Vote values are limited to up/down
ALTER TABLE "CommunityPostVote" ADD CONSTRAINT "CommunityPostVote_value" CHECK ("value" IN (-1, 1));
ALTER TABLE "CommunityCommentVote" ADD CONSTRAINT "CommunityCommentVote_value" CHECK ("value" IN (-1, 1));

-- Counter-cache columns must never go negative
ALTER TABLE "CommunityPost" ADD CONSTRAINT "CommunityPost_counts" CHECK ("commentCount" >= 0);
ALTER TABLE "CommunityComment" ADD CONSTRAINT "CommunityComment_counts" CHECK ("voteCount" >= -2147483648);
