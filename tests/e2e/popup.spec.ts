import { expect, nonce, test } from './fixtures';

test.describe('popup', () => {
  test('searches the URL of the active tab and lists the matching block', async ({ page, ext }) => {
    await ext.connect();
    await page.goto('https://example.com/copilot/article');

    const popup = await ext.openPopup(page);
    await expect(popup.getByText('Reading notes from https://example.com/copilot/article')).toBeVisible();
    // The current page title comes from the target tab, not the popup.
    await expect(popup.getByText('Fixture /copilot/article')).toBeVisible();
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
      if (!(await popup.getByText(id).isVisible())) {
        await popup.close();
        popup = await ext.openPopup(page);
      }
      await expect(popup.getByText(id)).toBeVisible({ timeout: 5_000 });
    }).toPass({ timeout: 60_000 });

    const checkbox = popup.getByRole('checkbox');
    await expect(checkbox).not.toBeChecked();
    await checkbox.click();
    await expect(checkbox).toBeChecked();
    await expect.poll(() => logseq.taskMarker(uuid)).toBe('DONE');
  });
});
