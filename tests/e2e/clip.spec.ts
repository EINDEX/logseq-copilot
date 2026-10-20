import type { Page } from '@playwright/test';
import { expect, nonce, test } from './fixtures';

/** Select the whole #target paragraph, like a user drag-selecting it. */
const selectParagraph = (page: Page) =>
  page.evaluate(() => {
    const range = document.createRange();
    range.selectNodeContents(document.getElementById('target')!);
    const selection = getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    return selection.toString();
  });

// The `clip` command (Ctrl+Shift+U) is a browser-level shortcut: Playwright
// key presses go to the page and never reach chrome.commands. The tests send
// the message the command handler sends (`content:quickCapture` to the tab),
// so everything after the shortcut runs for real.
test.describe('clip (quick capture)', () => {
  test('clips the selected text into the journal', async ({ page, ext, logseq, articles }) => {
    const id = nonce('clipsel');
    const url = `https://example.com/e2e/${id}`;
    articles.set(url, { title: `Clip page ${id}`, paragraph: `Selected words ${id} to clip` });

    await ext.connect();
    await page.goto(url);
    await page.waitForLoadState('load');
    expect(await selectParagraph(page)).toContain(id);
    await ext.sendToTab(page, 'content:quickCapture');

    await expect.poll(async () => (await logseq.findBlocks(id)).length, { timeout: 30_000 }).toBeGreaterThan(0);
    const [block] = await logseq.findBlocks(id);
    const content: string = block.content ?? block.title ?? '';
    expect(content).toContain(`[Clip page ${id}](${url})`);
    expect(content).toContain(`Selected words ${id} to clip`);
  });

  test('clips the page link when nothing is selected', async ({ page, ext, logseq, articles }) => {
    const id = nonce('clippage');
    const url = `https://example.com/e2e/${id}`;
    articles.set(url, { title: `Whole page ${id}`, paragraph: 'Nothing selected here' });

    await ext.connect();
    await page.goto(url);
    await page.waitForLoadState('load');
    await ext.sendToTab(page, 'content:quickCapture');

    await expect.poll(async () => (await logseq.findBlocks(id)).length, { timeout: 30_000 }).toBeGreaterThan(0);
    const [block] = await logseq.findBlocks(id);
    const content: string = block.content ?? block.title ?? '';
    expect(content).toContain(`[Whole page ${id}](${url})`);
    expect(content).not.toContain('Nothing selected here');
  });
});
