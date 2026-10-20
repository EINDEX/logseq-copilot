import { expect, nonce, test } from './fixtures';
import { googleUrl } from './pages';

test.describe('task status from the search sidebar', () => {
  test('checkbox toggles TODO <-> DONE in Logseq', async ({ page, ext, logseq }) => {
    const id = nonce('task');
    const uuid = await logseq.createTask(id);
    expect(await logseq.taskMarker(uuid)).toBe('TODO');

    await ext.connect();
    const sidebar = page.locator('#rhs logseq-copilot-search-engine');
    // New blocks reach Logseq's search index asynchronously.
    await expect(async () => {
      await page.goto(googleUrl(id));
      await expect(sidebar.getByText(id)).toBeVisible({ timeout: 5_000 });
    }).toPass({ timeout: 60_000 });

    const checkbox = sidebar.getByRole('checkbox');
    await expect(checkbox).not.toBeChecked();

    await checkbox.click();
    await expect(checkbox).toBeChecked();
    await expect.poll(() => logseq.taskMarker(uuid)).toBe('DONE');

    await checkbox.click();
    await expect(checkbox).not.toBeChecked();
    await expect.poll(() => logseq.taskMarker(uuid)).toBe('TODO');
  });
});
