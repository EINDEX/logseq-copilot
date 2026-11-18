import type { Page } from '@playwright/test';
import { expect, nonce, test } from './fixtures';

// Chrome and Edge cannot change the shortcut of a command, so the options
// record an in-page shortcut that the content script listens for. Playwright
// key presses go to the page, never to chrome.commands: that is exactly the
// path of the in-page shortcut. Firefox changes the real command instead,
// which Playwright cannot press.
test.describe('clip shortcut setting', () => {
  test.skip(({ browserName }) => browserName === 'firefox', 'Firefox changes the real command');

  const alpha = {
    id: 'alpha',
    name: 'Alpha',
    content: '- Alpha [{{title}}]({{url}})',
    clipNoteLocation: 'journal',
    clipNoteCustomPage: '',
  };
  // Pinned: the shortcut opens the panel instead of saving at once.
  const beta = { ...alpha, id: 'beta', name: 'Beta', content: '- Beta [{{title}}]({{url}})', pinned: true };
  const panel = (page: Page) => page.locator('logseq-copilot-popup [data-clip-picker]');
  const blockText = (block: any): string => String(block.content ?? block.title ?? '');
  const words = async (logseq: any, id: string) =>
    (await logseq.findBlocks(id)).map(blockText).map((t: string) => t.split(' ')[0]);

  const openPage = async (page: Page, ext: any, articles: any) => {
    const id = nonce('clipkey');
    const url = `https://example.com/e2e/${id}`;
    articles.set(url, { title: `Page ${id}`, paragraph: 'Nothing selected here' });
    await ext.connect();
    await ext.setStorage({ templates: [alpha, beta] });
    await page.goto(url);
    await page.waitForLoadState('load');
    await expect(page.locator('logseq-copilot-popup')).toBeAttached();
    return { id };
  };

  const recorder = (options: { page?: Page }) => options.page!.locator('#clip-shortcut');

  test('records a combo in the settings; it opens the picker and, pressed again, saves', async ({
    page,
    ext,
    logseq,
    articles,
  }) => {
    const { id } = await openPage(page, ext, articles);
    const options = await ext.openPage('options.html#/settings');

    await recorder(options).click();
    await expect(recorder(options)).toContainText('Press keys');
    await options.page!.keyboard.press('Control+Alt+KeyK');
    await expect(recorder(options)).not.toContainText('Press keys');
    await expect(recorder(options).locator('kbd').last()).toHaveText('K');
    expect(await ext.getStorage('clipShortcut')).toMatchObject({
      code: 'KeyK',
      ctrl: true,
      alt: true,
      shift: false,
      meta: false,
    });
    await options.close();

    // The tab was open before the setting: it applies without a reload.
    await ext.activate(page);
    await page.keyboard.press('Control+Alt+KeyK');
    await expect(panel(page)).toBeVisible({ timeout: 30_000 });
    expect(await logseq.findBlocks(id)).toEqual([]);

    // Again while the panel is open: saves with the highlighted template.
    await page.keyboard.press('Control+Alt+KeyK');
    await expect.poll(() => words(logseq, id), { timeout: 30_000 }).toEqual(['Alpha']);
    await expect(panel(page)).toHaveCount(0);
  });

  test('changes with the setting in an open tab, and leaves the default alone until it is set', async ({
    page,
    ext,
    articles,
  }) => {
    await openPage(page, ext, articles);

    // Never set: the page does not listen for anything.
    await page.keyboard.press('Control+Shift+KeyU');
    await page.keyboard.press('Control+Alt+KeyK');
    await expect(panel(page)).toHaveCount(0);

    await ext.setStorage({
      clipShortcut: { code: 'KeyK', ctrl: true, alt: true, shift: false, meta: false },
    });
    await expect(async () => {
      await page.keyboard.press('Control+Alt+KeyK');
      await expect(panel(page)).toBeVisible({ timeout: 1000 });
    }).toPass({ timeout: 15_000 });
    await page.keyboard.press('Escape');
    await expect(panel(page)).toHaveCount(0);

    // Another combo replaces it at once.
    await ext.setStorage({
      clipShortcut: { code: 'KeyJ', ctrl: true, alt: true, shift: false, meta: false },
    });
    await expect(async () => {
      await page.keyboard.press('Control+Alt+KeyJ');
      await expect(panel(page)).toBeVisible({ timeout: 1000 });
    }).toPass({ timeout: 15_000 });
    await page.keyboard.press('Escape');
    await page.keyboard.press('Control+Alt+KeyK');
    await expect(panel(page)).toHaveCount(0);
  });

  test('refuses a combo without Ctrl, Alt or Command, and the keys of the browser', async ({ ext }) => {
    const options = await ext.openPage('options.html#/settings');
    const alert = options.page!.getByRole('alert');

    await recorder(options).click();
    await options.page!.keyboard.press('Shift+KeyK');
    await expect(alert).toHaveText('Use Ctrl, Alt or ⌘ with a key');

    // Still recording: the next combo is tried.
    await options.page!.keyboard.press('ControlOrMeta+KeyT');
    await expect(alert).toHaveText('The browser keeps this shortcut');
    expect(await ext.getStorage('clipShortcut')).toBeFalsy();

    await options.page!.keyboard.press('Alt+KeyK');
    await expect(alert).toHaveCount(0);
    expect(await ext.getStorage('clipShortcut')).toMatchObject({ code: 'KeyK', alt: true });
  });

  test('Escape cancels the recording; reset removes the shortcut', async ({ ext }) => {
    await ext.setStorage({
      clipShortcut: { code: 'KeyK', ctrl: true, alt: true, shift: false, meta: false },
    });
    const options = await ext.openPage('options.html#/settings');
    await expect(recorder(options).locator('kbd').last()).toHaveText('K');

    await recorder(options).click();
    await options.page!.keyboard.press('Escape');
    await expect(recorder(options)).not.toContainText('Press keys');
    expect(await ext.getStorage('clipShortcut')).toMatchObject({ code: 'KeyK' });

    await options.page!.getByRole('button', { name: 'Reset shortcut' }).click();
    await expect.poll(() => ext.getStorage('clipShortcut')).toBeFalsy();
    await expect(options.page!.getByRole('button', { name: 'Reset shortcut' })).toHaveCount(0);
  });
});
