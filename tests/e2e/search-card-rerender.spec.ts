import { expect, test } from './fixtures';
import { bingUrl, braveUrl } from './pages';

/**
 * Result pages that render their columns again after load take the search
 * card out with them, as Brave Search did when Svelte replaced the
 * server-rendered page. The fixture pages do that about a second after
 * load, with the card in it (pages.ts, rerenderScript): the Brave page
 * renders its whole page again, the Bing page only its right rail. The
 * content script puts the same card back.
 */
const sites = [
  { name: 'Brave Search', url: braveUrl('copilot', { rerender: true }), column: '#mixed-side' },
  { name: 'Bing', url: bingUrl('copilot', { rerender: true }), column: '#b_context' },
];

test.describe('search card on a page that renders its column again', () => {
  for (const site of sites) {
    test(`${site.name}: the card comes back, once`, async ({ page, ext }) => {
      await ext.connect();
      await page.goto(site.url);

      // The page took the card out.
      await expect
        .poll(() => page.evaluate(() => (window as any).__rerendered?.hadCard ?? null))
        .toBe(true);

      const card = page.locator(`${site.column} logseq-copilot-search-engine`);
      await expect(card.getByText('Copilot Test Page', { exact: true })).toBeVisible();
      await expect(page.locator('logseq-copilot-search-engine')).toHaveCount(1);
      // The same card, moved: not a second one with a second search.
      expect(
        await page.evaluate(
          () => document.querySelector('logseq-copilot-search-engine') === (window as any).__rerendered.card,
        ),
      ).toBe(true);
    });
  }
});

/**
 * Bing as GitHub's runners get it removes elements added to the page with
 * class names it does not use (pages.ts, dropUnknownClassesScript). The
 * card's container has no class there, so it stays.
 */
test.describe('search card on Bing that removes elements with unknown classes', () => {
  test('the card stays in the right rail', async ({ page, ext }) => {
    await ext.connect();
    await page.goto(bingUrl('copilot', { strict: true }));

    const card = page.locator('#b_context logseq-copilot-search-engine');
    await expect(card.getByText('Copilot Test Page', { exact: true })).toBeVisible();
    await expect(page.locator('logseq-copilot-search-engine')).toHaveCount(1);
  });
});
