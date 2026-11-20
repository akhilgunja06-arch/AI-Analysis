import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { createNotification } from './notification.service';
import { emitToUser } from '../realtime';
import { recordAudit } from './audit.service';
import type { ModerationDecision } from './moderation.service';

/**
 * Turns moderation events into consequences.
 *
 * Thresholds are counted over a rolling window so an old mistake does not count
 * against a member forever:
 *   - 3 WARNs in 24h  -> 24h messaging restriction
 *   - 5 WARNs in 7d   -> 7d messaging restriction
 *   - 2 BLOCKs in 7d  -> 7d suspension
 *   - 1 BLOCK at severity 3 -> immediate suspension pending review
 *
 * Nothing here permanently bans an account. A human must act on the report.
 */

const WINDOW_SHORT_MS = 24 * 60 * 60 * 1000;
const WINDOW_LONG_MS = 7 * 24 * 60 * 60 * 1000;

export type EnforcementOutcome = {
  restricted: boolean;
  restrictedUntil: Date | null;
  suspended: boolean;
};

const NO_OUTCOME: EnforcementOutcome = { restricted: false, restrictedUntil: null, suspended: false };

/** Returns the active restriction for a user, if any. */
export async function activeRestriction(userId: string) {
  return prisma.messagingRestriction.findFirst({
    where: {
      userId,
      liftedAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    orderBy: { createdAt: 'desc' },
    select: { id: true, reason: true, expiresAt: true, severity: true },
  });
}

async function applyRestriction(userId: string, reason: string, severity: number, durationMs: number) {
  const expiresAt = new Date(Date.now() + durationMs);
  // Replace any existing restriction with the longer one.
  await prisma.messagingRestriction.updateMany({
    where: { userId, liftedAt: null },
    data: { liftedAt: new Date() },
  });
  const restriction = await prisma.messagingRestriction.create({
    data: { userId, reason, severity, expiresAt },
    select: { id: true, expiresAt: true },
  });

  await createNotification(
    {
      userId,
      type: 'MODERATION',
      title: 'Messaging temporarily restricted',
      body: reason,
      link: '/settings',
      metadata: { restrictionId: restriction.id, expiresAt: expiresAt.toISOString() },
    },
    emitToUser,
  );
  emitToUser(userId, 'moderation:restricted', { reason, expiresAt: expiresAt.toISOString() });
  return restriction;
}

/**
 * Applies escalation after a decision was recorded. Safe to call for ALLOW —
 * it returns immediately.
 */
export async function enforceModeration(
  userId: string,
  decision: ModerationDecision,
): Promise<EnforcementOutcome> {
  if (decision.verdict === 'ALLOW') return NO_OUTCOME;

  try {
    if (decision.verdict === 'BLOCK') {
      const severe = decision.severity >= 3;
      const recentBlocks = await prisma.moderationEvent.count({
        where: {
          userId,
          verdict: 'BLOCK',
          createdAt: { gte: new Date(Date.now() - WINDOW_LONG_MS) },
        },
      });

      if (severe || recentBlocks >= 2) {
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { id: true, status: true, username: true },
        });
        if (user && user.status !== 'SUSPENDED' && user.status !== 'DEACTIVATED') {
          await prisma.user.update({ where: { id: userId }, data: { status: 'SUSPENDED' } });
          await createNotification(
            {
              userId,
              type: 'MODERATION',
              title: 'Account suspended pending review',
              body: `${decision.reason} Your account has been suspended while a moderator reviews it. You can appeal from the contact page.`,
              link: '/contact',
            },
            emitToUser,
          );
          emitToUser(userId, 'moderation:suspended', { reason: decision.reason });
          await recordAudit({
            actorId: null,
            action: 'moderation.auto_suspended',
            entityType: 'User',
            entityId: userId,
            summary: `Automatically suspended @${user.username} after a severity-${decision.severity} ${decision.category} block`,
            metadata: { category: decision.category, severity: decision.severity },
          });
          return { restricted: true, restrictedUntil: null, suspended: true };
        }
      }

      // First serious block without escalation still stops messaging for a day.
      const existing = await activeRestriction(userId);
      if (!existing) {
        const r = await applyRestriction(
          userId,
          `${decision.reason} Messaging is paused for 24 hours.`,
          decision.severity,
          WINDOW_SHORT_MS,
        );
        return { restricted: true, restrictedUntil: r.expiresAt, suspended: false };
      }
      return {
        restricted: true,
        restrictedUntil: existing.expiresAt,
        suspended: false,
      };
    }

    // WARN escalation.
    const [short, long] = await Promise.all([
      prisma.moderationEvent.count({
        where: {
          userId,
          verdict: 'WARN',
          createdAt: { gte: new Date(Date.now() - WINDOW_SHORT_MS) },
        },
      }),
      prisma.moderationEvent.count({
        where: {
          userId,
          verdict: 'WARN',
          createdAt: { gte: new Date(Date.now() - WINDOW_LONG_MS) },
        },
      }),
    ]);

    if (long >= 5) {
      const existing = await activeRestriction(userId);
      if (!existing) {
        const r = await applyRestriction(
          userId,
          'Repeated abusive messages. Messaging is paused for 7 days.',
          2,
          WINDOW_LONG_MS,
        );
        return { restricted: true, restrictedUntil: r.expiresAt, suspended: false };
      }
    } else if (short >= 3) {
      const existing = await activeRestriction(userId);
      if (!existing) {
        const r = await applyRestriction(
          userId,
          'Several abusive messages in one day. Messaging is paused for 24 hours.',
          1,
          WINDOW_SHORT_MS,
        );
        return { restricted: true, restrictedUntil: r.expiresAt, suspended: false };
      }
    }

    return NO_OUTCOME;
  } catch (err) {
    logger.error('moderation.enforce_failed', { userId, err });
    return NO_OUTCOME;
  }
}
