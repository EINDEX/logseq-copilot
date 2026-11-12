/**
 * Which sidebar the toolbar button opens: the browser's own, or the one drawn
 * on pages (in-page-sidebar.spec.ts) where the browser does not show its own
 * (Arc) or the user chose it. Playwright cannot click the toolbar button
 * (nor fake the user action the browser sidebars need), so this checks what
 * decides it: the setting, Arc detection, and Chrome's side panel behavior.
 * The click handlers themselves are unit tested
 * (src/entrypoints/background/sidebar-action.test.ts).
 */
import { expect, test } from './fixtures';

// `chrome` inside ext.evaluate() callbacks (background context).
declare const chrome: typeof import('wxt/browser').browser;

test.describe('toolbar button', () => {
  test('the options switch picks the sidebar on pages', async ({ ext }) => {
    const options = await ext.openPage('options.html#/settings');
    const toggle = '#in-page-sidebar';
    await options.expectText('In-page sidebar');
    await expect.poll(() => options.isChecked(toggle)).toBe(false);

    await options.click(toggle);
    await expect.poll(() => ext.getStorage('inPageSidebar')).toBe(true);
    await expect.poll(() => options.isChecked(toggle)).toBe(true);

    await options.click(toggle);
    await expect.poll(() => ext.getStorage('inPageSidebar')).toBe(false);
  });

  test.describe('in Chromium', () => {
    test.skip(({ browserName }) => browserName !== 'chromium', 'the side panel is Chromium only');

    const opensSidePanel = (ext: { evaluate: <R>(fn: () => R | Promise<R>) => Promise<R> }) =>
      ext.evaluate(async () => (await chrome.sidePanel.getPanelBehavior()).openPanelOnActionClick);

    test('lets Chrome open the side panel, until the sidebar on pages is chosen', async ({ ext }) => {
      await expect.poll(() => opensSidePanel(ext)).toBe(true);

      await ext.setStorage({ inPageSidebar: true });
      await expect.poll(() => opensSidePanel(ext)).toBe(false);

      await ext.setStorage({ inPageSidebar: false });
      await expect.poll(() => opensSidePanel(ext)).toBe(true);
    });

    test('a page of Arc turns to the sidebar on pages', async ({ page, ext }) => {
      await expect.poll(() => opensSidePanel(ext)).toBe(true);

      // Arc's palette on the root element, as Arc puts it on every page. Set
      // once the page has loaded: the content script looks again a moment
      // later.
      await page.goto('https://example.com/copilot/article');
      await page.evaluate(() => {
        document.documentElement.style.setProperty('--arc-palette-background', '#1E1E2EFF');
      });

      await expect.poll(() => ext.getStorage('arcDetected')).toBe(true);
      await expect.poll(() => opensSidePanel(ext)).toBe(false);
      // The switch shows it.
      const options = await ext.openPage('options.html#/settings');
      await expect.poll(() => options.isChecked('#in-page-sidebar')).toBe(true);
    });
  });
});
