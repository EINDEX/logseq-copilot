/**
 * The in-page sidebar pinned: the page makes room for it, in the page's own
 * layout, fixed elements included. Unpinned, the page is as it was. The page
 * here has what pushing must handle: a fixed full-width header, a fixed chat
 * button at the right, text at the right edge of the content.
 *
 * Staying open when the browser starts again is in the background's unit
 * tests (background.test.ts): Chromium does not send runtime.onStartup when
 * Playwright starts a profile again with --load-extension.
 */
import type { BrowserContext, Page } from '@playwright/test';
import { expect, nonce, test } from './fixtures';

const SIDEBAR_WIDTH = 360;

const pageHtml = (title: string) => `<!doctype html>
<html><head><title>${title}</title>
<style>
  body { margin: 0; font: 16px sans-serif; }
  header { position: fixed; top: 0; left: 0; right: 0; height: 48px; background: #ddd; }
  #header-end { position: absolute; right: 8px; top: 12px; }
  main { padding: 64px 16px 16px; }
  #right-edge { text-align: right; }
  #chat { position: fixed; right: 16px; bottom: 16px; width: 56px; height: 56px; background: #36c; }
</style></head>
<body>
  <header><span>${title}</span><span id="header-end">Sign in</span></header>
  <main>
    <p id="right-edge"><span id="right-edge-text">Right edge words</span></p>
    ${'<p>Filler to scroll.</p>'.repeat(80)}
  </main>
  <div id="chat"></div>
</body></html>`;

const route = (context: BrowserContext) =>
  context.route('https://dock.example/**', (r) =>
    r.fulfill({ contentType: 'text/html', body: pageHtml(new URL(r.request().url()).pathname) }),
  );

const sidebar = (page: Page) => page.locator('logseq-copilot-highlights');
const pinButton = (page: Page) => sidebar(page).getByRole('button', { name: 'Pin', exact: true });

/** Where the page's elements are, and what the root's box is. */
const layout = (page: Page) =>
  page.evaluate(() => {
    const box = (selector: string) => {
      const { left, right, top, bottom } = document.querySelector(selector)!.getBoundingClientRect();
      return { left, right, top, bottom };
    };
    const html = getComputedStyle(document.documentElement);
    return {
      header: box('header'),
      headerEnd: box('#header-end'),
      rightEdge: box('#right-edge-text'),
      chat: box('#chat'),
      main: box('main'),
      htmlMargin: html.marginRight,
      htmlWidth: html.width,
      styleAttr: document.documentElement.getAttribute('style'),
      dockStyle: !!document.getElementById('logseq-copilot-sidebar-dock'),
      marked: document.querySelectorAll('[data-logseq-copilot-dock]').length,
    };
  });

/** The element at the middle of `selector`: itself (or within it) when nothing covers it. */
const uncovered = (page: Page, selector: string) =>
  page.evaluate((selector) => {
    const target = document.querySelector(selector)!;
    const { left, right, top, bottom } = target.getBoundingClientRect();
    const hit = document.elementFromPoint((left + right) / 2, (top + bottom) / 2);
    return !!hit && (hit === target || target.contains(hit));
  }, selector);

const expectRoomMade = async (page: Page) => {
  // A resize is followed a moment later.
  await expect.poll(async () => (await layout(page)).htmlMargin).toBe(`${SIDEBAR_WIDTH}px`);
  const width = page.viewportSize()!.width;
  const now = await layout(page);
  for (const part of ['header', 'headerEnd', 'rightEdge', 'chat'] as const) {
    expect(now[part].right, part).toBeLessThanOrEqual(width - SIDEBAR_WIDTH + 0.5);
  }
  for (const selector of ['#header-end', '#right-edge-text', '#chat']) {
    expect(await uncovered(page, selector), selector).toBe(true);
  }
};

test.describe('in-page sidebar, pinned', () => {
  test('makes the page give up its width, keeps it from page to page, and gives it back', async ({
    page,
    context,
    ext,
  }) => {
    const id = nonce('pin');
    await route(context);
    await ext.setStorage({ inPageSidebar: true });

    // The page as it is without the sidebar.
    await page.goto(`https://dock.example/${id}-one`);
    const before = await layout(page);
    expect(before.dockStyle).toBe(false);

    // Open, not pinned: it covers the page, which is left as it was.
    await ext.setStorage({ inPageSidebarOpen: true });
    await expect(pinButton(page)).toHaveAttribute('aria-pressed', 'false');
    expect(await layout(page)).toEqual(before);
    expect(await uncovered(page, '#right-edge-text')).toBe(false);
    expect(await uncovered(page, '#chat')).toBe(false);

    // Pinned: the page makes room.
    await pinButton(page).click();
    await expect.poll(() => ext.getStorage('inPageSidebarPinned')).toBe(true);
    await expect(pinButton(page)).toHaveAttribute('aria-pressed', 'true');
    await expectRoomMade(page);

    // Another page, a reload, an in-page navigation: still pinned.
    await page.goto(`https://dock.example/${id}-two`);
    await expect(sidebar(page)).toHaveCount(1);
    await expectRoomMade(page);
    await page.reload();
    await expect(sidebar(page)).toHaveCount(1);
    await expectRoomMade(page);
    await page.evaluate((url) => history.pushState(null, '', url), `/${id}-three`);
    await expectRoomMade(page);

    // Unpinned: the page is as it was, the sidebar covers it again.
    await pinButton(page).click();
    await expect.poll(() => ext.getStorage('inPageSidebarPinned')).toBe(false);
    await expect.poll(async () => (await layout(page)).dockStyle).toBe(false);
    expect(await layout(page)).toEqual(before);
    expect(await uncovered(page, '#right-edge-text')).toBe(false);
  });

  test('covers a site taken out from the pin menu, and pushes again when it is put back', async ({
    page,
    context,
    ext,
  }) => {
    const id = nonce('pin-site');
    await route(context);
    await ext.setStorage({ inPageSidebar: true, inPageSidebarOpen: true, inPageSidebarPinned: true });
    await page.goto(`https://dock.example/${id}`);
    await expectRoomMade(page);

    await sidebar(page).getByRole('button', { name: 'Pin on dock.example' }).click();
    await sidebar(page).getByRole('menuitemcheckbox', { name: 'dock.example' }).click();

    await expect.poll(() => ext.getStorage('inPageSidebarOverlayHosts')).toEqual(['dock.example']);
    await expect.poll(async () => (await layout(page)).dockStyle).toBe(false);
    expect((await layout(page)).marked).toBe(0);
    // Still pinned everywhere else.
    expect(await ext.getStorage('inPageSidebarPinned')).toBe(true);

    await page.reload();
    await expect(sidebar(page)).toHaveCount(1);
    expect((await layout(page)).dockStyle).toBe(false);

    await sidebar(page).getByRole('button', { name: 'Pin on dock.example' }).click();
    await sidebar(page).getByRole('menuitemcheckbox', { name: 'dock.example' }).click();
    await expectRoomMade(page);
  });

  test('covers the page on a window too narrow for both', async ({ page, context, ext }) => {
    await route(context);
    await page.setViewportSize({ width: 800, height: 700 });
    await ext.setStorage({ inPageSidebar: true, inPageSidebarOpen: true, inPageSidebarPinned: true });
    await page.goto(`https://dock.example/${nonce('pin-narrow')}`);
    await expect(pinButton(page)).toHaveAttribute('aria-pressed', 'true');
    await page.waitForTimeout(600);
    const narrow = await layout(page);
    expect(narrow.htmlMargin).toBe('0px');
    expect(narrow.dockStyle).toBe(false);

    // Wide again: it pushes.
    await page.setViewportSize({ width: 1400, height: 900 });
    await expectRoomMade(page);
  });
});

test.describe('browser sidebar (not the one on pages)', () => {
  test('has no pin, and pages are left alone even with the pin stored', async ({
    page,
    context,
    ext,
    browserName,
  }) => {
    test.skip(browserName !== 'chromium', 'the side panel page is driven in Chromium');
    await route(context);
    await ext.setStorage({ inPageSidebar: false, inPageSidebarPinned: true });
    await page.goto(`https://dock.example/${nonce('pin-native')}`);
    const before = await layout(page);
    expect(before.dockStyle).toBe(false);
    expect(before.htmlMargin).toBe('0px');

    const panel = await ext.openSidePanel(page);
    await panel.expectButton('Settings');
    await expect(panel.page!.getByRole('button', { name: 'Pin', exact: true })).toHaveCount(0);

    await page.waitForTimeout(600);
    expect(await layout(page)).toEqual(before);
    await expect(sidebar(page)).toHaveCount(0);
  });
});
