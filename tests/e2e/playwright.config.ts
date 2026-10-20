import { defineConfig } from '@playwright/test';
import path from 'node:path';

// Browser E2E tests: the built extension in Playwright's Chromium against a
// real Logseq (started once in global-setup.ts). See README.md.
const ROOT = path.resolve(__dirname, '../..');

export default defineConfig({
  testDir: __dirname,
  testMatch: '**/*.spec.ts',
  globalSetup: require.resolve('./global-setup'),
  // One Logseq instance is shared, keep tests sequential.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 90_000,
  expect: { timeout: 20_000 },
  // Hard stop for the whole run, so a stuck browser or Logseq never hangs CI.
  globalTimeout: 12 * 60_000,
  outputDir: path.join(ROOT, 'test-results/e2e'),
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: path.join(ROOT, 'playwright-report') }],
  ],
});
