import { config } from 'dotenv';
import path from 'node:path';

// Tests must never touch development data, so a dedicated database is used.
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error';

config({ path: path.resolve(__dirname, '../../.env.test'), override: false });
config({ path: path.resolve(__dirname, '../../.env') });

const base = process.env.DATABASE_URL ?? '';
if (!base.includes('skillspring')) {
  throw new Error('DATABASE_URL is not set; cannot run integration tests.');
}

// Point at <database>_test, derived from the configured URL.
if (!process.env.DATABASE_URL_TEST) {
  const url = new URL(base);
  url.pathname = `${url.pathname.replace(/\/$/, '')}_test`;
  process.env.DATABASE_URL = url.toString();
} else {
  process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;
}

process.env.ACCESS_TOKEN_SECRET = process.env.ACCESS_TOKEN_SECRET ?? 'test_secret_0123456789abcdef0123456789abcdef';
process.env.PASSWORD_PEPPER = process.env.PASSWORD_PEPPER ?? 'test_pepper';
process.env.EMAIL_PROVIDER = 'disabled';
process.env.RATE_LIMIT_MAX = '100000';
process.env.AUTH_RATE_LIMIT_MAX = '100000';
