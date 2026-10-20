import { defineConfig } from 'vitest/config';
import { WxtVitest } from 'wxt/testing';

// Integration tests against a real Logseq desktop app.
// See tests/integration/global-setup.ts and .github/workflows/integration.yml.
export default defineConfig({
  plugins: [WxtVitest()],
  test: {
    include: ['tests/integration/**/*.test.ts'],
    globalSetup: ['tests/integration/global-setup.ts'],
    testTimeout: 60_000,
    hookTimeout: 300_000,
    // One Logseq instance is shared, keep tests sequential.
    fileParallelism: false,
  },
});
