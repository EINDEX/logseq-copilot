/**
 * UI screenshots for review, not a visual regression test: every options
 * page, the popup, the browser sidebar page and the in-page UI (search engine
 * sidebar, page highlight and float button, highlight comment popup) in light
 * and dark, against the seeded Logseq. The tests only assert that the key
 * elements are visible.
 *
 * Output: test-results/ui-screenshots/<name>-<light|dark>.png (uploaded by
 * CI as the `ui-screenshots-<variant>` artifact on every run). Runs on
 * Chromium with the file graph only, so the matrix does not take the same
 * pictures twice.
 */
import path from 'node:path';
import type { Locator, Page } from '@playwright/test';
import { expect, logseqInfo, nonce, test } from './fixtures';
import { googleUrl } from './pages';

const OUT_DIR = path.resolve(__dirname, '../../test-results/ui-screenshots');
const VIEWPORT = { width: 1440, height: 900 };
const SCHEMES = ['light', 'dark'] as const;
type Scheme = (typeof SCHEMES)[number];

test.skip(({ browserName }) => browserName !== 'chromium', 'screenshots are taken on Chromium only');
test.skip(() => logseqInfo().variant !== 'file', 'screenshots are taken with the file graph only');

const file = (name: string, scheme: Scheme) => path.join(OUT_DIR, `${name}-${scheme}.png`);

const shoot = async (
  target: Page | Locator,
  name: string,
  scheme: Scheme,
  clip?: { x: number; y: number; width: number; height: number },
) => {
  const options = { path: file(name, scheme), animations: 'disabled', caret: 'hide' } as const;
  if ('goto' in target && clip) {
    await target.screenshot({ ...options, clip });
  } else if ('goto' in target) {
    // No hover state on whatever the last click left the pointer over.
    await target.mouse.move(VIEWPORT.width - 1, VIEWPORT.height - 1);
    await target.screenshot({ ...options, fullPage: true });
  } else {
    await target.screenshot(options);
  }
};

/** Extension pages follow prefers-color-scheme. */
const setScheme = (page: Page, scheme: Scheme) => page.emulateMedia({ colorScheme: scheme });

/**
 * Host page theme for the in-page UI: theme-detection reads the html class
 * and, on Google, the body background.
 */
const setPageTheme = (page: Page, scheme: Scheme) =>
  page.evaluate((dark) => {
    document.documentElement.classList.toggle('dark', dark);
    document.documentElement.classList.toggle('light', !dark);
    document.body.style.background = dark ? 'rgb(32, 33, 36)' : 'rgb(255, 255, 255)';
    document.body.style.color = dark ? 'rgb(232, 234, 237)' : 'rgb(32, 33, 36)';
  }, scheme === 'dark');

const expectTheme = (host: Locator, scheme: Scheme) =>
  scheme === 'dark'
    ? expect(host.locator('[data-theme-container]').first()).toHaveClass(/\bdark\b/)
    : expect(host.locator('[data-theme-container]').first()).not.toHaveClass(/\bdark\b/);

const selectParagraph = (page: Page) =>
  page.evaluate(() => {
    const range = document.createRange();
    range.selectNodeContents(document.getElementById('target')!);
    getSelection()!.removeAllRanges();
    getSelection()!.addRange(range);
  });

/** Highlights on other sites, so the options list has more than one host. */
const seededHighlights = () => {
  const now = Date.now();
  const make = (i: number, url: string, title: string, text: string, extra: object = {}) => ({
    id: `ui-shot-${i}`,
    url,
    title,
    hostname: new URL(url).hostname,
    range: {
      startContainerXPath: '/html/body/p[1]/text()[1]',
      endContainerXPath: '/html/body/p[1]/text()[1]',
      startOffset: 0,
      endOffset: text.length,
      textContent: text,
    },
    createdAt: now - i * 26 * 60 * 60 * 1000,
    lastAccessedAt: now - i * 60 * 60 * 1000,
    color: 'yellow',
    ...extra,
  });
  return [
    make(1, 'https://developer.mozilla.org/en-US/docs/Web/API/CSS_Custom_Highlight_API', 'CSS Custom Highlight API - Web APIs | MDN',
      'The CSS Custom Highlight API provides a mechanism for styling arbitrary text ranges on a document by using JavaScript to create the ranges, and CSS to style them.',
      { note: 'Use this instead of wrapping text in spans.', tags: ['css', 'reading'] }),
    make(2, 'https://docs.logseq.com/#/page/http%20api', 'HTTP API - Logseq',
      'The HTTP APIs server listens on port 12315 by default and requires an authorization token for every request.',
      { tags: ['logseq'] }),
    make(9, 'https://en.wikipedia.org/wiki/Zettelkasten', 'Zettelkasten - Wikipedia',
      'A Zettelkasten consists of many individual notes with ideas and other short pieces of information that are taken down as they occur or are acquired.'),
  ];
};

test.describe('UI screenshots', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(VIEWPORT);
  });

  test('options pages', async ({ page, ext }) => {
    await ext.connect();
    await ext.setStorage({ highlights: seededHighlights() });

    for (const scheme of SCHEMES) {
      await setScheme(page, scheme);

      await page.goto(ext.url('options.html#/settings'));
      await expect(page.getByRole('button', { name: /Connected to Logseq v/ })).toBeVisible();
      await shoot(page, 'options-settings', scheme);

      await page.goto(ext.url('options.html#/search-engine'));
      await expect(page.getByText('Google', { exact: true }).first()).toBeVisible();
      await shoot(page, 'options-search-engine', scheme);

      await page.goto(ext.url('options.html#/recall-rules'));
      const githubRule = page.getByText('GitHub Pull Request', { exact: true }).first();
      await expect(githubRule).toBeVisible();
      await shoot(page, 'options-recall-rules', scheme);

      await page.getByRole('button', { name: 'Edit GitHub Pull Request' }).click();
      await expect(page.locator('#urlPattern')).toHaveValue('github\\.com.*/(pull|issues)/');
      await shoot(page, 'options-recall-rule-form', scheme);

      await page.goto(ext.url('options.html#/templates'));
      await expect(page.locator('#template-content')).toBeVisible();
      await shoot(page, 'options-templates', scheme);

      await page.goto(ext.url('options.html#/highlights'));
      await expect(page.getByText('HTTP API - Logseq')).toBeVisible();
      await shoot(page, 'options-highlights', scheme);
    }
  });

  test('popup with results', async ({ page, ext }) => {
    await ext.connect();
    await page.goto('https://example.com/copilot/article');

    for (const scheme of SCHEMES) {
      const popup = (await ext.openPopup(page)).page!;
      await setScheme(popup, scheme);
      await expect(popup.getByText('Reading notes from https://example.com/copilot/article')).toBeVisible();
      await shoot(popup.locator('#app-container > *').first(), 'popup', scheme);
      await popup.close();
    }
  });

  test('search engine sidebar', async ({ page, ext }) => {
    await ext.connect();
    await page.goto(googleUrl('copilot'));
    const host = page.locator('#rhs logseq-copilot-search-engine');
    await expect(host.getByText('Hello from copilot integration test')).toBeVisible();

    for (const scheme of SCHEMES) {
      await setPageTheme(page, scheme);
      await expectTheme(host, scheme);
      await shoot(page.locator('#main'), 'search-sidebar', scheme);
    }
  });

  test('page highlight, float button and comment popup', async ({ page, ext, articles }) => {
    const id = nonce('shot');
    const url = `https://example.com/e2e/${id}`;
    articles.set(url, {
      title: 'Notes on building a second brain',
      paragraph:
        'Capture what resonates, organize by project, distill to the essence and express it in your own words.',
    });

    // The float button is behind an option (off by default).
    await ext.connect({ enableClipNoteFloatButton: true });
    await page.goto(url);
    await expect(page.locator('logseq-copilot-popup')).toBeAttached();
    await selectParagraph(page);
    await ext.sendToTab(page, 'content:quickCapture');
    const stored = async () =>
      ((await ext.getStorage('highlights')) ?? []).filter((h: any) => h.url === url);
    await expect.poll(async () => (await stored()).length).toBe(1);
    const [highlight] = await stored();
    await ext.setStorage({
      highlights: [{ ...highlight, note: 'Good summary of the CODE method.', tags: ['pkm'] }],
    });

    await page.reload();
    await expect.poll(() => page.evaluate(() => CSS.highlights.size)).toBeGreaterThan(0);
    const popupHost = page.locator('logseq-copilot-popup');

    for (const scheme of SCHEMES) {
      await setPageTheme(page, scheme);
      await expectTheme(popupHost, scheme);

      // The saved highlight on the page and the float button after a mouse
      // selection of the next paragraph.
      const other = (await page.locator('p').nth(1).boundingBox())!;
      await page.mouse.move(other.x + 1, other.y + other.height / 2);
      await page.mouse.down();
      await page.mouse.move(other.x + other.width * 0.6, other.y + other.height / 2, { steps: 5 });
      await page.mouse.up();
      const floatButton = popupHost.locator('img.quickCapture');
      await expect(floatButton).toBeVisible();
      await shoot(page, 'page-highlight-float-button', scheme, { x: 0, y: 0, width: 960, height: 240 });
      // A click on other text clears the selection and hides the button.
      await page.locator('h1').click();
      await expect(floatButton).toBeHidden();

      const box = await page.locator('#target').boundingBox();
      await page.mouse.click(box!.x + 20, box!.y + box!.height / 2);
      const popup = popupHost.locator('[data-highlight-popup]');
      await expect(popup).toContainText('Good summary of the CODE method.');
      await shoot(popup, 'highlight-popup', scheme);
      await page.keyboard.press('Escape');
      await expect(popup).toHaveCount(0);
    }
  });

  test('browser sidebar page', async ({ page, ext }) => {
    // The real sidebar (Chrome side panel, Firefox sidebar) follows the active
    // tab of its window and is not exposed to Playwright. Opened as an
    // ordinary tab, the page is that active tab itself, so it shows the state
    // for a page that cannot have highlights. It is as narrow as a sidebar.
    await page.setViewportSize({ width: 400, height: 720 });

    for (const scheme of SCHEMES) {
      await setScheme(page, scheme);
      await page.goto(ext.url('sidepanel.html'));
      await expect(page.getByText("Highlights aren't available on this page")).toBeVisible();
      await shoot(page.locator('#app > *').first(), 'sidepanel', scheme);
    }
  });
});
