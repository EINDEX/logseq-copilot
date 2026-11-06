import { defineConfig } from '@playwright/test';
import path from 'node:path';

// Live site check: the E2E build on the real result pages of the built-in
// search engines, against a real Logseq (the E2E global setup). Not part of
// `pnpm test:e2e`; `pnpm test:live` runs it, daily on CI
// (.github/workflows/site-check.yml). See ../README.md, "Live site check".
const ROOT = path.resolve(__dirname, '../../..');

// The sites answer HeadlessChrome with captchas and challenge pages; a
// headed browser gets the result pages (under xvfb-run on Linux).
// `E2E_HEADED=` (empty) runs headless anyway.
process.env.E2E_HEADED ??= '1';

export default defineConfig<{ fixtureSites: boolean }>({
  testDir: __dirname,
  testMatch: '*.live.ts',
  globalSetup: require.resolve('../global-setup'),
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  // A broken or degraded site gets a second look in a fresh profile.
  retries: 1,
  timeout: 240_000,
  globalTimeout: 25 * 60_000,
  // Failure traces stay out of the uploaded report: they hold the pages'
  // requests, and could hold the Kagi sign-in request.
  outputDir: path.join(ROOT, 'test-results/site-check-runs'),
  projects: [
    // The real sites: no fixture routes, no request is aborted.
    { name: 'chromium', use: { browserName: 'chromium', fixtureSites: false } },
  ],
  reporter: [['list'], [path.join(__dirname, 'report.ts')]],
});
