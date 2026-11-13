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
      // Keep in sync with `ignore` in codecov.yml (reasons there).
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/components/ui/**',
        'src/types/highlight.ts',
        'src/types/logseqBlock.ts',
        'src/types/recall.ts',
        'src/entrypoints/background/logseq/interfaces.ts',
        'src/config.ts',
        'src/utils/index.ts',
        'src/entrypoints/options/index.tsx',
        'src/entrypoints/sidepanel/main.tsx',
      ],
      reporter: ['json-summary', 'text', 'lcov'],
    },
  },
});
