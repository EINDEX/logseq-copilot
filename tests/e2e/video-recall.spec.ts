/**
 * #59: the sidebar of a video page shows the notes about that video, not the
 * notes about every video on the same path. Runs on both graph types
 * (LOGSEQ_VARIANT) with the real extension and Logseq.
 */
import { expect, nonce, test } from './fixtures';

const TEST_PAGE = 'Copilot Test Page';

test.describe('recall of a video page', () => {
  test('shows the notes of this video, not those of another one', async ({ page, ext, logseq }) => {
    const id = nonce('vid');
    const clipped = `${id}a`;
    const other = `${id}b`;
    const notClipped = `${id}z`;
    const note = (text: string) => logseq.callApi('logseq.Editor.appendBlockInPage', [TEST_PAGE, text]);
    await note(`[Talk ${clipped}](https://www.youtube.com/watch?v=${clipped})`);
    await note(`[Talk ${other}](https://www.youtube.com/watch?v=${other}&t=30s)`);
    await note(`[Short ${other}](https://youtu.be/${other}?si=abc)`);

    await ext.connect();
    // The video as the visitor has it: time, playlist and share parameters.
    await page.goto(`https://www.youtube.com/watch?v=${clipped}&t=5s&list=PL1&feature=share`);
    await page.waitForLoadState('load');

    // The URL search goes through Logseq's search index, which picks up new
    // blocks asynchronously: reopen the sidebar until the note shows up.
    let sidebar = await ext.openSidePanel(page);
    await expect(async () => {
      if (!(await sidebar.hasText(`Talk ${clipped}`))) {
        await sidebar.close();
        sidebar = await ext.openSidePanel(page);
      }
      await sidebar.expectText(`Talk ${clipped}`, { timeout: 5_000 });
    }).toPass({ timeout: 60_000 });
    expect(await sidebar.hasText(`Talk ${other}`)).toBe(false);
    expect(await sidebar.hasText(`Short ${other}`)).toBe(false);

    // Another video that was not clipped: the sidebar follows the tab.
    await page.goto(`https://www.youtube.com/watch?v=${notClipped}`);
    await sidebar.expectText('Nothing for this page yet');
    expect(await sidebar.hasText(`Talk ${clipped}`)).toBe(false);

    // A video that was clipped under another link shape.
    await page.goto(`https://www.youtube.com/watch?v=${other}`);
    await sidebar.expectText(`Talk ${other}`);
    await sidebar.expectText(`Short ${other}`);
    expect(await sidebar.hasText(`Talk ${clipped}`)).toBe(false);
  });
});
