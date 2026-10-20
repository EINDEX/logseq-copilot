/**
 * Playwright fixtures: a fresh Chromium profile per test with the built
 * extension loaded, the fixture sites routed, and helpers to configure the
 * extension and talk to Logseq.
 */
import {
  test as base,
  chromium,
  expect,
  type BrowserContext,
  type Page,
  type Worker,
} from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApiCaller, type LogseqVariant } from '../support/logseq-app';
import { routeFixtureSites } from './pages';

export { expect };

// `chrome` inside worker.evaluate() callbacks, which run in the extension's
// service worker.
declare const chrome: typeof import('wxt/browser').browser;

const ROOT = path.resolve(__dirname, '../..');

/** `e2e`: WXT_E2E=true build (open shadow roots). `prod`: the packaged build. */
export const EXTENSION_DIRS = {
  e2e: path.join(ROOT, '.output/chrome-mv3-e2e'),
  prod: path.join(ROOT, '.output/chrome-mv3'),
} as const;
export type ExtensionBuild = keyof typeof EXTENSION_DIRS;

export interface LogseqInfo {
  variant: LogseqVariant;
  host: string;
  port: number;
  token: string;
  apiUrl: string;
  graph: string;
  version: string;
}

export function logseqInfo(): LogseqInfo {
  const raw = process.env.E2E_LOGSEQ;
  if (!raw) throw new Error('E2E_LOGSEQ is not set; run through playwright.config.ts');
  return JSON.parse(raw);
}

export interface Logseq extends LogseqInfo {
  isDB: boolean;
  callApi: (method: string, args?: unknown[]) => Promise<any>;
  /** Blocks whose content contains `text` (Logseq simple query, no search index). */
  findBlocks: (text: string) => Promise<any[]>;
  /** Create a TODO task block on the test page, in the graph's native format. */
  createTask: (text: string) => Promise<string>;
  /** TODO / DONE / ... of a block, read the way the graph stores it. */
  taskMarker: (uuid: string) => Promise<string>;
}

export interface Extension {
  id: string;
  worker: Worker;
  url: (page: string) => string;
  setStorage: (items: Record<string, unknown>) => Promise<void>;
  getStorage: (key: string) => Promise<any>;
  /** Point the extension at the test Logseq (host/port/token as in options). */
  connect: (overrides?: { token?: string; enableClipNoteFloatButton?: boolean }) => Promise<void>;
  /**
   * Send a content-script message exactly like the background does, e.g.
   * `content:quickCapture` from the `clip` command handler (webext-core
   * messaging format: { id, type, data, timestamp }).
   */
  sendToTab: (page: Page, type: string) => Promise<void>;
  /** Make `page` the active tab of its window. */
  activate: (page: Page) => Promise<void>;
  /**
   * Open popup.html for `target`, the way the toolbar button would.
   *
   * The real action popup (chrome.action.openPopup) is not exposed to
   * Playwright as a page, and opening popup.html as a tab makes that tab the
   * active one, so Popup.tsx would see its own URL. Instead the popup goes
   * into its own unfocused window: `tabs.query({ active: true,
   * lastFocusedWindow: true })` keeps returning `target`.
   */
  openPopup: (target: Page) => Promise<Page>;
}

type Fixtures = {
  extensionBuild: ExtensionBuild;
  context: BrowserContext;
  page: Page;
  ext: Extension;
  logseq: Logseq;
  /** Article pages served on https://example.com, keyed by URL. */
  articles: Map<string, { title: string; paragraph: string }>;
};

async function withTimeout<T>(promise: Promise<T>, ms: number) {
  let timer: NodeJS.Timeout | undefined;
  await Promise.race([
    promise.catch(() => {}),
    new Promise((r) => (timer = setTimeout(r, ms))),
  ]);
  clearTimeout(timer);
}

export const test = base.extend<Fixtures>({
  extensionBuild: ['e2e', { option: true }],

  articles: async ({}, use) => {
    await use(new Map());
  },

  context: async ({ extensionBuild, articles }, use, testInfo) => {
    const extensionPath = EXTENSION_DIRS[extensionBuild];
    if (!fs.existsSync(path.join(extensionPath, 'manifest.json'))) {
      throw new Error(`${extensionPath} is missing; run \`pnpm test:e2e\` (it builds first)`);
    }
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'copilot-e2e-chromium-'));
    const context = await chromium.launchPersistentContext(userDataDir, {
      // The full Chromium build; its new headless mode supports extensions
      // (the default headless shell does not).
      channel: 'chromium',
      headless: !process.env.E2E_HEADED,
      viewport: { width: 1400, height: 900 },
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
      ],
    });
    // Fail a stuck action quickly instead of at the test timeout.
    context.setDefaultTimeout(15_000);
    await context.tracing.start({ screenshots: true, snapshots: true });
    await routeFixtureSites(context, articles);

    await use(context);

    const failed = testInfo.status !== testInfo.expectedStatus;
    if (failed) {
      for (const [i, page] of context.pages().entries()) {
        const file = testInfo.outputPath(`page-${i}.png`);
        if (await page.screenshot({ path: file, timeout: 5_000 }).catch(() => null)) {
          await testInfo.attach(`page-${i} ${page.url()}`, { path: file, contentType: 'image/png' });
        }
      }
      const trace = testInfo.outputPath('trace.zip');
      await context.tracing.stop({ path: trace }).catch(() => {});
      if (fs.existsSync(trace)) {
        await testInfo.attach('trace', { path: trace, contentType: 'application/zip' });
      }
    } else {
      await context.tracing.stop().catch(() => {});
    }
    await withTimeout(context.close(), 15_000);
    fs.rmSync(userDataDir, { recursive: true, force: true });
  },

  ext: async ({ context }, use) => {
    let [worker] = context.serviceWorkers();
    if (!worker) worker = await context.waitForEvent('serviceworker');
    const id = new URL(worker.url()).host;

    // A fresh install opens the options page; close it so it does not steal
    // the active tab from the page under test.
    const optionsUrl = `chrome-extension://${id}/options.html`;
    await expect
      .poll(() => context.pages().some((p) => p.url().startsWith(optionsUrl)), { timeout: 10_000 })
      .toBe(true)
      .catch(() => {});
    for (const p of context.pages()) {
      if (p.url().startsWith(optionsUrl)) await p.close();
    }

    const info = logseqInfo();
    const tabIdOf = async (page: Page) => {
      const url = page.url();
      const tabId = await worker.evaluate(async (url) => {
        const tabs = await chrome.tabs.query({});
        return tabs.find((t) => t.url === url)?.id;
      }, url);
      if (tabId === undefined) throw new Error(`no tab for ${url}`);
      return tabId;
    };

    const ext: Extension = {
      id,
      worker,
      url: (page) => `chrome-extension://${id}/${page}`,
      setStorage: (items) => worker.evaluate((items) => chrome.storage.local.set(items), items),
      getStorage: (key) =>
        worker.evaluate(async (key) => (await chrome.storage.local.get(key))[key], key),
      connect: (overrides = {}) =>
        ext.setStorage({
          logseqHostName: info.host,
          logseqPort: info.port,
          logseqAuthToken: overrides.token ?? info.token,
          enableClipNoteFloatButton: overrides.enableClipNoteFloatButton ?? false,
        }),
      sendToTab: async (page, type) => {
        const tabId = await tabIdOf(page);
        // Retry until the content script has registered its listeners
        // ("Receiving end does not exist" before that).
        await expect(async () => {
          await worker.evaluate(
            ({ tabId, type }) =>
              chrome.tabs.sendMessage(tabId, { id: Date.now(), type, data: undefined, timestamp: Date.now() }),
            { tabId, type },
          );
        }).toPass({ timeout: 10_000 });
      },
      activate: async (page) => {
        const tabId = await tabIdOf(page);
        await worker.evaluate((tabId) => chrome.tabs.update(tabId, { active: true }), tabId);
      },
      openPopup: async (target) => {
        await ext.activate(target);
        await target.bringToFront();
        const popupPage = context.waitForEvent('page');
        await worker.evaluate(
          (url) => chrome.windows.create({ url, type: 'popup', focused: false, width: 420, height: 640 }),
          ext.url('popup.html'),
        );
        const popup = await popupPage;
        await popup.waitForLoadState('domcontentloaded');
        return popup;
      },
    };
    await use(ext);
  },

  page: async ({ context, ext: _ext }, use) => {
    // Depends on `ext` so the install-time options tab is gone already.
    const page = context.pages()[0] ?? (await context.newPage());
    await use(page);
  },

  logseq: async ({}, use) => {
    const info = logseqInfo();
    const callApi = createApiCaller(info.apiUrl, info.token);
    const isDB = info.variant === 'db';
    const testPage = 'Copilot Test Page';
    const logseq: Logseq = {
      ...info,
      isDB,
      callApi,
      findBlocks: async (text) => {
        const result = await callApi('logseq.DB.q', [`"${text.replaceAll('"', '\\"')}"`]);
        return Array.isArray(result) ? result : [];
      },
      createTask: async (text) => {
        if (!isDB) {
          const block = await callApi('logseq.Editor.appendBlockInPage', [testPage, `TODO ${text}`]);
          return block.uuid;
        }
        // DB graphs keep the task state in the status property, not a prefix.
        const block = await callApi('logseq.Editor.appendBlockInPage', [testPage, text]);
        await callApi('logseq.Editor.upsertBlockProperty', [block.uuid, 'logseq.property/status', 'Todo']);
        return block.uuid;
      },
      taskMarker: async (uuid) => {
        const block = await callApi('logseq.Editor.getBlock', [uuid]);
        if (!isDB) return block?.marker ?? '';
        const ident: string | undefined = block?.[':logseq.property/status']?.ident;
        return ident?.replace(':logseq.property/status.', '').toUpperCase() ?? '';
      },
    };
    await use(logseq);
  },
});

/** A value that is unique per test run, safe to search for in Logseq. */
export const nonce = (label: string) =>
  `e2e${label}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
