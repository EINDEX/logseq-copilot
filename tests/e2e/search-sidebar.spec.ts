import { expect, test } from './fixtures';
import { googleUrl } from './pages';

// `chrome` inside ext.evaluate() callbacks (the extension's background).
declare const chrome: typeof import('wxt/browser').browser;

test.describe('search engine sidebar', () => {
  test('shows seeded blocks for the Google query and highlights the keyword', async ({ page, ext }) => {
    await ext.connect();
    await page.goto(googleUrl('copilot'));

    const sidebar = page.locator('#rhs logseq-copilot-search-engine');
    await expect(sidebar.getByText('Copilot Test Page', { exact: true })).toBeVisible();
    // Two hits per page first, the rest behind "+N".
    const more = sidebar.getByRole('button', { name: /^Show \d+ more$/ });
    if (await more.count()) await more.first().click();
    await expect(sidebar.getByText('Hello from copilot integration test')).toBeVisible();
    await expect(sidebar.locator('mark', { hasText: /^copilot$/i }).first()).toBeVisible();
    // The E2E build uses open shadow roots, which is what lets the locators
    // above see inside.
    expect(
      await page.evaluate(() => document.querySelector('logseq-copilot-search-engine')?.shadowRoot !== null),
    ).toBe(true);
  });

  // Opened by the page, the browser asks whether www.google.com may open
  // Logseq; the background opens it in the page's tab instead
  // (src/utils/logseq-links.ts).
  test('opens Logseq links from the background, not from the page', async ({ page, ext }) => {
    await ext.connect();
    await page.goto(googleUrl('copilot'));

    const sidebar = page.locator('#rhs logseq-copilot-search-engine');
    const pageRow = sidebar.locator('a.lc-page-row', { hasText: 'Copilot Test Page' });
    await expect(pageRow).toBeVisible();
    const href = await pageRow.getAttribute('href');
    expect(href).toMatch(/^logseq:\/\/graph\/.+\?page=/);

    // Record what the background opens instead of launching Logseq.
    const tabId = await ext.evaluate(async (url) => {
      const opened: { tabId: number; url?: string }[] = [];
      (globalThis as any).openedLinks = opened;
      const apis = new Set([(globalThis as any).browser, chrome].filter(Boolean));
      for (const api of apis) {
        api.tabs.update = async (tabId: number, props: { url?: string }) => {
          opened.push({ tabId, url: props.url });
          return {};
        };
      }
      const tabs = await chrome.tabs.query({});
      return tabs.find((t) => t.url === url)?.id;
    }, page.url());
    expect(tabId).toEqual(expect.any(Number));
    // Whether the page's own handling of the clicks (the navigation) was
    // cancelled: listeners on window run after the shadow root's.
    await page.evaluate(() => {
      const seen: string[] = [];
      (window as any).seenClicks = seen;
      for (const type of ['click', 'auxclick']) {
        window.addEventListener(type, (e) => seen.push(`${type}:${e.defaultPrevented}`));
      }
    });
    const address = page.url();
    const pages = page.context().pages().length;

    await pageRow.click();
    await pageRow.click({ button: 'middle' });

    const opened = () => ext.evaluate(() => (globalThis as any).openedLinks);
    await expect.poll(opened).toEqual([
      { tabId, url: href },
      { tabId, url: href },
    ]);
    expect(await page.evaluate(() => (window as any).seenClicks)).toEqual([
      'click:true',
      'auxclick:true',
    ]);
    expect(page.url()).toBe(address);
    expect(page.context().pages()).toHaveLength(pages);
  });

  test('follows the page theme (theme-detection on google.com)', async ({ page, ext }) => {
    await ext.connect();
    await page.goto(googleUrl('copilot'));

    const sidebar = page.locator('#rhs logseq-copilot-search-engine');
    await expect(sidebar.getByText('Copilot Test Page', { exact: true })).toBeVisible();
    const container = sidebar.locator('[data-theme-container]').first();
    await expect(container).not.toHaveClass(/\bdark\b/);

    // Google is detected by the body background luminance; a style change on
    // <body> re-runs the detection (setupThemeChangeListeners).
    await page.evaluate(() => {
      document.body.style.background = 'rgb(32, 33, 36)';
      document.body.style.color = 'rgb(232, 234, 237)';
    });
    await expect(container).toHaveClass(/\bdark\b/);

    await page.evaluate(() => {
      document.body.style.background = 'rgb(255, 255, 255)';
      document.body.style.color = 'rgb(32, 33, 36)';
    });
    await expect(container).not.toHaveClass(/\bdark\b/);
  });
});
