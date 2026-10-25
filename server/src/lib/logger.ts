/**
 * Structured JSON logger with secret redaction.
 *
 * Rules enforced here:
 *  - passwords, tokens, cookies, authorization headers are never emitted
 *  - message bodies are truncated and marked, so private chat text does not land
 *    in logs at full length
 */

const REDACT_KEYS = [
  'password',
  'passwordhash',
  'passwordconfirm',
  'currentpassword',
  'newpassword',
  'token',
  'accesstoken',
  'refreshtoken',
  'tokenhash',
  'authorization',
  'cookie',
  'set-cookie',
  'secret',
  'apikey',
  'api_key',
  'pepper',
  'refreshTokenHash',
];

const BODY_KEYS = ['body', 'message', 'details', 'notes', 'comment', 'agenda'];

type Level = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const minLevel: Level = (() => {
  const raw = (process.env.LOG_LEVEL ?? '').toLowerCase();
  if (raw === 'debug' || raw === 'info' || raw === 'warn' || raw === 'error') return raw;
  return process.env.NODE_ENV === 'production' ? 'info' : 'debug';
})();

function redact(value: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
  if (depth > 6) return '[depth-limit]';
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') {
    // Bearer tokens and JWT-ish strings that leak in via messages
    return value.replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [redacted]');
  }
  if (typeof value !== 'object') return value;
  if (seen.has(value as object)) return '[circular]';
  seen.add(value as object);

  if (Array.isArray(value)) return value.slice(0, 50).map((v) => redact(v, depth + 1, seen));

  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    const lower = key.toLowerCase();
    if (REDACT_KEYS.includes(lower)) {
      out[key] = '[redacted]';
    } else if (BODY_KEYS.includes(lower) && typeof val === 'string') {
      out[key] = val.length > 120 ? `${val.slice(0, 120)}… [truncated ${val.length} chars]` : val;
    } else {
      out[key] = redact(val, depth + 1, seen);
    }
  }
  return out;
}

function emit(level: Level, msg: string, meta?: Record<string, unknown>) {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[minLevel]) return;
  const payload = {
    ts: new Date().toISOString(),
    level,
    msg,
    ...(meta ? (redact(meta) as Record<string, unknown>) : {}),
  };
  const line = JSON.stringify(payload);
  if (level === 'error') process.stderr.write(`${line}\n`);
  else process.stdout.write(`${line}\n`);
}

export const logger = {
  debug: (msg: string, meta?: Record<string, unknown>) => emit('debug', msg, meta),
  info: (msg: string, meta?: Record<string, unknown>) => emit('info', msg, meta),
  warn: (msg: string, meta?: Record<string, unknown>) => emit('warn', msg, meta),
  error: (msg: string, meta?: Record<string, unknown>) => emit('error', msg, meta),
  child: (base: Record<string, unknown>) => ({
    debug: (msg: string, meta?: Record<string, unknown>) => emit('debug', msg, { ...base, ...meta }),
    info: (msg: string, meta?: Record<string, unknown>) => emit('info', msg, { ...base, ...meta }),
    warn: (msg: string, meta?: Record<string, unknown>) => emit('warn', msg, { ...base, ...meta }),
    error: (msg: string, meta?: Record<string, unknown>) => emit('error', msg, { ...base, ...meta }),
  }),
};

export { redact };
