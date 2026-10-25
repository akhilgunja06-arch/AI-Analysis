import type { NotificationType, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { notificationEmail } from './email.service';

/** Maps a notification type to the user preference that controls email delivery. */
const EMAIL_PREFERENCE: Partial<Record<NotificationType, 'emailOnExchange' | 'emailOnMessage' | 'emailOnSession' | 'emailOnReview' | 'emailOnCommunity'>> = {
  EXCHANGE_REQUEST: 'emailOnExchange',
  EXCHANGE_ACCEPTED: 'emailOnExchange',
  EXCHANGE_DECLINED: 'emailOnExchange',
  EXCHANGE_COUNTERED: 'emailOnExchange',
  EXCHANGE_ACTIVE: 'emailOnExchange',
  EXCHANGE_COMPLETED: 'emailOnExchange',
  EXCHANGE_CANCELLED: 'emailOnExchange',
  SESSION_SCHEDULED: 'emailOnSession',
  SESSION_UPDATED: 'emailOnSession',
  SESSION_CANCELLED: 'emailOnSession',
  SESSION_REMINDER: 'emailOnSession',
  MESSAGE: 'emailOnMessage',
  REVIEW_RECEIVED: 'emailOnReview',
  COMMUNITY_REPLY: 'emailOnCommunity',
};

export type CreateNotificationInput = {
  userId: string;
  type: NotificationType;
  title: string;
  body?: string;
  link?: string;
  metadata?: Prisma.InputJsonValue;
};

export type RealtimeEmitter = (userId: string, event: string, payload: unknown) => void;

/**
 * Creates an in-app notification and, when the recipient opted in, also sends
 * an email. Email delivery failures are non-fatal.
 */
export async function createNotification(
  input: CreateNotificationInput,
  emit?: RealtimeEmitter,
): Promise<void> {
  try {
    const notification = await prisma.notification.create({
      data: {
        userId: input.userId,
        type: input.type,
        title: input.title,
        body: input.body,
        link: input.link,
        metadata: input.metadata,
      },
    });

    emit?.(input.userId, 'notification:new', {
      id: notification.id,
      type: notification.type,
      title: notification.title,
      body: notification.body,
      link: notification.link,
      createdAt: notification.createdAt,
    });

    const prefKey = EMAIL_PREFERENCE[input.type];
    if (prefKey) {
      const recipient = await prisma.user.findUnique({
        where: { id: input.userId },
        select: {
          email: true,
          status: true,
          preference: { select: { emailOnExchange: true, emailOnMessage: true, emailOnSession: true, emailOnReview: true, emailOnCommunity: true } },
        },
      });

      if (recipient?.preference?.[prefKey] && recipient.status !== 'DEACTIVATED') {
        const result = await notificationEmail(
          recipient.email,
          input.title,
          input.body ?? 'Open SkillSpring to see the details.',
          input.link,
        );
        if (result.delivered) {
          await prisma.notification.update({
            where: { id: notification.id },
            data: { emailedAt: new Date() },
          });
        }
      }
    }
  } catch (err) {
    logger.error('notification.create_failed', { type: input.type, userId: input.userId, err });
  }
}

export async function createManyNotifications(
  inputs: CreateNotificationInput[],
  emit?: RealtimeEmitter,
): Promise<void> {
  for (const input of inputs) {
    await createNotification(input, emit);
  }
}
