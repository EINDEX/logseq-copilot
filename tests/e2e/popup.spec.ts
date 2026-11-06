import type { Page } from '@playwright/test';
import { expect, nonce, test } from './fixtures';

/** Select the whole #target paragraph, like a user drag-selecting it. */
const selectParagraph = (page: Page) =>
  page.evaluate(() => {
    const range = document.createRange();
    range.selectNodeContents(document.getElementById('target')!);
    const selection = getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    return selection.toString();
  });

test.describe('popup', () => {
  test('searches the URL of the active tab and lists the matching block', async ({ page, ext, logseq }) => {
    await ext.connect();
    await page.goto('https://example.com/copilot/article');

    const popup = await ext.openPopup(page);
    await popup.expectText('Reading notes from https://example.com/copilot/article');
    // The current page title comes from the target tab, not the popup.
    await popup.expectText('Fixture /copilot/article');
    // The graph badge opens the graph in Logseq.
    await popup.expectButton(`Open ${logseq.graph} in Logseq`);
  });

  test('clearing a typed search shows the results for the page again', async ({ page, ext }) => {
    await ext.connect();
    await page.goto('https://example.com/copilot/article');

    const popup = await ext.openPopup(page);
    await popup.expectText('Reading notes from https://example.com/copilot/article');
    const search = 'input[placeholder^="Search in your Logseq graph"]';
    await popup.fill(search, 'showcase');
    await popup.press(search, 'Enter');
    await popup.expectText('showcase parent block');
    expect(await popup.hasText('Reading notes from')).toBe(false);

    await popup.fill(search, '');
    await popup.expectText('Reading notes from https://example.com/copilot/article');
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

  test('offers "Clip selection" only while the page has a selection', async ({ page, ext, articles }) => {
    const id = nonce('popupnosel');
    const url = `https://example.com/e2e/${id}`;
    articles.set(url, { title: `Popup page ${id}`, paragraph: `Words ${id}` });

    await ext.connect();
    await page.goto(url);
    await page.waitForLoadState('load');

    let popup = await ext.openPopup(page);
    await popup.expectText(`Popup page ${id}`);
    await popup.expectButtonEnabled('Clip selection', false);
    await popup.close();

    await selectParagraph(page);
    popup = await ext.openPopup(page);
    await popup.expectButtonEnabled('Clip selection');
  });

  test('"Clip selection" clips the selected text into the journal', async ({ page, ext, logseq, articles }) => {
    const id = nonce('popupsel');
    const url = `https://example.com/e2e/${id}`;
    articles.set(url, { title: `Popup clip ${id}`, paragraph: `Popup selected ${id} words` });

    await ext.connect();
    await page.goto(url);
    await page.waitForLoadState('load');
    expect(await selectParagraph(page)).toContain(id);

    const popup = await ext.openPopup(page);
    await popup.expectButtonEnabled('Clip selection');
    await popup.clickButton('Clip selection');

    await expect.poll(async () => (await logseq.findBlocks(id)).length, { timeout: 30_000 }).toBeGreaterThan(0);
    const [block] = await logseq.findBlocks(id);
    const content: string = block.content ?? block.title ?? '';
    expect(content).toContain(`[Popup clip ${id}](${url})`);
    expect(content).toContain(`Popup selected ${id} words`);
  });

  test('shows on the action why Clip page clipped nothing, and stays open', async ({ page, ext }) => {
    await ext.connect();
    await page.goto('https://example.com/copilot/article');

    const popup = await ext.openPopup(page);
    await popup.expectText('Reading notes from https://example.com/copilot/article');
    // The search worked; the clip after it does not.
    await ext.connect({ token: 'wrong-token' });
    await popup.clickButton('Clip page');
    await popup.expectAlert('The authorization token is wrong');
    await popup.expectButtonInvalid('Clip page');
    // Still open: the alert is in the popup, and it can be used again.
    await popup.expectButtonEnabled('Clip page');
  });

  test('does not repeat the error the search already shows', async ({ page, ext }) => {
    await ext.connect({ token: 'wrong-token' });
    await page.goto('https://example.com/copilot/article');

    const popup = await ext.openPopup(page);
    await popup.expectText('The authorization token is wrong');
    await popup.clickButton('Clip page');
    await popup.expectButtonInvalid('Clip page');
    expect(await popup.hasAlert('The authorization token is wrong')).toBe(false);
  });
});
