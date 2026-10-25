import { Router } from 'express';
import { authRouter } from './auth.routes';
import { profileRouter } from './profile.routes';
import { skillsRouter } from './skills.routes';
import { membersRouter } from './members.routes';
import { matchesRouter } from './matches.routes';
import { exchangesRouter } from './exchanges.routes';
import { milestonesRouter } from './milestones.routes';
import { sessionsRouter } from './sessions.routes';
import { messagingRouter } from './messaging.routes';
import { notificationsRouter } from './notifications.routes';
import { reviewsRouter } from './reviews.routes';
import { communityRouter } from './community.routes';
import { settingsRouter } from './settings.routes';
import { learningRouter } from './learning.routes';
import { adminRouter } from './admin.routes';
import { supportRouter } from './support.routes';
import { dashboardRouter, publicStatsRouter } from './dashboard.routes';

export const apiRouter = Router();

// Public
apiRouter.use('/auth', authRouter);
apiRouter.use('/stats', publicStatsRouter);
apiRouter.use('/skills', skillsRouter);
apiRouter.use('/members', membersRouter);
apiRouter.use('/community', communityRouter);
apiRouter.use('/support', supportRouter);

// Authenticated member
apiRouter.use('/profile', profileRouter);
apiRouter.use('/dashboard', dashboardRouter);
apiRouter.use('/matches', matchesRouter);
apiRouter.use('/exchanges', exchangesRouter);
apiRouter.use('/sessions', sessionsRouter);
apiRouter.use('/messages', messagingRouter);
apiRouter.use('/notifications', notificationsRouter);
apiRouter.use('/reviews', reviewsRouter);
apiRouter.use('/settings', settingsRouter);
apiRouter.use('/learning', learningRouter);

// Milestones and notes hang off exchanges but live in their own router.
apiRouter.use('/', milestonesRouter);

// Staff
apiRouter.use('/admin', adminRouter);

/** GET /api — a machine-readable index of the surface area. */
apiRouter.get('/', (_req, res) => {
  res.json({
    data: {
      name: 'SkillSpring API',
      version: '1.0.0',
      documentation: '/api/docs',
      openapi: '/api/openapi.json',
      groups: [
        'auth', 'stats', 'skills', 'members', 'community', 'support',
        'profile', 'dashboard', 'matches', 'exchanges', 'sessions',
        'messages', 'notifications', 'reviews', 'settings', 'learning', 'admin',
      ],
    },
  });
});
