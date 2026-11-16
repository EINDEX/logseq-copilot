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

  test('groups two clips of the same page under one root', async ({ page, ext, logseq, articles }) => {
    const id = nonce('clipgroup');
    const title = `Grouped clip ${id}`;
    const url = `https://example.com/e2e/${id}`;
    articles.set(url, { title, paragraph: `Group these words ${id}` });

    await ext.connect();
    // Not the journal: a file graph re-reads a journal file it has just created.
    await ext.setStorage({
      templates: [
        {
          id: 'grouped',
          name: 'Grouped clip',
          content: '- #[[Clip]] [{{title}}]({{url}})\n  - {{content}}',
          clipNoteLocation: 'customPage',
          clipNoteCustomPage: 'Copilot Test Page',
        },
      ],
    });
    await page.goto(url);
    await page.waitForLoadState('load');
    await expect(page.locator('logseq-copilot-popup')).toBeAttached();

    const text = (block: any): string => String(block.content ?? block.title ?? '');
    const readRoots = async () => {
      const roots = (await logseq.findBlocks(`[${title}](${url})`)).filter((b) => text(b).includes(url));
      return Promise.all(
        roots.map((root) =>
          logseq.callApi('logseq.Editor.getBlock', [root.uuid, { includeChildren: true }]),
        ),
      );
    };

    await selectParagraph(page);
    await ext.sendToTab(page, 'content:quickCapture');
    await expect
      .poll(async () => (await readRoots())[0]?.children?.length ?? 0, { timeout: 30_000 })
      .toBe(1);

    await selectParagraph(page);
    await ext.sendToTab(page, 'content:quickCapture');
    await expect
      .poll(async () => (await readRoots())[0]?.children?.length ?? 0, { timeout: 30_000 })
      .toBe(2);

    const roots = await readRoots();
    expect(roots).toHaveLength(1);
    expect(roots[0].children.map(text)).toEqual([`Group these words ${id}`, `Group these words ${id}`]);
  });

  test('highlights the clipped text on the page after the clip', async ({ page, ext, articles }) => {
    const id = nonce('cliphl');
    const url = `https://example.com/e2e/${id}`;
    articles.set(url, { title: `Highlight clip ${id}`, paragraph: `Highlight clipped words ${id}` });

    await ext.connect();
    await page.goto(url);
    await page.waitForLoadState('load');
    await expect(page.locator('logseq-copilot-popup')).toBeAttached();
    await selectParagraph(page);
    await ext.sendToTab(page, 'content:quickCapture');

    const stored = async () =>
      ((await ext.getStorage('highlights')) ?? []).filter((h: any) => h.url === url);
    await expect.poll(async () => (await stored()).length, { timeout: 30_000 }).toBe(1);
    const highlightId: string = (await stored())[0].id;
    await expect
      .poll(() => page.evaluate((name) => CSS.highlights.has(name), `logseq-highlight-${highlightId}`))
      .toBe(true);
  });

  test('saves no highlight with the option off', async ({ page, ext, logseq, articles }) => {
    const id = nonce('cliphloff');
    const url = `https://example.com/e2e/${id}`;
    articles.set(url, { title: `No highlight ${id}`, paragraph: `Not highlighted ${id}` });

    await ext.connect();
    await ext.setStorage({ highlightClippedText: false });
    await page.goto(url);
    await page.waitForLoadState('load');
    await expect(page.locator('logseq-copilot-popup')).toBeAttached();
    await selectParagraph(page);
    await ext.sendToTab(page, 'content:quickCapture');

    await expect.poll(async () => (await logseq.findBlocks(id)).length, { timeout: 30_000 }).toBeGreaterThan(0);
    await page.waitForTimeout(1_000);
    expect(((await ext.getStorage('highlights')) ?? []).filter((h: any) => h.url === url)).toEqual([]);
  });

  // Two templates writing to the journal, told apart by the word in front.
  // Alpha is the default (the first); Beta is pinned in `pinnedTemplates`.
  const alpha = {
    id: 'alpha',
    name: 'Alpha',
    content: '- Alpha [{{title}}]({{url}})',
    clipNoteLocation: 'journal',
    clipNoteCustomPage: '',
  };
  const beta = { ...alpha, id: 'beta', name: 'Beta', content: '- Beta [{{title}}]({{url}})' };
  const unpinnedTemplates = [alpha, beta];
  const pinnedTemplates = [alpha, { ...beta, pinned: true }];
  const panel = (page: Page) => page.locator('logseq-copilot-popup [data-clip-picker]');
  const blockText = (block: any): string => String(block.content ?? block.title ?? '');

  /** The first words of the blocks of the clip. */
  const words = async (logseq: any, id: string) =>
    (await logseq.findBlocks(id)).map(blockText).map((t: string) => t.split(' ')[0]);

  const openPage = async (page: Page, ext: any, articles: any, prefix: string, templates: unknown[]) => {
    const id = nonce(prefix);
    const url = `https://example.com/e2e/${id}`;
    articles.set(url, { title: `Page ${id}`, paragraph: 'Nothing selected here' });
    await ext.connect();
    await ext.setStorage({ templates });
    await page.goto(url);
    await page.waitForLoadState('load');
    await expect(page.locator('logseq-copilot-popup')).toBeAttached();
    return { id, url };
  };

  test('shows no panel with the default settings: the clip is saved at once', async ({
    page,
    ext,
    logseq,
    articles,
  }) => {
    const { id } = await openPage(page, ext, articles, 'clipnopanel', unpinnedTemplates);
    await ext.sendToTab(page, 'content:quickCapture');

    await expect.poll(() => words(logseq, id), { timeout: 30_000 }).toEqual(['Alpha']);
    await expect(panel(page)).toHaveCount(0);
  });

  test('with two pinned, the countdown saves the default', async ({ page, ext, logseq, articles }) => {
    const { id } = await openPage(page, ext, articles, 'clipcount', pinnedTemplates);
    await ext.sendToTab(page, 'content:quickCapture');

    await expect(panel(page)).toBeVisible({ timeout: 30_000 });
    await expect(panel(page).getByRole('option')).toHaveText([/Alpha/, /Beta/]);
    await expect(panel(page).getByRole('option').first()).toHaveAttribute('aria-selected', 'true');
    // Nothing is written while the panel counts down.
    expect(await logseq.findBlocks(id)).toEqual([]);

    await expect.poll(() => words(logseq, id), { timeout: 30_000 }).toEqual(['Alpha']);
    await expect(panel(page)).toHaveCount(0);
  });

  test('the arrow keys stop the countdown, and Enter saves the second template', async ({
    page,
    ext,
    logseq,
    articles,
  }) => {
    const { id } = await openPage(page, ext, articles, 'clipdown', pinnedTemplates);
    await ext.sendToTab(page, 'content:quickCapture');
    await expect(panel(page)).toBeVisible({ timeout: 30_000 });

    await page.keyboard.press('ArrowDown');
    await expect(panel(page).getByRole('option').nth(1)).toHaveAttribute('aria-selected', 'true');
    // Past the 3 s of the countdown: stopped for good, nothing was saved.
    await page.waitForTimeout(3_500);
    await expect(panel(page)).toBeVisible();
    expect(await logseq.findBlocks(id)).toEqual([]);

    await page.keyboard.press('Enter');
    await expect.poll(() => words(logseq, id), { timeout: 30_000 }).toEqual(['Beta']);
    await expect(panel(page)).toHaveCount(0);
  });

  test('Escape closes the panel and writes nothing', async ({ page, ext, logseq, articles }) => {
    const { id } = await openPage(page, ext, articles, 'clipesc', pinnedTemplates);
    await ext.sendToTab(page, 'content:quickCapture');
    await expect(panel(page)).toBeVisible({ timeout: 30_000 });

    await page.keyboard.press('Escape');
    await expect(panel(page)).toHaveCount(0);
    await page.waitForTimeout(4_000);
    expect(await logseq.findBlocks(id)).toEqual([]);
  });

  test('the note ends up in Logseq under the clip', async ({ page, ext, logseq, articles }) => {
    const noted = {
      ...alpha,
      content: '- Alpha [{{title}}]({{url}})\n  - {{note}}',
    };
    const { id } = await openPage(page, ext, articles, 'clipnote', [noted, { ...beta, pinned: true }]);
    await ext.sendToTab(page, 'content:quickCapture');
    await expect(panel(page)).toBeVisible({ timeout: 30_000 });

    // Typing in the note stops the countdown; Enter saves.
    await panel(page).getByRole('textbox', { name: 'Note' }).fill(`remember ${id}`);
    await page.waitForTimeout(3_500);
    await expect(panel(page)).toBeVisible();
    await page.keyboard.press('Enter');

    await expect.poll(async () => (await logseq.findBlocks(`remember ${id}`)).length, { timeout: 30_000 }).toBeGreaterThan(0);
    const [note] = await logseq.findBlocks(`remember ${id}`);
    expect(blockText(note)).toContain(`remember ${id}`);
    await expect.poll(() => words(logseq, id), { timeout: 30_000 }).toContain('Alpha');
    await expect(panel(page)).toHaveCount(0);
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
