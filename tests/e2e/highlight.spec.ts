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

  for (const nearBottom of [false, true]) {
    test(`the comment popup grows to fit its content and stays in the viewport${nearBottom ? ' (highlight near the bottom, flips above)' : ''}`, async ({
      page,
      ext,
      articles,
    }) => {
      const id = nonce('hlfit');
      const url = `https://example.com/e2e/${id}`;
      articles.set(url, { title: `Fit page ${id}`, paragraph: `Fit these words ${id} please` });

      await page.setViewportSize({ width: 1000, height: 640 });
      await ext.connect({ enableClipNoteFloatButton: true });
      await page.goto(url);
      await expect(page.locator('logseq-copilot-popup')).toBeAttached();

      await selectParagraph(page);
      await ext.sendToTab(page, 'content:quickCapture');
      await expect
        .poll(async () => ((await ext.getStorage('highlights')) ?? []).filter((h: any) => h.url === url).length)
        .toBe(1);
      await page.reload();
      await expect(page.locator('logseq-copilot-popup')).toBeAttached();
      await expect.poll(() => registeredHighlights(page)).toBeGreaterThan(0);

      if (nearBottom) {
        // Push the highlighted paragraph close to the bottom edge of the viewport.
        await page.evaluate(() => {
          const target = document.getElementById('target')!;
          const top = target.getBoundingClientRect().top;
          target.style.marginTop = `${window.innerHeight - 90 - top}px`;
          window.scrollTo(0, 0);
        });
      }
      const box = await page.locator('#target').boundingBox();
      await page.mouse.click(box!.x + 20, box!.y + box!.height / 2);
      const popup = page.locator('logseq-copilot-popup [data-highlight-popup]');
      await expect(popup).toBeVisible();

      const expectFits = async () => {
        const m = await popup.evaluate((el) => {
          const r = el.getBoundingClientRect();
          return {
            scrollHeight: el.scrollHeight,
            clientHeight: el.clientHeight,
            top: r.top,
            bottom: r.bottom,
            left: r.left,
            right: r.right,
            vw: window.innerWidth,
            vh: window.innerHeight,
          };
        });
        expect(m.scrollHeight).toBeLessThanOrEqual(m.clientHeight);
        expect(m.top).toBeGreaterThanOrEqual(0);
        expect(m.left).toBeGreaterThanOrEqual(0);
        expect(m.bottom).toBeLessThanOrEqual(m.vh);
        expect(m.right).toBeLessThanOrEqual(m.vw);
      };
      await expectFits();

      await popup.getByRole('button', { name: 'Edit' }).click();
      const textarea = popup.getByPlaceholder('Add a comment to this highlight...');
      await textarea.fill(Array.from({ length: 6 }, (_, i) => `line ${i} ${id}`).join('\n'));
      const save = popup.getByRole('button', { name: 'Save' });
      await expect(save).toBeInViewport({ ratio: 1 });
      await expectFits();
    });
  }

  test('a comment saved in the popup is synced to the clip in Logseq: added, edited, removed', async ({
    page,
    ext,
    logseq,
    articles,
  }) => {
    const id = nonce('hlcomment');
    const url = `https://example.com/e2e/${id}`;
    articles.set(url, { title: `Comment page ${id}`, paragraph: `Comment on these words ${id} please` });

    await ext.connect({ enableClipNoteFloatButton: true });
    await ext.setStorage({
      templates: [
        {
          id: 'comment-outline',
          name: 'Comment outline',
          content: '- [{{title}}]({{url}})\n  - {{content}}',
          clipNoteLocation: 'customPage',
          clipNoteCustomPage: 'Copilot Test Page',
        },
      ],
    });
    await page.goto(url);
    await expect(page.locator('logseq-copilot-popup')).toBeAttached();

    await selectParagraph(page);
    await ext.sendToTab(page, 'content:quickCapture');

    // The highlight is saved with the node its clip added.
    const stored = async () =>
      ((await ext.getStorage('highlights')) ?? []).filter((h: any) => h.url === url);
    await expect.poll(async () => (await stored())[0]?.logseq?.nodeUuid, { timeout: 30_000 }).toBeTruthy();
    const nodeUuid: string = (await stored())[0].logseq.nodeUuid;
    const text = (block: any): string => String(block.content ?? block.title ?? '');
    const children = async (): Promise<string[]> =>
      ((await logseq.callApi('logseq.Editor.getBlock', [nodeUuid, { includeChildren: true }]))?.children ?? []).map(text);
    await expect.poll(children, { timeout: 30_000 }).toHaveLength(1);

    const box = await page.locator('#target').boundingBox();
    await page.mouse.click(box!.x + 20, box!.y + box!.height / 2);
    const popup = page.locator('logseq-copilot-popup [data-highlight-popup]');
    await expect(popup).toBeVisible();

    const saveComment = async (comment: string) => {
      await popup.getByRole('button', { name: 'Edit' }).click();
      await popup.getByPlaceholder('Add a comment to this highlight...').fill(comment);
      await popup.getByRole('button', { name: 'Save' }).click();
    };

    // Added: one new last child of the clip's node.
    await saveComment(`first comment ${id}`);
    await expect.poll(children, { timeout: 30_000 }).toHaveLength(2);
    expect((await children())[1]).toBe(`first comment ${id}`);

    // Edited: the same block.
    await saveComment(`second comment ${id}`);
    await expect.poll(async () => (await children())[1], { timeout: 30_000 }).toBe(`second comment ${id}`);
    expect(await children()).toHaveLength(2);

    // Removed: a blank comment takes the block away, the clip stays.
    await saveComment('');
    await expect.poll(children, { timeout: 30_000 }).toHaveLength(1);
    expect((await children())[0]).toContain(id);
    await expect(popup.locator('[data-comment-sync-error]')).toHaveCount(0);
  });

  test('a clip deleted in Logseq unlinks the highlight: the popup says so and saves the comment locally', async ({
    page,
    ext,
    articles,
    logseq,
  }) => {
    const id = nonce('hlgone');
    const url = `https://example.com/e2e/${id}`;
    articles.set(url, { title: `Highlight gone page ${id}`, paragraph: `Gone words ${id} please` });

    await ext.connect({ enableClipNoteFloatButton: true });
    await ext.setStorage({
      templates: [
        {
          id: 'comment-outline',
          name: 'Comment outline',
          content: '- [{{title}}]({{url}})\n  - {{content}}',
          clipNoteLocation: 'customPage',
          clipNoteCustomPage: 'Copilot Test Page',
        },
      ],
    });
    await page.goto(url);
    await expect(page.locator('logseq-copilot-popup')).toBeAttached();
    await selectParagraph(page);
    await ext.sendToTab(page, 'content:quickCapture');

    const stored = async () =>
      ((await ext.getStorage('highlights')) ?? []).filter((h: any) => h.url === url);
    await expect.poll(async () => (await stored())[0]?.logseq?.nodeUuid, { timeout: 30_000 }).toBeTruthy();
    const nodeUuid: string = (await stored())[0].logseq.nodeUuid;

    // The user deletes the clip in Logseq.
    await logseq.callApi('logseq.Editor.removeBlock', [nodeUuid]);
    await expect
      .poll(async () => await logseq.callApi('logseq.Editor.getBlock', [nodeUuid]), { timeout: 30_000 })
      .toBeFalsy();

    await page.reload();
    await expect(page.locator('logseq-copilot-popup')).toBeAttached();
    await expect.poll(() => registeredHighlights(page)).toBeGreaterThan(0);
    const box = await page.locator('#target').boundingBox();
    await page.mouse.click(box!.x + 20, box!.y + box!.height / 2);
    const popup = page.locator('logseq-copilot-popup [data-highlight-popup]');
    await expect(popup.locator('[data-removed-from-logseq]')).toHaveText('Removed from Logseq');
    await expect.poll(async () => (await stored())[0]?.logseq).toBeUndefined();

    // The comment stays local: no sync error, and Logseq gets nothing back.
    const comment = `local comment ${id}`;
    await popup.getByRole('button', { name: 'Edit' }).click();
    await popup.getByPlaceholder('Add a comment to this highlight...').fill(comment);
    await popup.getByRole('button', { name: 'Save' }).click();
    await expect.poll(async () => (await stored())[0]?.note).toBe(comment);
    await expect(popup.locator('[data-comment-sync-error]')).toHaveCount(0);
    expect(await logseq.callApi('logseq.Editor.getBlock', [nodeUuid])).toBeFalsy();
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
