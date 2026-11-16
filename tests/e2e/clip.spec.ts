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

  test('saves the page as a task', async ({ page, ext, logseq, articles }) => {
    const id = nonce('cliptask');
    const title = `Task page ${id}`;
    const url = `https://example.com/e2e/${id}`;
    articles.set(url, { title, paragraph: 'Nothing selected here' });

    await ext.connect();
    await page.goto(url);
    await page.waitForLoadState('load');
    // What the `clip-task` command sends.
    await ext.sendToTab(page, 'content:quickCapture', { templateId: 'task' });

    await expect.poll(async () => (await logseq.findBlocks(id)).length, { timeout: 30_000 }).toBeGreaterThan(0);
    const [block] = await logseq.findBlocks(id);
    const content: string = block.content ?? block.title ?? '';
    expect(content).toContain(`[${title}](${url})`);
    if (logseq.isDB) {
      // DB graphs keep the task in the status property, not as text.
      await expect.poll(() => logseq.taskMarker(block.uuid), { timeout: 30_000 }).toBe('TODO');
    } else {
      expect(content.startsWith(`TODO [${title}](${url})`)).toBe(true);
    }
  });

  test('nests the selection under the link with an outline template', async ({ page, ext, logseq, articles }) => {
    const id = nonce('clipnest');
    const title = `Nested clip ${id}`;
    const url = `https://example.com/e2e/${id}`;
    articles.set(url, { title, paragraph: `First paragraph ${id}` });

    await ext.connect();
    await ext.setStorage({
      templates: [
        {
          id: 'nested',
          name: 'Nested clip',
          content: '- #[[Clip]] [{{title}}]({{url}})\n  - {{content}}',
          clipNoteLocation: 'journal',
          clipNoteCustomPage: '',
        },
      ],
    });
    await page.goto(url);
    await page.waitForLoadState('load');
    // Select the paragraph and what follows it: a second paragraph and a nested list.
    await page.evaluate((id) => {
      const target = document.getElementById('target')!;
      const more = document.createElement('div');
      more.id = 'more';
      more.innerHTML = `<p>Second paragraph ${id}</p><ul><li>item one<ul><li>nested item</li></ul></li><li>item two</li></ul>`;
      target.after(more);
      const range = document.createRange();
      range.setStartBefore(target);
      range.setEndAfter(more);
      const selection = getSelection()!;
      selection.removeAllRanges();
      selection.addRange(range);
    }, id);
    await ext.sendToTab(page, 'content:quickCapture');

    await expect.poll(async () => (await logseq.findBlocks(id)).length, { timeout: 30_000 }).toBeGreaterThan(0);
    const text = (block: any): string => String(block.content ?? block.title ?? '');
    const shape = (block: any): unknown =>
      block.children?.length
        ? [text(block), ...block.children.map(shape)]
        : text(block);
    const readRoot = async () => {
      const root = (await logseq.findBlocks(`[${title}](${url})`)).find((b) => text(b).includes(url));
      if (!root) return undefined;
      return shape(await logseq.callApi('logseq.Editor.getBlock', [root.uuid, { includeChildren: true }]));
    };
    await expect
      .poll(async () => JSON.stringify(await readRoot()), { timeout: 30_000 })
      .toContain('nested item');
    const [link, ...children] = (await readRoot()) as any[];
    expect(link).toContain(`[${title}](${url})`);
    expect(children).toEqual([
      `First paragraph ${id}`,
      `Second paragraph ${id}`,
      ['item one', 'nested item'],
      'item two',
    ]);
  });

  test('shows in the page why nothing was clipped', async ({ page, ext, logseq, articles }) => {
    const id = nonce('clipfail');
    const url = `https://example.com/e2e/${id}`;
    articles.set(url, { title: `Failed clip ${id}`, paragraph: `Not clipped ${id}` });

    await ext.connect({ token: 'wrong-token' });
    await page.goto(url);
    await page.waitForLoadState('load');
    await expect(page.locator('logseq-copilot-popup')).toBeAttached();
    await selectParagraph(page);
    await ext.sendToTab(page, 'content:quickCapture');

    const alert = page.locator('logseq-copilot-popup [data-clip-error]');
    await expect(alert).toHaveText(/The authorization token is wrong/);
    expect(await logseq.findBlocks(id)).toEqual([]);
  });
});
