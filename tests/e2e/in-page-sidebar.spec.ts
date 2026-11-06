/**
 * The highlights sidebar drawn on the page, for browsers without one of their
 * own (Safari, Firefox for Android). Chromium and Firefox have their own, so
 * the popup never opens this one there: the test sets the open state the
 * popup, menu item and command set on those browsers, and the content script
 * follows it.
 */
import type { Page } from '@playwright/test';
import { expect, nonce, test } from './fixtures';

/** A saved highlight of the fixture article's paragraph. */
const savedHighlight = (id: string, url: string, text: string) => ({
  id,
  url,
  title: `Article ${id}`,
  hostname: new URL(url).hostname,
  range: {
    startContainerXPath: '/html/body/p[1]/text()[1]',
    endContainerXPath: '/html/body/p[1]/text()[1]',
    startOffset: 0,
    endOffset: text.length,
    textContent: text,
  },
  createdAt: Date.now(),
  lastAccessedAt: Date.now(),
});

const sidebar = (page: Page) => page.locator('logseq-copilot-highlights');

test.describe('in-page highlights sidebar', () => {
  test('stays open from page to page, follows in-page navigation, and closes everywhere', async ({
    page,
    ext,
    articles,
  }) => {
    const id = nonce('inpage');
    const pages = ['one', 'two', 'three'].map((name) => ({
      url: `https://example.com/e2e/${id}-${name}`,
      text: `In-page sidebar words ${id} ${name}`,
    }));
    for (const { url, text } of pages) {
      articles.set(url, { title: `In-page sidebar ${id}`, paragraph: text });
    }

    await ext.connect();
    await ext.setStorage({
      highlights: pages.map(({ url, text }, i) => savedHighlight(`${id}-${i}`, url, text)),
      inPageSidebarOpen: true,
    });

    await page.goto(pages[0].url);
    await expect(sidebar(page).getByText(pages[0].text)).toBeVisible();
    await expect(sidebar(page).getByText(pages[1].text)).toHaveCount(0);

    // Another page: still open, with the highlights of that page.
    await page.goto(pages[1].url);
    await expect(sidebar(page).getByText(pages[1].text)).toBeVisible();
    await expect(sidebar(page).getByText(pages[0].text)).toHaveCount(0);

    // A single-page app changes the address without loading a page.
    await page.evaluate((url) => history.pushState(null, '', url), pages[2].url);
    await expect(sidebar(page).getByText(pages[2].text)).toBeVisible();
    await expect(sidebar(page).getByText(pages[1].text)).toHaveCount(0);

    await sidebar(page).getByRole('button', { name: 'Close' }).click();

    await expect(sidebar(page)).toHaveCount(0);
    await expect.poll(() => ext.getStorage('inPageSidebarOpen')).toBe(false);
  });
});
