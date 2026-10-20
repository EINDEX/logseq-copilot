import { expect, test } from './fixtures';
import { googleUrl } from './pages';

test.describe('search engine sidebar', () => {
  test('shows seeded blocks for the Google query and highlights the keyword', async ({ page, ext }) => {
    await ext.connect();
    await page.goto(googleUrl('copilot'));

    const sidebar = page.locator('#rhs logseq-copilot-search-engine');
    await expect(sidebar.getByText('Hello from copilot integration test')).toBeVisible();
    await expect(sidebar.locator('mark', { hasText: /^copilot$/i }).first()).toBeVisible();
    // The E2E build uses open shadow roots, which is what lets the locators
    // above see inside.
    expect(
      await page.evaluate(() => document.querySelector('logseq-copilot-search-engine')?.shadowRoot !== null),
    ).toBe(true);
  });

  test('follows the page theme (theme-detection on google.com)', async ({ page, ext }) => {
    await ext.connect();
    await page.goto(googleUrl('copilot'));

    const sidebar = page.locator('#rhs logseq-copilot-search-engine');
    await expect(sidebar.getByText('Hello from copilot integration test')).toBeVisible();
    const container = sidebar.locator('[data-theme-container]').first();
    await expect(container).not.toHaveClass(/\bdark\b/);

    // Google is detected by the body background luminance; a style change on
    // <body> re-runs the detection (setupThemeChangeListeners).
    await page.evaluate(() => {
      document.body.style.background = 'rgb(32, 33, 36)';
      document.body.style.color = 'rgb(232, 234, 237)';
    });
    await expect(container).toHaveClass(/\bdark\b/);

    await page.evaluate(() => {
      document.body.style.background = 'rgb(255, 255, 255)';
      document.body.style.color = 'rgb(32, 33, 36)';
    });
    await expect(container).not.toHaveClass(/\bdark\b/);
  });
});
