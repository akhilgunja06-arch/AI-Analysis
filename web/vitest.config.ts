import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

// Test settings live here so vite.config.ts stays a plain Vite config. Vitest
// bundles its own copy of Vite, so keeping the two type surfaces apart avoids a
// false type conflict between their UserConfig definitions.
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./src/tests/setup.ts'],
      include: ['src/**/*.test.{ts,tsx}'],
      css: false,
    },
  }),
);
