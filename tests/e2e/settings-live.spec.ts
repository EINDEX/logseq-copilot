import { expect, nonce, test } from './fixtures';
import { bingUrl } from './pages';

/**
 * A setting changed in the options page applies to pages that are already
 * open: nothing here reloads the page after the change.
 */
test.describe('settings apply to open pages without a reload', () => {
  test('the floating button option adds and removes the button', async ({ page, ext, articles }) => {
    const id = nonce('live-float');
    const url = `https://example.com/e2e/${id}`;
    articles.set(url, { title: `Live float ${id}`, paragraph: `Live float words ${id} end` });

    await ext.connect({ enableClipNoteFloatButton: false });
    await page.goto(url);
    await expect(page.locator('logseq-copilot-popup')).toBeAttached();
    await expect(page.locator('logseq-copilot-popup img.quickCapture')).toHaveCount(0);

    const options = await ext.openPage('options.html#/settings');
    await expect.poll(() => options.isChecked('#floating-button')).toBe(false);

    await options.click('#floating-button');
    await expect.poll(() => ext.getStorage('enableClipNoteFloatButton')).toBe(true);
    await expect(page.locator('logseq-copilot-popup img.quickCapture')).toHaveCount(1);

    await options.click('#floating-button');
    await expect.poll(() => ext.getStorage('enableClipNoteFloatButton')).toBe(false);
    await expect(page.locator('logseq-copilot-popup img.quickCapture')).toHaveCount(0);
    await options.close();
  });

  test('the search engine switch adds and removes the card on a results page', async ({ page, ext }) => {
    await ext.connect();
    await page.goto(bingUrl('copilot'));
    const card = page.locator('#b_context logseq-copilot-search-engine');
    await expect(card.getByText('Copilot Test Page', { exact: true })).toBeVisible();

    const options = await ext.openPage('options.html#/search-engine');
    await expect.poll(() => options.isChecked('#engine-bing')).toBe(true);

    await options.click('#engine-bing');
    await expect(page.locator('logseq-copilot-search-engine')).toHaveCount(0);

    await options.click('#engine-bing');
    await expect(card.getByText('Copilot Test Page', { exact: true })).toBeVisible();
    await expect(page.locator('logseq-copilot-search-engine')).toHaveCount(1);
    await options.close();
  });
});
