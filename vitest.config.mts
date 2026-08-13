import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * R2 — the whole suite runs against mocks, so CI is free and never
 * rate-limited. No test may reach a real provider or a real database.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    env: {
      NODE_ENV: 'test',
      AI_PROVIDER: 'mock',
      SMS_PROVIDER: 'mock',
      STORAGE_PROVIDER: 'mock',
      PAYMENT_PROVIDER: 'mock',
      PUSH_PROVIDER: 'mock',
      QUEUE_PROVIDER: 'mock',
    },
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
});
