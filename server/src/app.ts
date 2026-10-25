import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import swaggerUi from 'swagger-ui-express';
import { env } from './config/env';
import { apiRouter } from './routes';
import { openApiDocument } from './openapi';
import {
  csrfOriginGuard,
  errorHandler,
  globalLimiter,
  notFoundHandler,
} from './middleware/errors';
import { ok } from './lib/respond';
import { ensureUploadDir } from './services/storage.service';
import { logger } from './lib/logger';

export function createApp() {
  const app = express();

  // Behind a proxy (typical for hosted deployments) so req.ip and secure
  // cookies behave correctly.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(
    helmet({
      // The API only returns JSON, so the strictest CSP is appropriate here.
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"], // required by swagger-ui
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'blob:'],
          connectSrc: ["'self'", ...env.corsOrigins],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
          baseUri: ["'self'"],
        },
      },
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      referrerPolicy: { policy: 'no-referrer' },
    }),
  );

  app.use(
    cors({
      origin: (origin, callback) => {
        // Same-origin, curl and server-to-server requests have no Origin header.
        if (!origin) return callback(null, true);
        if (env.corsOrigins.includes(origin)) return callback(null, true);
        return callback(new Error('Not allowed by CORS'));
      },
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      maxAge: 600,
    }),
  );

  app.use(compression());
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: false, limit: '1mb' }));
  app.use(cookieParser());

  // Locally stored uploads are served read-only.
  app.use(
    '/uploads',
    express.static(env.uploadDirAbs, {
      index: false,
      dotfiles: 'deny',
      maxAge: '7d',
      setHeaders: (res) => {
        res.setHeader('X-Content-Type-Options', 'nosniff');
      },
    }),
  );

  app.get('/health', (_req, res) =>
    ok(res, {
      status: 'ok',
      uptimeSeconds: Math.round(process.uptime()),
      environment: env.NODE_ENV,
      time: new Date().toISOString(),
    }),
  );

  app.use('/api', globalLimiter, csrfOriginGuard, apiRouter);

  // API documentation
  app.get('/api/openapi.json', (_req, res) => res.json(openApiDocument));
  app.use(
    '/api/docs',
    swaggerUi.serve,
    swaggerUi.setup(openApiDocument as unknown as Record<string, unknown>, {
      customSiteTitle: 'SkillSpring API',
      swaggerOptions: { persistAuthorization: true, docExpansion: 'none' },
    }),
  );

  app.use(notFoundHandler);
  app.use(errorHandler);

  void ensureUploadDir().catch((err) => logger.error('uploads.dir_failed', { err }));

  return app;
}
