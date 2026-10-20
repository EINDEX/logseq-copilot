import { defineConfig } from 'vitest/config';
import { WxtVitest } from 'wxt/testing';

// Unit tests. Integration tests live in tests/integration and use
// vitest.integration.config.ts.
export default defineConfig({
  plugins: [WxtVitest()],
  test: {
    environment: 'happy-dom',
    include: ['src/**/*.test.{ts,tsx}'],
    exclude: [
      'tests/integration/**',
      'node_modules/**',
      '.output/**',
      '.wxt/**',
    ],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/components/ui/**'],
      reporter: ['json-summary', 'text', 'lcov'],
    },
  },
});
