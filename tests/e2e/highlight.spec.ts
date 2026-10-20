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

test.describe('highlights', () => {
  test('a clipped selection is highlighted, restored after reload and takes a comment', async ({
    page,
    ext,
    articles,
  }) => {
    const id = nonce('hl');
    const url = `https://example.com/e2e/${id}`;
    articles.set(url, { title: `Highlight page ${id}`, paragraph: `Highlight these words ${id} please` });

    // The in-page UI (float button, comment popup, highlights sidebar) is
    // only mounted with the float button option on.
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
});
