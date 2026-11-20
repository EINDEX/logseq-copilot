import { expect, test } from './fixtures';

// Chrome, Edge and Brave cannot change the shortcut of a command from an
// extension: the options row shows the browser's shortcut and opens the
// browser's shortcuts page. Firefox changes the real command with a recorder,
// which Playwright cannot press.
const mac = process.platform === 'darwin';

test.describe('clip shortcut row', () => {
  test.skip(({ browserName }) => browserName === 'firefox', 'Firefox has a recorder');

  const shortcutOf = (shortcut: string) => [
    { name: 'clip', shortcut, description: '' },
    { name: 'open-sidebar', shortcut: '', description: '' },
  ];

  test('shows the browser shortcut as keycaps, and Change opens the shortcuts page', async ({ ext }) => {
    const options = await ext.openPage('options.html#/settings');
    const page = options.page!;
    await page.evaluate((commands) => {
      (globalThis as any).chrome.commands.getAll = async () => commands;
      (window as any).__opened = [];
      (globalThis as any).chrome.tabs.create = async (props: { url: string }) => {
        (window as any).__opened.push(props.url);
        return {};
      };
      window.dispatchEvent(new Event('focus'));
    }, shortcutOf('Ctrl+Shift+U'));

    const row = page.locator('#clip-shortcut');
    await expect(row.locator('kbd')).toHaveText(mac ? ['⇧', '⌘', 'U'] : ['Ctrl', 'Shift', 'U']);
    // One entry point: no recorder, no reset, no second line.
    await expect(page.getByRole('button', { name: 'Reset shortcut' })).toHaveCount(0);
    await expect(page.getByText('Press keys')).toHaveCount(0);

    await page.getByRole('button', { name: 'Change' }).click();
    expect(await page.evaluate(() => (window as any).__opened)).toEqual([
      'chrome://extensions/shortcuts',
    ]);
  });

  test('says "Not set" without a shortcut, and follows it when the page gets focus back', async ({ ext }) => {
    const options = await ext.openPage('options.html#/settings');
    const page = options.page!;
    await page.evaluate((commands) => {
      (globalThis as any).chrome.commands.getAll = async () => commands;
      window.dispatchEvent(new Event('focus'));
    }, shortcutOf(''));

    const row = page.locator('#clip-shortcut');
    await expect(row).toHaveText('Not set');
    await expect(row.locator('kbd')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Change' })).toBeVisible();

    // The user sets one on the shortcuts page and comes back.
    await page.evaluate((commands) => {
      (globalThis as any).chrome.commands.getAll = async () => commands;
      window.dispatchEvent(new Event('focus'));
    }, shortcutOf('Alt+Shift+K'));
    await expect(row.locator('kbd')).toHaveText(mac ? ['⌥', '⇧', 'K'] : ['Alt', 'Shift', 'K']);
  });
});
