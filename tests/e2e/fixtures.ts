/**
 * Playwright fixtures: a fresh browser profile per test with the built
 * extension loaded, the fixture sites routed, and helpers to configure the
 * extension and talk to Logseq. The same specs run in Chromium and Firefox
 * (Playwright projects, see playwright.config.ts); every browser difference
 * lives in the `ext` fixture.
 */
import {
  test as base,
  chromium,
  expect,
  firefox,
  type BrowserContext,
  type Page,
  type Worker,
} from '@playwright/test';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { createApiCaller, type LogseqVariant } from '../support/logseq-app';
import { FirefoxAddon, RdpClient, type FrameTarget } from './firefox-rdp';
import { routeFixtureSites } from './pages';

export { expect };

// `chrome` inside ext.evaluate() callbacks, which run in the extension's
// background context (Chromium service worker / Firefox event page; Firefox
// MV3 has promise-based `chrome.*` too).
declare const chrome: typeof import('wxt/browser').browser;

const ROOT = path.resolve(__dirname, '../..');

type BrowserName = 'chromium' | 'firefox';

/** `e2e`: WXT_E2E=true build (open shadow roots). `prod`: the packaged build. */
export const EXTENSION_DIRS = {
  chromium: {
    e2e: path.join(ROOT, '.output/chrome-mv3-e2e'),
    prod: path.join(ROOT, '.output/chrome-mv3'),
  },
  firefox: {
    e2e: path.join(ROOT, '.output/firefox-mv3-e2e'),
    prod: path.join(ROOT, '.output/firefox-mv3'),
  },
} as const;
export type ExtensionBuild = keyof (typeof EXTENSION_DIRS)['chromium'];

/** browser_specific_settings.gecko.id in wxt.config.ts. */
const GECKO_ID = '{dbe73d0a-f6b8-474a-ad39-0d46a07e4525}';
/**
 * Fixed moz-extension:// host for the tests (Firefox picks a random one per
 * profile otherwise), set through `extensions.webextensions.uuids`.
 */
export const FIREFOX_UUID = '6b0f2e0c-1f6e-4b8e-9b55-1c0d5e2a7a11';

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

/**
 * An extension page (options tab, toolbar popup). Playwright drives these in
 * Chromium; in Firefox it cannot attach to moz-extension:// documents, so the
 * same calls run as DOM scripts over the remote debugging protocol (untrusted
 * events: `click()`, value setter + `input`, synthetic key events).
 */
export interface ExtPage {
  /** Wait until the page shows `text` (case-insensitive substring, or RegExp). */
  expectText: (text: string | RegExp, options?: { timeout?: number }) => Promise<void>;
  hasText: (text: string | RegExp) => Promise<boolean>;
  /** Wait for a visible button whose accessible name matches. */
  expectButton: (name: string | RegExp) => Promise<void>;
  /** Click the first visible button whose accessible name matches. */
  clickButton: (name: string | RegExp) => Promise<void>;
  /** Fill the `nth` element matching the CSS selector. */
  fill: (selector: string, value: string, nth?: number) => Promise<void>;
  press: (selector: string, key: 'Enter', nth?: number) => Promise<void>;
  click: (selector: string) => Promise<void>;
  /** Checked state of a checkbox (`aria-checked` or `checked`). */
  isChecked: (selector: string) => Promise<boolean>;
  close: () => Promise<void>;
}

export interface Extension {
  browser: BrowserName;
  /** chrome-extension:// or moz-extension:// host. */
  id: string;
  url: (page: string) => string;
  /**
   * Run `fn(arg)` in the extension's background context and return the
   * result (self-contained function, JSON-serializable argument and result).
   */
  evaluate: <R, A = undefined>(fn: (arg: A) => R | Promise<R>, arg?: A) => Promise<R>;
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
  /** Make `page` the active tab of its window and focus the window. */
  activate: (page: Page) => Promise<void>;
  /** Open an extension page (e.g. `options.html#/settings`) in a new tab. */
  openPage: (page: string) => Promise<ExtPage>;
  /**
   * Open the toolbar popup for `target`, the way the toolbar button would.
   *
   * Chromium: the real action popup (chrome.action.openPopup) is not exposed
   * to Playwright as a page, and opening popup.html as a tab makes that tab
   * the active one, so Popup.tsx would see its own URL. Instead the popup
   * goes into its own unfocused window: `tabs.query({ active: true,
   * lastFocusedWindow: true })` keeps returning `target`.
   *
   * Firefox: the real popup panel, `action.openPopup({ windowId })` (allowed
   * without a user gesture by `extensions.openPopupWithoutUserGesture.enabled`).
   */
  openPopup: (target: Page) => Promise<ExtPage>;
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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function freePort() {
  return new Promise<number>((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as net.AddressInfo;
      server.close(() => resolve(port));
    });
  });
}

/** Firefox only: the debugger connection and the test page, per context. */
interface FirefoxSession {
  client: RdpClient;
  addon: FirefoxAddon;
  page?: Page;
}
const firefoxSessions = new WeakMap<BrowserContext, FirefoxSession>();

async function launchChromium(extensionPath: string, userDataDir: string) {
  return chromium.launchPersistentContext(userDataDir, {
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
}

/**
 * Playwright's Firefox has no extension loading option: start its debugger
 * server, then install the build as a temporary add-on over RDP
 * (installFirefoxAddon), like `web-ext run` and about:debugging do.
 */
async function launchFirefox(userDataDir: string) {
  const port = await freePort();
  const context = await firefox.launchPersistentContext(userDataDir, {
    headless: !process.env.E2E_HEADED,
    viewport: { width: 1400, height: 900 },
    args: ['-start-debugger-server', String(port)],
    firefoxUserPrefs: {
      'devtools.debugger.remote-enabled': true,
      'devtools.debugger.prompt-connection': false,
      'devtools.chrome.enabled': true,
      'extensions.webextensions.uuids': JSON.stringify({ [GECKO_ID]: FIREFOX_UUID }),
      'extensions.openPopupWithoutUserGesture.enabled': true,
      // Keep the event page alive for the whole test: ext.evaluate() talks
      // to it (default idle timeout is 30 s).
      'extensions.background.idle.timeout': 3_600_000,
    },
  });
  return { context, port };
}

/**
 * Must run after every context-wide Playwright setup (routes, tracing): a
 * moz-extension:// tab is a page Juggler never attaches to, so context-wide
 * commands wait forever on it, and installing opens the options tab.
 */
async function installFirefoxAddon(context: BrowserContext, port: number, extensionPath: string) {
  const client = await RdpClient.connect(port);
  try {
    const addon = await FirefoxAddon.install(client, extensionPath);
    if (addon.id !== GECKO_ID) throw new Error(`installed ${addon.id}, expected ${GECKO_ID}`);
    firefoxSessions.set(context, { client, addon });
  } catch (e) {
    client.close();
    throw e;
  }
}

/**
 * Firefox ExtPage: polls DOM scripts in the document's console actor. All
 * the logic is in one self-contained function because it is sent as source.
 */
function rdpExtPage(addon: FirefoxAddon, target: FrameTarget, onClose: () => Promise<void>): ExtPage {
  type Action =
    | { op: 'hasText'; text?: string; re?: [string, string] }
    | { op: 'button'; text?: string; re?: [string, string]; click: boolean }
    | { op: 'fill'; selector: string; nth: number; value: string }
    | { op: 'press'; selector: string; nth: number; key: string }
    | { op: 'click'; selector: string }
    | { op: 'isChecked'; selector: string };
  const run = (action: Action) =>
    addon.client.evaluate(
      target.consoleActor,
      (a: Action): boolean | null => {
        const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
        const matches = (s: string) => {
          if ('re' in a && a.re) return new RegExp(a.re[0], a.re[1]).test(norm(s));
          return 'text' in a && !!a.text && norm(s).toLowerCase().includes(a.text.toLowerCase());
        };
        const visible = (el: Element) => (el as HTMLElement).checkVisibility?.() ?? el.getClientRects().length > 0;
        const nth = (selector: string, n: number) => document.querySelectorAll<HTMLElement>(selector)[n];
        switch (a.op) {
          case 'hasText':
            return matches(document.body?.innerText ?? '');
          case 'button': {
            const button = [...document.querySelectorAll<HTMLElement>('button, [role="button"]')]
              .filter(visible)
              .find((b) => matches(b.getAttribute('aria-label') || b.innerText || ''));
            if (button && a.click) button.click();
            return !!button;
          }
          case 'fill': {
            const el = nth(a.selector, a.nth) as HTMLInputElement | undefined;
            if (!el) return false;
            el.focus();
            const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
            // React tracks the value: go through the native setter, then
            // fire `input` so onChange runs.
            Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, a.value);
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
            return true;
          }
          case 'press': {
            const el = nth(a.selector, a.nth);
            if (!el) return false;
            el.focus();
            for (const type of ['keydown', 'keypress', 'keyup']) {
              const init = { key: a.key, code: a.key, keyCode: 13, which: 13, charCode: type === 'keypress' ? 13 : 0 };
              el.dispatchEvent(new KeyboardEvent(type, { ...init, bubbles: true, cancelable: true }));
            }
            return true;
          }
          case 'click': {
            const el = [...document.querySelectorAll<HTMLElement>(a.selector)].find(visible);
            el?.click();
            return !!el;
          }
          case 'isChecked': {
            const el = document.querySelector<HTMLInputElement>(a.selector);
            if (!el) return null;
            return el.getAttribute('aria-checked') === 'true' || el.checked === true;
          }
        }
      },
      action,
    );
  const textArg = (text: string | RegExp) =>
    typeof text === 'string' ? { text } : { re: [text.source, text.flags] as [string, string] };
  /** Retry `action` until it reports true, like Playwright's auto-waiting. */
  const until = async (label: string, action: Action, timeout = 20_000) => {
    const deadline = Date.now() + timeout;
    for (;;) {
      if (await run(action)) return;
      if (Date.now() > deadline) throw new Error(`${label} (${target.url}) timed out after ${timeout} ms`);
      await sleep(200);
    }
  };
  return {
    expectText: (text, options) => until(`expectText ${text}`, { op: 'hasText', ...textArg(text) }, options?.timeout),
    hasText: async (text) => !!(await run({ op: 'hasText', ...textArg(text) })),
    expectButton: (name) => until(`expectButton ${name}`, { op: 'button', ...textArg(name), click: false }),
    clickButton: (name) => until(`clickButton ${name}`, { op: 'button', ...textArg(name), click: true }),
    fill: (selector, value, nth = 0) => until(`fill ${selector}`, { op: 'fill', selector, nth, value }),
    press: (selector, key, nth = 0) => until(`press ${selector}`, { op: 'press', selector, nth, key }),
    click: (selector) => until(`click ${selector}`, { op: 'click', selector }),
    isChecked: async (selector) => {
      const checked = await run({ op: 'isChecked', selector });
      if (checked === null) throw new Error(`isChecked: no ${selector} in ${target.url}`);
      return checked;
    },
    close: async () => {
      await onClose();
      await addon.waitGone(target);
    },
  };
}

/** Chromium ExtPage: plain Playwright locators. */
function playwrightExtPage(page: Page): ExtPage {
  return {
    expectText: (text, options) => expect(page.getByText(text)).toBeVisible(options),
    hasText: (text) => page.getByText(text).isVisible(),
    expectButton: (name) => expect(page.getByRole('button', { name })).toBeVisible(),
    clickButton: (name) => page.getByRole('button', { name }).first().click(),
    fill: (selector, value, nth = 0) => page.locator(selector).nth(nth).fill(value),
    press: (selector, key, nth = 0) => page.locator(selector).nth(nth).press(key),
    click: (selector) => page.locator(selector).click(),
    isChecked: (selector) => page.locator(selector).isChecked(),
    close: () => page.close(),
  };
}

/** Firefox: close every moz-extension:// tab (options tabs, the popup has no tab). */
async function closeExtensionTabs(context: BrowserContext) {
  const session = firefoxSessions.get(context);
  if (!session) return;
  const background = session.addon.find(`moz-extension://${FIREFOX_UUID}/_generated_background_page.html`);
  if (!background) return;
  await session.client.evaluate(
    background.consoleActor,
    async (base) => {
      const tabs = await chrome.tabs.query({});
      const ids = tabs.filter((t) => t.url?.startsWith(base)).map((t) => t.id!);
      if (ids.length) await chrome.tabs.remove(ids);
      return ids.length;
    },
    `moz-extension://${FIREFOX_UUID}/`,
  );
}

export const test = base.extend<Fixtures>({
  extensionBuild: ['e2e', { option: true }],

  articles: async ({}, use) => {
    await use(new Map());
  },

  context: async ({ browserName, extensionBuild, articles }, use, testInfo) => {
    if (browserName !== 'chromium' && browserName !== 'firefox') {
      throw new Error(`no E2E support for ${browserName}`);
    }
    const extensionPath = EXTENSION_DIRS[browserName][extensionBuild];
    if (!fs.existsSync(path.join(extensionPath, 'manifest.json'))) {
      throw new Error(`${extensionPath} is missing; run \`pnpm test:e2e\` (it builds first)`);
    }
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), `copilot-e2e-${browserName}-`));
    const launched =
      browserName === 'chromium'
        ? { context: await launchChromium(extensionPath, userDataDir) }
        : await launchFirefox(userDataDir);
    const { context } = launched;
    // Fail a stuck action quickly instead of at the test timeout.
    context.setDefaultTimeout(15_000);
    await context.tracing.start({ screenshots: true, snapshots: true });
    await routeFixtureSites(context, articles);
    if ('port' in launched) {
      await installFirefoxAddon(context, launched.port, extensionPath).catch(async (e) => {
        await withTimeout(context.close(), 15_000);
        throw e;
      });
    }

    await use(context);

    // Extension tabs left open would stall tracing.stop() and close() (see
    // installFirefoxAddon).
    await withTimeout(closeExtensionTabs(context), 5_000);

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
    firefoxSessions.get(context)?.client.close();
    await withTimeout(context.close(), 15_000);
    fs.rmSync(userDataDir, { recursive: true, force: true, maxRetries: 3 });
  },

  ext: async ({ context, browserName }, use) => {
    const info = logseqInfo();
    const connect: Extension['connect'] = (overrides = {}) =>
      ext.setStorage({
        logseqHostName: info.host,
        logseqPort: info.port,
        logseqAuthToken: overrides.token ?? info.token,
        enableClipNoteFloatButton: overrides.enableClipNoteFloatButton ?? false,
      });
    const tabOf = async (page: Page) => {
      const tab = await ext.evaluate(async (url) => {
        const tabs = await chrome.tabs.query({});
        const tab = tabs.find((t) => t.url === url);
        return tab && { id: tab.id!, windowId: tab.windowId! };
      }, page.url());
      if (!tab) throw new Error(`no tab for ${page.url()}`);
      return tab;
    };
    const common = {
      setStorage: (items: Record<string, unknown>) =>
        ext.evaluate((items) => chrome.storage.local.set(items), items),
      getStorage: (key: string) =>
        ext.evaluate(async (key) => (await chrome.storage.local.get(key))[key], key),
      connect,
      sendToTab: async (page: Page, type: string) => {
        // The `clip` shortcut is pressed in the focused window, and the
        // background clips `tabs.query({ active, currentWindow })`. Firefox
        // does not move focus to a page Playwright opens or navigates.
        await common.activate(page);
        const { id: tabId } = await tabOf(page);
        // Retry until the content script has registered its listeners
        // ("Receiving end does not exist" before that).
        await expect(async () => {
          await ext.evaluate(
            async ({ tabId, type }) => {
              await chrome.tabs.sendMessage(tabId, { id: Date.now(), type, data: undefined, timestamp: Date.now() });
            },
            { tabId, type },
          );
        }).toPass({ timeout: 10_000 });
      },
      activate: async (page: Page) => {
        const tab = await tabOf(page);
        await ext.evaluate(async ({ id, windowId }) => {
          await chrome.tabs.update(id, { active: true });
          await chrome.windows.update(windowId, { focused: true });
        }, tab);
      },
    };
    let ext: Extension;

    if (browserName === 'chromium') {
      let [worker]: Worker[] = context.serviceWorkers();
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

      ext = {
        browser: 'chromium',
        id,
        url: (page) => `chrome-extension://${id}/${page}`,
        evaluate: (fn, arg) => worker.evaluate(fn as any, arg),
        ...common,
        openPage: async (path) => {
          const page = await context.newPage();
          await page.goto(ext.url(path));
          return playwrightExtPage(page);
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
          return playwrightExtPage(popup);
        },
      };
    } else {
      const session = firefoxSessions.get(context)!;
      const { addon, client } = session;
      const base = `moz-extension://${FIREFOX_UUID}/`;
      const background = await addon.waitFor(`${base}_generated_background_page.html`);
      /** Wait for an extension document that was not there before `open()`. */
      const openTarget = async (prefix: string, open: () => Promise<unknown>) => {
        const before = new Set(addon.targets.keys());
        await open();
        const deadline = Date.now() + 15_000;
        for (;;) {
          const target = [...addon.targets.values()].find((t) => !before.has(t.actor) && t.url.startsWith(prefix));
          if (target) return target;
          if (Date.now() > deadline) throw new Error(`${prefix} did not open`);
          await sleep(100);
        }
      };

      ext = {
        browser: 'firefox',
        id: FIREFOX_UUID,
        url: (page) => `${base}${page}`,
        evaluate: (fn, arg) => client.evaluate(background.consoleActor, fn, arg),
        ...common,
        openPage: async (path) => {
          let tabId: number | undefined;
          const target = await openTarget(ext.url(path.replace(/[?#].*/, '')), async () => {
            tabId = await ext.evaluate(async (url) => (await chrome.tabs.create({ url, active: true })).id!, ext.url(path));
          });
          return rdpExtPage(addon, target, () =>
            ext.evaluate(async (tabId) => {
              await chrome.tabs.remove(tabId);
            }, tabId!),
          );
        },
        openPopup: async (page) => {
          const { windowId } = await tabOf(page);
          await ext.activate(page);
          const target = await openTarget(ext.url('popup.html'), () =>
            ext.evaluate((windowId) => chrome.action.openPopup({ windowId }), windowId),
          );
          // Closing the panel is the popup's own window.close() (Popup.tsx
          // does the same); deferred so the evaluation can still answer.
          return rdpExtPage(addon, target, () =>
            client.evaluate(target.consoleActor, () => {
              setTimeout(() => window.close(), 0);
            }),
          );
        },
      };

      // Test page first: the install-time options tab reuses the initial
      // about:blank tab (a page Playwright can no longer drive), and closing
      // the last tab would close the browser.
      session.page = await context.newPage();
      const optionsOpened = () =>
        ext.evaluate(
          async (url) => (await chrome.tabs.query({})).some((t) => t.url?.startsWith(url)),
          ext.url('options.html'),
        );
      await expect.poll(optionsOpened, { timeout: 10_000 }).toBe(true).catch(() => {});
      await closeExtensionTabs(context);
    }
    await use(ext);
  },

  page: async ({ context, ext: _ext }, use) => {
    // Depends on `ext` so the install-time options tab is gone already.
    const page =
      firefoxSessions.get(context)?.page ?? context.pages()[0] ?? (await context.newPage());
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
