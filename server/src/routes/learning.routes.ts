import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { asyncHandler, validateQuery } from '../lib/http';
import { ok } from '../lib/respond';
import { requireAuth } from '../middleware/auth';
import { computeExchangeProgress } from '../services/progress.service';

export const learningRouter = Router();

learningRouter.use(requireAuth);

/**
 * GET /api/learning — progress across every exchange the member takes part in.
 *
 * Every number is derived from recorded rows (completed sessions, finished
 * milestones, confirmed participation). Nothing is estimated.
 */
learningRouter.get(
  '/',
  validateQuery(z.object({ scope: z.enum(['all', 'active', 'completed']).default('all') })),
  asyncHandler(async (req, res) => {
    const query = res.locals.query as { scope: 'all' | 'active' | 'completed' };
    const userId = req.user!.id;

    const participations = await prisma.exchangeParticipant.findMany({
      where: {
        userId,
        exchange: {
          status:
            query.scope === 'active'
              ? { in: ['ACCEPTED', 'ACTIVE', 'PAUSED'] }
              : query.scope === 'completed'
                ? { in: ['COMPLETED'] }
                : { in: ['ACCEPTED', 'ACTIVE', 'PAUSED', 'COMPLETED'] },
        },
      },
      orderBy: { exchange: { updatedAt: 'desc' } },
      select: {
        status: true,
        agreedAt: true,
        completedAt: true,
        teachesSkillId: true,
        learnsSkillId: true,
        exchange: {
          select: {
            id: true,
            title: true,
            status: true,
            goals: true,
            totalSessions: true,
            sessionMinutes: true,
            startedAt: true,
            completedAt: true,
            createdAt: true,
            updatedAt: true,
            participants: {
              select: {
                userId: true,
                user: { select: { username: true, profile: { select: { displayName: true, avatarUrl: true } } } },
              },
            },
            sessions: {
              orderBy: { startsAt: 'desc' },
              select: { id: true, title: true, startsAt: true, endsAt: true, status: true, completedAt: true },
            },
            milestones: {
              orderBy: [{ sortOrder: 'asc' }],
              select: { id: true, title: true, status: true, dueAt: true, completedAt: true },
            },
            notes: {
              orderBy: { createdAt: 'desc' },
              take: 5,
              select: { id: true, body: true, resourceUrl: true, createdAt: true },
            },
          },
        },
      },
    });

    // Skill names for the agreed teach/learn pairs.
    const skillIds = new Set<string>();
    for (const p of participations) {
      if (p.teachesSkillId) skillIds.add(p.teachesSkillId);
      if (p.learnsSkillId) skillIds.add(p.learnsSkillId);
    }
    const skills = await prisma.skill.findMany({
      where: { id: { in: [...skillIds] } },
      select: { id: true, name: true, slug: true, category: { select: { name: true } } },
    });
    const skillById = new Map(skills.map((s) => [s.id, s]));

    const items = participations.map((p) => {
      const completed = p.exchange.sessions.filter((s) => s.status === 'COMPLETED');
      const doneMilestones = p.exchange.milestones.filter((m) => m.status === 'DONE');
      const minutes = completed.reduce(
        (sum, s) => sum + Math.round((s.endsAt.getTime() - s.startsAt.getTime()) / 60000),
        0,
      );
      const other = p.exchange.participants.find((x) => x.userId !== userId);


      return {
        exchangeId: p.exchange.id,
        title: p.exchange.title,
        status: p.exchange.status,
        goals: p.exchange.goals,
        myStatus: p.status,
        startedAt: p.exchange.startedAt,
        completedAt: p.exchange.completedAt,
        partner: other
          ? {
              username: other.user.username,
              displayName: other.user.profile?.displayName ?? other.user.username,
              avatarUrl: other.user.profile?.avatarUrl ?? null,
            }
          : null,
        iTeach: p.teachesSkillId ? skillById.get(p.teachesSkillId) ?? null : null,
        iLearn: p.learnsSkillId ? skillById.get(p.learnsSkillId) ?? null : null,
        progress: {
          ...computeExchangeProgress({
            agreedSessions: p.exchange.totalSessions,
            sessionsRecorded: p.exchange.sessions.length,
            sessionsCompleted: completed.length,
            milestonesTotal: p.exchange.milestones.length,
            milestonesDone: doneMilestones.length,
          }),
          sessionsRecorded: p.exchange.sessions.length,
          learningMinutes: minutes,
          learningHours: Number((minutes / 60).toFixed(1)),
        },
        milestones: p.exchange.milestones.map((m) => ({
          id: m.id,
          title: m.title,
          status: m.status,
          dueAt: m.dueAt,
          completedAt: m.completedAt,
        })),
        recentSessions: completed.slice(0, 5).map((s) => ({
          id: s.id,
          title: s.title,
          startsAt: s.startsAt,
          completedAt: s.completedAt,
          minutes: Math.round((s.endsAt.getTime() - s.startsAt.getTime()) / 60000),
        })),
        notes: p.exchange.notes,
      };
    });

    const totalMinutes = items.reduce((sum, i) => sum + i.progress.learningMinutes, 0);

    // Learning paths: one row per skill the member is learning, with totals.
    const learningSkillIds = new Set<string>();
    for (const p of participations) if (p.learnsSkillId) learningSkillIds.add(p.learnsSkillId);

    const paths = [...learningSkillIds].map((skillId) => {
      const related = items.filter((i) => i.iLearn?.id === skillId);
      const minutes = related.reduce((sum, i) => sum + i.progress.learningMinutes, 0);
      const sessions = related.reduce((sum, i) => sum + i.progress.sessionsCompleted, 0);
      const completedExchanges = related.filter((i) => i.status === 'COMPLETED').length;
      return {
        skill: skillById.get(skillId) ?? null,
        exchanges: related.length,
        completedExchanges,
        sessionsCompleted: sessions,
        learningMinutes: minutes,
        learningHours: Number((minutes / 60).toFixed(1)),
        percent:
          related.length > 0 ? Math.round(related.reduce((sum, i) => sum + i.progress.percent, 0) / related.length) : 0,
      };
    });

    // Weekly activity for the chart (last 8 weeks of completed sessions).
    const eightWeeksAgo = new Date(Date.now() - 56 * 24 * 60 * 60 * 1000);
    const completedSessions = await prisma.session.findMany({
      where: {
        status: 'COMPLETED',
        completedAt: { gte: eightWeeksAgo },
        exchange: { participants: { some: { userId } } },
      },
      select: { completedAt: true, startsAt: true, endsAt: true },
    });

    const weeks: { weekStart: string; label: string; sessions: number; minutes: number }[] = [];
    for (let i = 7; i >= 0; i -= 1) {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      start.setDate(start.getDate() - start.getDay() - i * 7);
      const end = new Date(start);
      end.setDate(end.getDate() + 7);

      const inWeek = completedSessions.filter(
        (s) => s.completedAt && s.completedAt >= start && s.completedAt < end,
      );
      weeks.push({
        weekStart: start.toISOString().slice(0, 10),
        label: start.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
        sessions: inWeek.length,
        minutes: inWeek.reduce((sum, s) => sum + Math.round((s.endsAt.getTime() - s.startsAt.getTime()) / 60000), 0),
      });
    }

    return ok(res, {
      summary: {
        activeExchanges: items.filter((i) => ['ACCEPTED', 'ACTIVE', 'PAUSED'].includes(i.status)).length,
        completedExchanges: items.filter((i) => i.status === 'COMPLETED').length,
        totalSessionsCompleted: items.reduce((sum, i) => sum + i.progress.sessionsCompleted, 0),
        totalMilestonesDone: items.reduce((sum, i) => sum + i.progress.milestonesDone, 0),
        totalLearningMinutes: totalMinutes,
        totalLearningHours: Number((totalMinutes / 60).toFixed(1)),
      },
      exchanges: items,
      paths,
      weeklyActivity: weeks,
    });
  }),
);
