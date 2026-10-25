import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { asyncHandler } from '../lib/http';
import { ok } from '../lib/respond';
import { requireAuth } from '../middleware/auth';
import { profileCompletion } from '../services/member.service';

export const dashboardRouter = Router();

dashboardRouter.use(requireAuth);

/** Buckets dated rows into the last `days` days for the activity charts. */
function buildWeeklySeries(
  rows: { at: Date }[],
  days: number,
): { date: string; label: string; count: number }[] {
  const buckets = new Map<string, number>();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    buckets.set(d.toISOString().slice(0, 10), 0);
  }

  for (const row of rows) {
    const key = new Date(row.at).toISOString().slice(0, 10);
    if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }

  return [...buckets.entries()].map(([date, count]) => ({
    date,
    label: new Date(`${date}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' }),
    count,
  }));
}

/**
 * GET /api/dashboard — every widget on the dashboard, from real rows.
 * New members get explicit empty arrays rather than placeholder numbers.
 */
dashboardRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const now = new Date();

    const [
      profile,
      teaches,
      wants,
      availability,
      incomingRequests,
      outgoingRequests,
      participations,
      upcomingSessions,
      unreadMessages,
      unreadNotifications,
      recentNotifications,
    ] = await Promise.all([
      prisma.profile.findUnique({ where: { userId } }),
      prisma.userSkill.findMany({
        where: { userId, direction: 'TEACH', isActive: true },
        select: { id: true, level: true, skill: { select: { id: true, name: true, slug: true, category: { select: { name: true } } } } },
      }),
      prisma.userSkill.findMany({
        where: { userId, direction: 'LEARN', isActive: true },
        select: { id: true, level: true, skill: { select: { id: true, name: true, slug: true, category: { select: { name: true } } } } },
      }),
      prisma.availability.count({ where: { userId } }),
      prisma.exchangeRequest.findMany({
        where: { recipientId: userId, status: { in: ['PENDING', 'COUNTERED'] } },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          id: true,
          status: true,
          message: true,
          createdAt: true,
          initiator: { select: { username: true, profile: { select: { displayName: true, avatarUrl: true } } } },
          offeredSkill: { select: { name: true } },
          requestedSkill: { select: { name: true } },
        },
      }),
      prisma.exchangeRequest.findMany({
        where: { initiatorId: userId, status: { in: ['PENDING', 'COUNTERED'] } },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          id: true,
          status: true,
          createdAt: true,
          recipient: { select: { username: true, profile: { select: { displayName: true, avatarUrl: true } } } },
        },
      }),
      prisma.exchangeParticipant.findMany({
        where: { userId, exchange: { status: { in: ['ACCEPTED', 'ACTIVE', 'PAUSED'] } } },
        orderBy: { exchange: { updatedAt: 'desc' } },
        take: 6,
        select: {
          status: true,
          exchange: {
            select: {
              id: true,
              title: true,
              status: true,
              goals: true,
              totalSessions: true,
              updatedAt: true,
              participants: {
                select: {
                  userId: true,
                  user: { select: { username: true, profile: { select: { displayName: true, avatarUrl: true } } } },
                },
              },
              _count: { select: { sessions: true, milestones: true } },
            },
          },
        },
      }),
      prisma.session.findMany({
        where: {
          status: 'SCHEDULED',
          startsAt: { gte: now },
          exchange: { participants: { some: { userId } } },
        },
        orderBy: { startsAt: 'asc' },
        take: 5,
        select: {
          id: true,
          title: true,
          startsAt: true,
          endsAt: true,
          timezone: true,
          format: true,
          meetingUrl: true,
          exchange: { select: { id: true, title: true } },
          host: { select: { username: true } },
        },
      }),
      prisma.conversationParticipant.findMany({
        where: { userId, muted: false },
        select: { conversationId: true, lastReadAt: true },
      }),
      prisma.notification.count({ where: { userId, readAt: null } }),
      prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: { id: true, type: true, title: true, body: true, link: true, readAt: true, createdAt: true },
      }),
    ]);

    // --- unread message total
    let unreadTotal = 0;
    for (const p of unreadMessages) {
      unreadTotal += await prisma.message.count({
        where: {
          conversationId: p.conversationId,
          senderId: { not: userId },
          hiddenAt: null,
          ...(p.lastReadAt ? { createdAt: { gt: p.lastReadAt } } : {}),
        },
      });
    }

    // --- recent messages preview
    const recentConversations = await prisma.conversation.findMany({
      where: { participants: { some: { userId } }, messages: { some: {} } },
      orderBy: { lastMessageAt: 'desc' },
      take: 4,
      select: {
        id: true,
        lastMessageAt: true,
        participants: {
          where: { userId: { not: userId } },
          select: { user: { select: { username: true, profile: { select: { displayName: true, avatarUrl: true } } } } },
        },
        messages: { orderBy: { createdAt: 'desc' }, take: 1, select: { body: true, createdAt: true, senderId: true, hiddenAt: true } },
      },
    });

    // --- weekly activity (last 7 days), from completed sessions and messages sent
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const [completedSessions, messagesSent, milestonesDone] = await Promise.all([
      prisma.session.findMany({
        where: {
          status: 'COMPLETED',
          completedAt: { gte: weekAgo },
          exchange: { participants: { some: { userId } } },
        },
        select: { completedAt: true, endsAt: true, startsAt: true },
      }),
      prisma.message.findMany({
        where: { senderId: userId, createdAt: { gte: weekAgo } },
        select: { createdAt: true },
      }),
      prisma.milestone.findMany({
        where: {
          status: 'DONE',
          completedAt: { gte: weekAgo },
          exchange: { participants: { some: { userId } } },
        },
        select: { completedAt: true },
      }),
    ]);

    const learningMinutes = completedSessions.reduce(
      (sum, s) => sum + Math.round((s.endsAt.getTime() - s.startsAt.getTime()) / 60000),
      0,
    );

    // --- exchange status breakdown for the donut chart
    const statusCounts = await prisma.exchange.groupBy({
      by: ['status'],
      where: { participants: { some: { userId } } },
      _count: { _all: true },
    });

    // --- completed exchanges and reviews received
    const [completedExchanges, reviewAgg] = await Promise.all([
      prisma.exchangeParticipant.count({ where: { userId, status: 'COMPLETED' } }),
      prisma.review.aggregate({
        where: { subjectId: userId, hiddenAt: null },
        _avg: { rating: true },
        _count: { _all: true },
      }),
    ]);

    const completion = profileCompletion({
      hasAvatar: Boolean(profile?.avatarUrl),
      hasDisplayName: Boolean(profile?.displayName && profile.displayName !== 'New member'),
      hasBio: Boolean(profile?.bio && profile.bio.length >= 20),
      hasLocation: Boolean(profile?.location),
      hasLanguages: Boolean(profile?.languages && profile.languages.length > 0),
      hasTimezone: Boolean(profile?.timezone),
      teachesCount: teaches.length,
      wantsCount: wants.length,
      availabilityCount: availability,
      hasGoals: Boolean(profile?.learningGoals && profile.learningGoals.length >= 10),
    });

    // --- recommended partners, reusing the deterministic matching engine
    let recommendations: unknown[] = [];
    if (teaches.length > 0 && wants.length > 0) {
      const { rankMatches } = await import('../services/matching.service');

      const myAvailability = await prisma.availability.findMany({
        where: { userId },
        select: { weekday: true, startMinute: true, endMinute: true },
      });

      const candidates = await prisma.user.findMany({
        where: {
          id: { not: userId },
          status: 'ACTIVE',
          role: { not: 'ADMIN' },
          OR: [{ preference: null }, { preference: { publicProfile: true } }],
          skills: { some: { isActive: true } },
        },
        take: 150,
        select: {
          id: true,
          username: true,
          profile: { select: { displayName: true, avatarUrl: true, headline: true, timezone: true, languages: true } },
          skills: {
            where: { isActive: true },
            select: { skillId: true, direction: true, level: true, skill: { select: { name: true } } },
          },
          availability: { select: { weekday: true, startMinute: true, endMinute: true } },
        },
      });

      const ratingRows = await prisma.review.groupBy({
        by: ['subjectId'],
        where: { subjectId: { in: candidates.map((c) => c.id) }, hiddenAt: null },
        _avg: { rating: true },
        _count: { _all: true },
      });
      const ratingById = new Map(ratingRows.map((r) => [r.subjectId, r]));

      const results = rankMatches(
        {
          userId,
          teaches: teaches.map((t) => ({ skillId: t.skill.id, skillName: t.skill.name, level: t.level })),
          wants: wants.map((w) => ({ skillId: w.skill.id, skillName: w.skill.name, level: w.level })),
          languages: profile?.languages ?? [],
          timezone: profile?.timezone ?? 'UTC',
          availability: myAvailability,
        },
        candidates.map((c) => {
          const rating = ratingById.get(c.id);
          return {
            userId: c.id,
            username: c.username,
            teaches: c.skills
              .filter((s) => s.direction === 'TEACH')
              .map((s) => ({ skillId: s.skillId, skillName: s.skill.name, level: s.level })),
            wants: c.skills
              .filter((s) => s.direction === 'LEARN')
              .map((s) => ({ skillId: s.skillId, skillName: s.skill.name, level: s.level })),
            languages: c.profile?.languages ?? [],
            timezone: c.profile?.timezone ?? 'UTC',
            availability: c.availability,
            averageRating: rating?._avg.rating ?? null,
            reviewCount: rating?._count._all ?? 0,
          };
        }),
      );

      const top = results.filter((r) => r.score > 0).slice(0, 3);
      const candidateById = new Map(candidates.map((c) => [c.id, c]));
      recommendations = top.map((r) => {
        const c = candidateById.get(r.userId);
        return {
          userId: r.userId,
          username: r.username,
          score: r.score,
          reasons: r.reasons,
          displayName: c?.profile?.displayName ?? r.username,
          avatarUrl: c?.profile?.avatarUrl ?? null,
          headline: c?.profile?.headline ?? null,
        };
      });
    }

    return ok(res, {
      greeting: {
        displayName: profile?.displayName ?? req.user!.username,
        username: req.user!.username,
        memberSince: null,
      },
      completion,
      skills: {
        teaches: teaches.map((t) => ({
          id: t.id,
          level: t.level,
          name: t.skill.name,
          slug: t.skill.slug,
          category: t.skill.category.name,
        })),
        wants: wants.map((w) => ({
          id: w.id,
          level: w.level,
          name: w.skill.name,
          slug: w.skill.slug,
          category: w.skill.category.name,
        })),
      },
      requests: {
        incoming: incomingRequests.map((r) => ({
          id: r.id,
          status: r.status,
          message: r.message,
          createdAt: r.createdAt,
          from: {
            username: r.initiator.username,
            displayName: r.initiator.profile?.displayName ?? r.initiator.username,
            avatarUrl: r.initiator.profile?.avatarUrl ?? null,
          },
          offeredSkill: r.offeredSkill?.name ?? null,
          requestedSkill: r.requestedSkill?.name ?? null,
        })),
        outgoing: outgoingRequests.map((r) => ({
          id: r.id,
          status: r.status,
          createdAt: r.createdAt,
          to: {
            username: r.recipient.username,
            displayName: r.recipient.profile?.displayName ?? r.recipient.username,
            avatarUrl: r.recipient.profile?.avatarUrl ?? null,
          },
        })),
      },
      upcomingSessions: upcomingSessions.map((s) => ({
        id: s.id,
        title: s.title ?? s.exchange.title,
        startsAt: s.startsAt,
        endsAt: s.endsAt,
        // The client renders these in the viewer's timezone and labels the
        // session's own timezone alongside it, so it needs the value here.
        timezone: s.timezone,
        format: s.format,
        meetingUrl: s.meetingUrl,
        host: s.host.username,
        exchange: s.exchange,
      })),
      activeExchanges: participations.map((p) => {
        const other = p.exchange.participants.find((x) => x.userId !== userId);
        return {
          id: p.exchange.id,
          title: p.exchange.title,
          status: p.exchange.status,
          goals: p.exchange.goals,
          myStatus: p.status,
          updatedAt: p.exchange.updatedAt,
          partner: other
            ? {
                username: other.user.username,
                displayName: other.user.profile?.displayName ?? other.user.username,
                avatarUrl: other.user.profile?.avatarUrl ?? null,
              }
            : null,
          progress: {
            sessionsTotal: p.exchange._count.sessions,
            milestonesTotal: p.exchange._count.milestones,
          },
        };
      }),
      recommendations,
      messages: {
        unread: unreadTotal,
        recent: recentConversations.map((c) => {
          const other = c.participants[0];
          const last = c.messages[0];
          return {
            conversationId: c.id,
            with: other
              ? {
                  username: other.user.username,
                  displayName: other.user.profile?.displayName ?? other.user.username,
                  avatarUrl: other.user.profile?.avatarUrl ?? null,
                }
              : null,
            preview: last?.hiddenAt ? 'Message removed by a moderator.' : (last?.body.slice(0, 120) ?? ''),
            createdAt: last?.createdAt ?? c.lastMessageAt,
            fromMe: last?.senderId === userId,
          };
        }),
      },
      notifications: {
        unread: unreadNotifications,
        recent: recentNotifications,
      },
      activity: {
        series: buildWeeklySeries(
          [
            ...completedSessions.map((s) => ({ at: s.completedAt ?? s.endsAt })),
            ...milestonesDone.map((m) => ({ at: m.completedAt! })),
          ],
          7,
        ),
        messagesSentSeries: buildWeeklySeries(messagesSent.map((m) => ({ at: m.createdAt })), 7),
        learningMinutesThisWeek: learningMinutes,
        completedSessionsThisWeek: completedSessions.length,
      },
      exchangeBreakdown: statusCounts.map((s) => ({ status: s.status, count: s._count._all })),
      reputation: {
        completedExchanges,
        reviewsCount: reviewAgg._count._all,
        averageRating: reviewAgg._avg.rating !== null ? Number(reviewAgg._avg.rating.toFixed(2)) : null,
      },
    });
  }),
);

/** GET /api/dashboard/stats — public platform statistics for the landing page. */
export const publicStatsRouter = Router();

publicStatsRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const [members, skillCount, categoryCount, completedExchanges, activeExchanges, reviews, avgRating, communityPosts] =
      await Promise.all([
        prisma.user.count({ where: { status: 'ACTIVE', role: { not: 'ADMIN' } } }),
        prisma.skill.count(),
        prisma.skillCategory.count(),
        prisma.exchange.count({ where: { status: 'COMPLETED' } }),
        prisma.exchange.count({ where: { status: { in: ['ACTIVE', 'ACCEPTED'] } } }),
        prisma.review.count({ where: { hiddenAt: null } }),
        prisma.review.aggregate({ where: { hiddenAt: null }, _avg: { rating: true } }),
        prisma.communityPost.count({ where: { status: 'PUBLISHED' } }),
      ]);

    return ok(res, {
      members,
      skills: skillCount,
      categories: categoryCount,
      completedExchanges,
      activeExchanges,
      reviews,
      averageRating: avgRating._avg.rating !== null ? Number(avgRating._avg.rating.toFixed(2)) : null,
      communityPosts,
      // Everything above is a live count from the database.
      source: 'live-database',
    });
  }),
);
