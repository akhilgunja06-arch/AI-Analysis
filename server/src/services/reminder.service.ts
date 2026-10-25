import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { createNotification } from './notification.service';

/**
 * Session reminders.
 *
 * A lightweight in-process scheduler (no external queue is required). It runs
 * every five minutes, finds sessions starting within the next hour that have not
 * been reminded yet, and issues a notification — which the notification service
 * turns into an email when the recipient opted in and email delivery is
 * configured. `reminderSentAt` makes the job idempotent.
 */

const INTERVAL_MS = 5 * 60 * 1000;
const WINDOW_MS = 60 * 60 * 1000;

export async function runReminderPass(): Promise<{ reminded: number }> {
  const now = new Date();
  const horizon = new Date(now.getTime() + WINDOW_MS);

  const due = await prisma.session.findMany({
    where: {
      status: 'SCHEDULED',
      reminderSentAt: null,
      startsAt: { gte: now, lte: horizon },
    },
    select: {
      id: true,
      title: true,
      startsAt: true,
      exchangeId: true,
      exchange: {
        select: {
          title: true,
          participants: { select: { userId: true } },
        },
      },
    },
    take: 200,
  });

  let reminded = 0;

  for (const session of due) {
    for (const participant of session.exchange.participants) {
      await createNotification({
        userId: participant.userId,
        type: 'SESSION_REMINDER',
        title: 'Session starting soon',
        body: `"${session.title ?? session.exchange.title}" starts at ${session.startsAt.toISOString()}.`,
        link: `/calendar`,
        metadata: { sessionId: session.id, exchangeId: session.exchangeId },
      });
    }

    await prisma.session.update({ where: { id: session.id }, data: { reminderSentAt: new Date() } });
    reminded += 1;
  }

  if (reminded > 0) logger.info('reminders.sent', { reminded });
  return { reminded };
}

export function startReminderScheduler(): () => void {
  // Reminders are unnecessary noise in tests.
  if (process.env.NODE_ENV === 'test') return () => undefined;

  const timer = setInterval(() => {
    void runReminderPass().catch((err) => logger.error('reminders.failed', { err }));
  }, INTERVAL_MS);

  timer.unref();

  // Run once shortly after boot so a restarted server catches up.
  const boot = setTimeout(() => {
    void runReminderPass().catch(() => undefined);
  }, 15_000);
  boot.unref();

  return () => clearInterval(timer);
}
