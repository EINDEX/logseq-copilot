import type { Page } from '@playwright/test';
import { expect, nonce, test } from './fixtures';

const selectParagraph = (page: Page) =>
  page.evaluate(() => {
    const range = document.createRange();
    range.selectNodeContents(document.getElementById('target')!);
    getSelection()!.removeAllRanges();
    getSelection()!.addRange(range);
  });

/** CSS Custom Highlight API registry; shared by the page and the content script. */
const registeredHighlights = (page: Page) => page.evaluate(() => CSS.highlights.size);

/** Is the saved highlight painted on the page? (`registeredHighlights` also counts the temporary one.) */
const isHighlightShown = (page: Page, highlightId: string) =>
  page.evaluate((name) => CSS.highlights.has(name), `logseq-highlight-${highlightId}`);

test.describe('highlights', () => {
  test('a clipped selection is highlighted, restored after reload and takes a comment', async ({
    page,
    ext,
    articles,
  }) => {
    const id = nonce('hl');
    const url = `https://example.com/e2e/${id}`;
    articles.set(url, { title: `Highlight page ${id}`, paragraph: `Highlight these words ${id} please` });

    // The float button is only mounted with its option on.
    await ext.connect({ enableClipNoteFloatButton: true });
    await page.goto(url);
    await expect(page.locator('logseq-copilot-popup')).toBeAttached();

    // Creating a highlight = clipping a selection (QuickCapture.capture).
    await selectParagraph(page);
    await ext.sendToTab(page, 'content:quickCapture');

    const stored = async () =>
      ((await ext.getStorage('highlights')) ?? []).filter((h: any) => h.url === url);
    await expect.poll(async () => (await stored()).length).toBe(1);
    expect((await stored())[0].range.textContent).toContain(id);
    await expect.poll(() => registeredHighlights(page)).toBeGreaterThan(0);

    await page.reload();
    await expect(page.locator('logseq-copilot-popup')).toBeAttached();
    await expect.poll(() => registeredHighlights(page)).toBeGreaterThan(0);

    // A real (trusted) click inside the highlighted text opens the popup.
    const box = await page.locator('#target').boundingBox();
    await page.mouse.click(box!.x + 20, box!.y + box!.height / 2);
    const popup = page.locator('logseq-copilot-popup [data-highlight-popup]');
    await expect(popup).toBeVisible();
    await expect(popup).toContainText(id);

    const comment = `comment ${id}`;
    await popup.getByRole('button', { name: 'Edit' }).click();
    await popup.getByPlaceholder('Add a comment to this highlight...').fill(comment);
    await popup.getByRole('button', { name: 'Save' }).click();
    await expect.poll(async () => (await stored())[0]?.note).toBe(comment);
  });

  test('a highlight deleted in the options page disappears from the open page', async ({
    page,
    ext,
    articles,
  }) => {
    const id = nonce('hlsync');
    const title = `Highlight sync page ${id}`;
    const url = `https://example.com/e2e/${id}`;
    articles.set(url, { title, paragraph: `Sync these words ${id} please` });

    await ext.connect();
    await page.goto(url);
    await expect(page.locator('logseq-copilot-popup')).toBeAttached();

    await selectParagraph(page);
    await ext.sendToTab(page, 'content:quickCapture');
    const stored = async () =>
      ((await ext.getStorage('highlights')) ?? []).filter((h: any) => h.url === url);
    await expect.poll(async () => (await stored()).length).toBe(1);
    const highlightId: string = (await stored())[0].id;
    await expect.poll(() => isHighlightShown(page, highlightId)).toBe(true);

    // The page is not reloaded: it follows the change of the saved highlights
    // (chrome.storage), made here from another extension page.
    const options = await ext.openPage('options.html#/highlights');
    await options.expectText(title);
    await options.clickButton('Delete highlight');

    await expect.poll(async () => (await stored()).length).toBe(0);
    await expect.poll(() => isHighlightShown(page, highlightId)).toBe(false);
  });
});
