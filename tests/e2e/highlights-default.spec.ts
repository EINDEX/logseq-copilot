/**
 * Highlights with the default configuration: the floating clip button is OFF
 * (enableClipNoteFloatButton defaults to false), yet highlights are restored
 * and clicking one opens the comment popup.
 */
import type { Page } from '@playwright/test';
import { expect, nonce, test } from './fixtures';

const selectParagraph = (page: Page) =>
  page.evaluate(() => {
    const range = document.createRange();
    range.selectNodeContents(document.getElementById('target')!);
    getSelection()!.removeAllRanges();
    getSelection()!.addRange(range);
  });

const registeredHighlights = (page: Page) => page.evaluate(() => CSS.highlights.size);

/**
 * Theme attribute on the document element. Not `locator('html')`: Playwright
 * locators pierce open shadow roots (the E2E build), and the in-page UI
 * hosts have their own <html> inside.
 */
const pageTheme = (page: Page) =>
  page.evaluate(() => document.documentElement.getAttribute('data-logseq-copilot-theme'));

/** Background color painted on the highlighted paragraph text. */
const highlightColor = (page: Page, highlightId: string) =>
  page.evaluate(
    (name) =>
      getComputedStyle(document.getElementById('target')!, `::highlight(${name})`).backgroundColor,
    `logseq-highlight-${highlightId}`,
  );

test.describe('highlights with the default configuration', () => {
  test('clicking a restored highlight opens the comment popup without the float button', async ({
    page,
    ext,
    articles,
  }) => {
    const id = nonce('hldef');
    const url = `https://example.com/e2e/${id}`;
    articles.set(url, { title: `Default highlight page ${id}`, paragraph: `Default config words ${id} here` });

    await ext.connect(); // enableClipNoteFloatButton: false
    await page.goto(url);
    // The popup host is mounted, the float button is not.
    await expect(page.locator('logseq-copilot-popup')).toBeAttached();
    await expect(page.locator('logseq-copilot-popup img.quickCapture')).toHaveCount(0);

    await selectParagraph(page);
    await ext.sendToTab(page, 'content:quickCapture');
    const stored = async () =>
      ((await ext.getStorage('highlights')) ?? []).filter((h: any) => h.url === url);
    await expect.poll(async () => (await stored()).length).toBe(1);

    await page.reload();
    await expect(page.locator('logseq-copilot-popup')).toBeAttached();
    await expect.poll(() => registeredHighlights(page)).toBeGreaterThan(0);

    const box = await page.locator('#target').boundingBox();
    await page.mouse.click(box!.x + 20, box!.y + box!.height / 2);
    const popup = page.locator('logseq-copilot-popup [data-highlight-popup]');
    await expect(popup).toBeVisible();
    await expect(popup).toContainText(id);
  });

  test('the highlight color follows the page theme', async ({ page, ext, articles }) => {
    const id = nonce('hltheme');
    const url = `https://example.com/e2e/${id}`;
    articles.set(url, { title: `Theme highlight page ${id}`, paragraph: `Theme words ${id} here` });

    await ext.connect();
    await page.goto(url);
    await selectParagraph(page);
    await ext.sendToTab(page, 'content:quickCapture');
    const stored = async () =>
      ((await ext.getStorage('highlights')) ?? []).filter((h: any) => h.url === url);
    await expect.poll(async () => (await stored()).length).toBe(1);
    const highlightId: string = (await stored())[0].id;
    await expect.poll(() => registeredHighlights(page)).toBeGreaterThan(0);

    await page.evaluate(() => document.documentElement.classList.add('light'));
    await expect.poll(() => pageTheme(page)).toBe('light');
    await expect.poll(() => highlightColor(page, highlightId)).toBe('rgba(133, 200, 200, 0.5)');

    await page.evaluate(() => {
      document.documentElement.classList.remove('light');
      document.documentElement.classList.add('dark');
    });
    await expect.poll(() => pageTheme(page)).toBe('dark');
    await expect.poll(() => highlightColor(page, highlightId)).toBe('rgba(133, 200, 200, 0.35)');
  });
});
