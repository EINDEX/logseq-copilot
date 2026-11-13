/**
 * E2E coverage. With E2E_COVERAGE=true the E2E build is instrumented with
 * istanbul (wxt.config.ts): every extension context keeps its counters in
 * `globalThis.__coverage__`. The fixtures (fixtures.ts) read them before an
 * extension page closes and at the end of each test:
 *
 * - extension pages (options, sidepanel): evaluated in the page;
 * - background: evaluated in the service worker / event page;
 * - content scripts: `scripting.executeScript` from the background, which
 *   runs in the content scripts' world (Chromium isolated world, Firefox
 *   content script sandbox); the coverage build adds `scripting`.
 *
 * Each read is one JSON file in RAW_DIR; scripts/e2e-coverage-report.mjs
 * merges them into an lcov report. Counters of a context that is gone before
 * the read (a page navigated away, a restarted service worker) are lost.
 */
import fs from 'node:fs';
import path from 'node:path';

declare const chrome: typeof import('wxt/browser').browser;

export const COVERAGE_ENABLED = process.env.E2E_COVERAGE === 'true';

export const RAW_DIR = path.resolve(__dirname, '../../test-results/e2e-coverage/raw');

let count = 0;

/** Write one context's `__coverage__` (a JSON string, or null when there is none). */
export function saveCoverage(json: string | null | undefined, label: string) {
  if (!COVERAGE_ENABLED || !json || json === 'null') return;
  fs.mkdirSync(RAW_DIR, { recursive: true });
  const file = `${process.pid}-${Date.now()}-${count++}-${label.replace(/[^\w-]+/g, '_')}.json`;
  fs.writeFileSync(path.join(RAW_DIR, file), json);
}

/** Self-contained: runs inside an extension page or the background. */
export const readCoverage = () => {
  const coverage = (globalThis as { __coverage__?: unknown }).__coverage__;
  return coverage ? JSON.stringify(coverage) : null;
};

/**
 * Self-contained, runs in the background: `__coverage__` of the content
 * scripts in every tab and frame. Tabs without a content script (extension
 * pages, about:blank) fail or give null and are skipped.
 */
export const readContentCoverage = async () => {
  const results: string[] = [];
  for (const tab of await chrome.tabs.query({})) {
    if (tab.id === undefined || !/^https?:/.test(tab.url ?? '')) continue;
    try {
      const frames = await chrome.scripting.executeScript({
        target: { tabId: tab.id, allFrames: true },
        func: () => {
          const coverage = (globalThis as { __coverage__?: unknown }).__coverage__;
          return coverage ? JSON.stringify(coverage) : null;
        },
      });
      for (const frame of frames) if (typeof frame.result === 'string') results.push(frame.result);
    } catch {
      // No access to the tab (closing, error page).
    }
  }
  return results;
};
