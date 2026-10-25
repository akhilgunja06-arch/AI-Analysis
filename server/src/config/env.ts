import path from 'node:path';
import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const csv = (v: string) =>
  v
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  API_PUBLIC_URL: z.string().default('http://localhost:4000'),
  CORS_ORIGINS: z.string().default('http://localhost:5173'),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  ACCESS_TOKEN_SECRET: z.string().min(16, 'ACCESS_TOKEN_SECRET must be at least 16 characters'),
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  PASSWORD_PEPPER: z.string().default(''),
  COOKIE_DOMAIN: z.string().default('localhost'),
  COOKIE_SECURE: z
    .string()
    .default('false')
    .transform((v) => v === 'true'),
  COOKIE_SAMESITE: z.enum(['lax', 'strict', 'none']).default('lax'),

  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(900_000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(300),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(20),

  EMAIL_PROVIDER: z.enum(['console', 'smtp', 'disabled']).default('console'),
  EMAIL_FROM: z.string().default('SkillSpring <no-reply@skillspring.local>'),
  SMTP_HOST: z.string().optional().default(''),
  SMTP_PORT: z.coerce.number().int().optional().default(587),
  SMTP_USER: z.string().optional().default(''),
  SMTP_PASSWORD: z.string().optional().default(''),
  SMTP_SECURE: z
    .string()
    .default('false')
    .transform((v) => v === 'true'),

  STORAGE_PROVIDER: z.enum(['local', 's3']).default('local'),
  UPLOAD_DIR: z.string().default('./uploads'),
  MAX_UPLOAD_BYTES: z.coerce.number().int().positive().default(5 * 1024 * 1024),

  AI_PROVIDER: z.enum(['none', 'openai', 'anthropic']).default('none'),
  AI_API_KEY: z.string().optional().default(''),
  AI_MODEL: z.string().optional().default(''),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
  // Fail fast: never start with a half-configured server.
  console.error(`\n[config] Invalid environment configuration:\n${issues}\n`);
  process.exit(1);
}

const raw = parsed.data;
const isProd = raw.NODE_ENV === 'production';

if (isProd) {
  const weak: string[] = [];
  if (raw.ACCESS_TOKEN_SECRET.includes('change_me') || raw.ACCESS_TOKEN_SECRET.length < 32) {
    weak.push('ACCESS_TOKEN_SECRET must be a strong 32+ character secret in production');
  }
  if (!raw.PASSWORD_PEPPER || raw.PASSWORD_PEPPER.includes('change_me')) {
    weak.push('PASSWORD_PEPPER must be set in production');
  }
  if (!raw.COOKIE_SECURE) weak.push('COOKIE_SECURE must be true in production');
  if (raw.CORS_ORIGINS.includes('localhost')) {
    weak.push('CORS_ORIGINS must not include localhost in production');
  }
  if (weak.length) {
    console.error(`\n[config] Refusing to start in production:\n${weak.map((w) => `  - ${w}`).join('\n')}\n`);
    process.exit(1);
  }
}

export const env = {
  ...raw,
  isProd,
  isTest: raw.NODE_ENV === 'test',
  corsOrigins: csv(raw.CORS_ORIGINS),
  accessTokenTtlSeconds: 15 * 60,
  refreshTokenTtlMs: raw.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
  uploadDirAbs: path.resolve(process.cwd(), raw.UPLOAD_DIR),
  aiEnabled: raw.AI_PROVIDER !== 'none' && Boolean(raw.AI_API_KEY),
};

export type Env = typeof env;
