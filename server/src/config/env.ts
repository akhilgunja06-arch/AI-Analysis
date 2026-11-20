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

  // --- Media pipeline ---
  // Separate signing secret for private-media URLs. Falls back to the access
  // token secret when unset, so a default install still signs correctly.
  MEDIA_SIGNING_SECRET: z.string().default(''),
  MEDIA_SIGNED_URL_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  MAX_IMAGE_UPLOAD_BYTES: z.coerce.number().int().positive().default(15 * 1024 * 1024),
  MAX_VIDEO_UPLOAD_BYTES: z.coerce.number().int().positive().default(200 * 1024 * 1024),
  MAX_VIDEO_DURATION_SECONDS: z.coerce.number().int().positive().default(600),
  MEDIA_UPLOAD_TTL_MINUTES: z.coerce.number().int().positive().default(120),
  MEDIA_TEMP_DIR: z.string().default('./uploads/.tmp'),
  // When true the untouched upload is retained alongside the optimised copy so
  // an operator can recover the original. Set false to save disk space.
  KEEP_ORIGINAL_MEDIA: z
    .string()
    .default('true')
    .transform((v) => v === 'true'),
  IMAGE_OPTIMIZATION_ENABLED: z
    .string()
    .default('true')
    .transform((v) => v === 'true'),
  // Optional explicit paths; when unset the system PATH is used.
  FFPROBE_PATH: z.string().optional().default('ffprobe'),

  // --- AI assistant (Groq) ---
  // AI_PROVIDER / AI_API_KEY / AI_MODEL are the documented names. The older
  // GROQ_* names stay supported as aliases so existing deployments keep
  // working; the resolution below prefers AI_* when both are set.
  // All of these are read on the server only and never reach the browser.
  AI_PROVIDER: z.enum(['none', 'groq', 'openai', 'anthropic']).default('none'),
  AI_API_KEY: z.string().optional().default(''),
  AI_MODEL: z.string().optional().default(''),

  GROQ_API_KEY: z.string().optional().default(''),
  GROQ_MODEL: z.string().optional().default(''),
  GROQ_BASE_URL: z.string().optional().default('https://api.groq.com/openai/v1'),
  GROQ_MAX_TOKENS: z.coerce.number().int().positive().max(8192).default(2048),
  GROQ_TEMPERATURE: z.coerce.number().min(0).max(2).default(0.4),
  GROQ_TIMEOUT_MS: z.coerce.number().int().positive().default(45_000),
  // Per-member request budget for the assistant, over RATE_LIMIT_WINDOW_MS.
  AI_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(30),

  // --- Learning resource search (optional) ---
  // Tavily key for live resource discovery. Without it the skill-learning
  // agent shows a curated, clearly-labelled list instead of inventing links.
  SEARCH_API_KEY: z.string().optional().default(''),

  // --- WebRTC signalling ---
  // Comma-separated STUN/TURN URLs handed to the browser as ICE servers. TURN
  // credentials stay server-side and are minted into a short-lived credential
  // when TURN_STATIC_SECRET is set (coturn REST API scheme).
  WEBRTC_STUN_URLS: z
    .string()
    .default('stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302'),
  WEBRTC_TURN_URLS: z.string().optional().default(''),
  WEBRTC_TURN_USERNAME: z.string().optional().default(''),
  WEBRTC_TURN_CREDENTIAL: z.string().optional().default(''),
  WEBRTC_TURN_STATIC_SECRET: z.string().optional().default(''),
  WEBRTC_TURN_TTL_SECONDS: z.coerce.number().int().positive().default(3600),
  // How long an unanswered call keeps ringing before it is marked missed.
  CALL_RING_TIMEOUT_SECONDS: z.coerce.number().int().positive().default(45),
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

/**
 * Resolves the assistant configuration from either naming scheme.
 *
 * AI_PROVIDER=none is an explicit opt-out and short-circuits everything else.
 *
 * Only Groq is implemented: `groq.service.ts` speaks the OpenAI-compatible
 * Groq endpoint and nothing else. Accepting `openai` or `anthropic` here used
 * to enable the assistant anyway, which sent that provider's key to
 * api.groq.com — a credential leak and a confusing 401. Those values are now
 * rejected with an explicit message instead of being silently honoured.
 */
const SUPPORTED_AI_PROVIDERS = ['none', 'groq'] as const;

const aiProviderRaw = raw.AI_PROVIDER;
const aiProviderUnsupported = !SUPPORTED_AI_PROVIDERS.includes(
  aiProviderRaw as (typeof SUPPORTED_AI_PROVIDERS)[number],
);

const aiKeyFromAi = raw.AI_API_KEY.trim();
const aiKeyFromGroq = raw.GROQ_API_KEY.trim();
const aiKey =
  aiProviderRaw === 'none' || aiProviderUnsupported ? '' : aiKeyFromAi || aiKeyFromGroq;
const aiModel = raw.AI_MODEL.trim() || raw.GROQ_MODEL.trim() || 'openai/gpt-oss-120b';

const aiMissingEnv: string[] = [];
if (aiProviderRaw !== 'none' && !aiProviderUnsupported) {
  if (!aiKeyFromAi && !aiKeyFromGroq) aiMissingEnv.push('AI_API_KEY');
  if (!raw.AI_MODEL.trim() && !raw.GROQ_MODEL.trim()) aiMissingEnv.push('AI_MODEL');
}

if (aiProviderUnsupported) {
  console.error(
    `\n[config] AI_PROVIDER="${aiProviderRaw}" is not supported. Only "groq" (or "none" to disable) ` +
      `is implemented; the assistant will stay disabled. Set AI_PROVIDER=groq with a Groq key.\n`,
  );
}

export const env = {
  ...raw,
  isProd,
  isTest: raw.NODE_ENV === 'test',
  corsOrigins: csv(raw.CORS_ORIGINS),
  accessTokenTtlSeconds: 15 * 60,
  refreshTokenTtlMs: raw.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
  uploadDirAbs: path.resolve(process.cwd(), raw.UPLOAD_DIR),
  mediaTempDirAbs: path.resolve(process.cwd(), raw.MEDIA_TEMP_DIR),
  mediaSigningSecret: raw.MEDIA_SIGNING_SECRET || raw.ACCESS_TOKEN_SECRET,
  // The assistant is live only when a key is actually present. A provider
  // explicitly set to "none" wins over a leftover key, so disabling the
  // assistant does not require deleting the secret.
  aiEnabled: Boolean(aiKey),
  aiProvider: aiKey ? 'groq' : 'none',
  /** The value the operator wrote, kept so the UI can explain a rejection. */
  aiProviderRequested: aiProviderRaw,
  aiProviderUnsupported,
  groqApiKey: aiKey,
  groqModel: aiModel,
  searchApiKey: raw.SEARCH_API_KEY.trim(),
  searchEnabled: Boolean(raw.SEARCH_API_KEY.trim()),
  /** Names of the environment variables an operator still has to set. */
  aiMissingEnv,
  stunUrls: csv(raw.WEBRTC_STUN_URLS),
  turnUrls: csv(raw.WEBRTC_TURN_URLS),
  webrtcConfigured: csv(raw.WEBRTC_TURN_URLS).length > 0 || csv(raw.WEBRTC_STUN_URLS).length > 0,
};

if (isProd && !aiKey) {
  // Not fatal: the platform works without the assistant. The API answers 501
  // with an explicit message rather than pretending a model replied.
  console.warn('[config] AI_API_KEY is not set — the AI Study Assistant will report itself as not configured.');
}

export type Env = typeof env;
