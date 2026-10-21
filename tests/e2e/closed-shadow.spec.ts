import { expect, test } from './fixtures';
import { googleUrl } from './pages';

// The packaged build (`wxt build`, no WXT_E2E) must mount its UI in closed
// shadow roots, so page scripts get `null` from host.shadowRoot.
test.use({ extensionBuild: 'prod' });

test('packaged build mounts every in-page UI in a closed shadow root', async ({ page, ext }) => {
  await ext.connect({ enableClipNoteFloatButton: true });
  await page.goto(googleUrl('copilot'));

  const hosts = ['logseq-copilot-search-engine', 'logseq-copilot-popup'];
  for (const host of hosts) {
    await expect(page.locator(host)).toBeAttached();
  }
  const shadowRoots = await page.evaluate(
    (hosts) => hosts.map((h) => [h, document.querySelector(h)?.shadowRoot === null]),
    hosts,
  );
  expect(Object.fromEntries(shadowRoots)).toEqual(Object.fromEntries(hosts.map((h) => [h, true])));
});
