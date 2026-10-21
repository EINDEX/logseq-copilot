import { expect, nonce, test } from './fixtures';

test.describe('popup', () => {
  test('searches the URL of the active tab and lists the matching block', async ({ page, ext }) => {
    await ext.connect();
    await page.goto('https://example.com/copilot/article');

    const popup = await ext.openPopup(page);
    await popup.expectText('Reading notes from https://example.com/copilot/article');
    // The current page title comes from the target tab, not the popup.
    await popup.expectText('Fixture /copilot/article');
  });

  test('checking a task in the popup marks it DONE in Logseq', async ({ page, ext, logseq }) => {
    const id = nonce('popuptask');
    const url = `https://example.com/e2e/${id}`;
    const uuid = await logseq.createTask(`${id} read ${url}`);
    expect(await logseq.taskMarker(uuid)).toBe('TODO');

    await ext.connect();
    await page.goto(url);
    // The URL search goes through Logseq's search index, which picks up new
    // blocks asynchronously: reopen the popup until the block shows up.
    let popup = await ext.openPopup(page);
    await expect(async () => {
      if (!(await popup.hasText(id))) {
        await popup.close();
        popup = await ext.openPopup(page);
      }
      await popup.expectText(id, { timeout: 5_000 });
    }).toPass({ timeout: 60_000 });

    const checkbox = '[role="checkbox"]';
    expect(await popup.isChecked(checkbox)).toBe(false);
    await popup.click(checkbox);
    await expect.poll(() => popup.isChecked(checkbox)).toBe(true);
    await expect.poll(() => logseq.taskMarker(uuid)).toBe('DONE');
  });
});
