import http from 'node:http';
import { createApp } from './app';
import { env } from './config/env';
import { logger } from './lib/logger';
import { prisma } from './lib/prisma';
import { initRealtime } from './realtime';
import { startReminderScheduler } from './services/reminder.service';

async function main() {
  // Fail fast with a clear message if the database is unreachable.
  try {
    await prisma.$connect();
    logger.info('database.connected');
  } catch (err) {
    logger.error('database.connection_failed', { err });
    process.exit(1);
  }

  const app = createApp();
  const server = http.createServer(app);

  initRealtime(server);

  // Session reminder job: emails/marks reminders for upcoming sessions.
  const stopReminders = startReminderScheduler();

  server.listen(env.PORT, () => {
    logger.info('server.listening', {
      port: env.PORT,
      environment: env.NODE_ENV,
      docs: `${env.API_PUBLIC_URL}/api/docs`,
      corsOrigins: env.corsOrigins,
    });
  });

  const shutdown = async (signal: string) => {
    logger.info('server.shutdown_started', { signal });
    stopReminders();
    server.close(async () => {
      await prisma.$disconnect().catch(() => undefined);
      logger.info('server.shutdown_complete');
      process.exit(0);
    });
    // Do not hang forever on a stuck connection.
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  process.on('unhandledRejection', (reason) => {
    logger.error('process.unhandled_rejection', { reason: String(reason) });
  });
  process.on('uncaughtException', (err) => {
    logger.error('process.uncaught_exception', { err });
  });
}

void main();
