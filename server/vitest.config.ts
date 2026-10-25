import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['src/tests/**/*.test.ts'],
    // The integration suite shares one PostgreSQL database, so files run in
    // sequence to keep state predictable.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
    setupFiles: ['src/tests/setup.ts'],
  },
});
