import { PrismaClient } from '@prisma/client';
import { env } from '../config/env';

/**
 * A single PrismaClient per process. In development the instance is cached on
 * globalThis so `tsx watch` reloads do not exhaust the connection pool.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: env.isProd ? ['warn', 'error'] : ['warn', 'error'],
  });

if (!env.isProd) globalForPrisma.prisma = prisma;
