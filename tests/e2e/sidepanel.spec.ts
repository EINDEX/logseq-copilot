/**
 * The browser sidebar (sidepanel.html) beside a page: what Logseq has about
 * the page, the search in its header, and its clip actions. The same cases
 * as popup.spec.ts, on the sidebar; see ext.openSidePanel for how it is
 * opened.
 */
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

const SEARCH = 'input[type="search"]';
/** The row of the clip buttons. */
const CLIP_ACTIONS = '[role="group"][aria-label="Clip"]';

test.describe('browser sidebar', () => {
  test('lists what Logseq has about the page beside it', async ({ page, ext, logseq }) => {
    await ext.connect();
    await page.goto('https://example.com/copilot/article');

    const sidebar = await ext.openSidePanel(page);
    await sidebar.expectText('Reading notes from https://example.com/copilot/article');
    // The graph is named in the header. The API names a DB graph
    // `logseq_db_<name>`; Logseq and the sidebar show `<name>`.
    await sidebar.expectText(logseq.graph.replace(/^logseq_db_/, ''));
  });

  test('a search takes the place of the page until it is cleared, also when the page changes', async ({ page, ext }) => {
    await ext.connect();
    await page.goto('https://example.com/copilot/article');

    const sidebar = await ext.openSidePanel(page);
    await sidebar.expectText('Reading notes from https://example.com/copilot/article');
    await sidebar.fill(SEARCH, 'showcase');
    await sidebar.press(SEARCH, 'Enter');
    await sidebar.expectText('showcase parent block');
    expect(await sidebar.hasText('Reading notes from')).toBe(false);

    // The tab goes to another page: the search stays.
    await page.goto('https://example.com/copilot/other');
    await sidebar.expectText('showcase parent block');
    expect(await sidebar.inputValue(SEARCH)).toBe('showcase');

    // Escape clears it, and shows the page the tab is at now.
    await sidebar.press(SEARCH, 'Escape');
    expect(await sidebar.inputValue(SEARCH)).toBe('');
    await expect.poll(() => sidebar.hasText('showcase parent block')).toBe(false);

    await page.goto('https://example.com/copilot/article');
    await sidebar.expectText('Reading notes from https://example.com/copilot/article');
    await sidebar.fill(SEARCH, 'showcase');
    await sidebar.press(SEARCH, 'Enter');
    await sidebar.expectText('showcase parent block');

    // So does emptying the box.
    await sidebar.fill(SEARCH, '');
    await sidebar.expectText('Reading notes from https://example.com/copilot/article');
  });

  test('"Clip page" clips the page beside it, and lists the clip', async ({ page, ext, logseq, articles }) => {
    const id = nonce('sidepage');
    const url = `https://example.com/e2e/${id}`;
    articles.set(url, { title: `Sidebar page ${id}`, paragraph: `Words ${id}` });

    await ext.connect();
    await page.goto(url);
    await page.waitForLoadState('load');

    const sidebar = await ext.openSidePanel(page);
    await sidebar.expectText('Nothing for this page yet');
    await sidebar.clickButton('Clip page');

    await expect.poll(async () => (await logseq.findBlocks(id)).length, { timeout: 30_000 }).toBeGreaterThan(0);
    const [block] = await logseq.findBlocks(id);
    const content: string = block.content ?? block.title ?? '';
    expect(content).toContain(`[Sidebar page ${id}](${url})`);
    // Logseq is searched again for the page, and now has the clip about it.
    await sidebar.expectText(`Sidebar page ${id}`, { timeout: 30_000 });
  });

  test('offers "Clip selection" only while the page has a selection', async ({ page, ext, articles }) => {
    const id = nonce('sidenosel');
    const url = `https://example.com/e2e/${id}`;
    articles.set(url, { title: `Sidebar page ${id}`, paragraph: `Words ${id}` });

    await ext.connect();
    await page.goto(url);
    await page.waitForLoadState('load');

    const sidebar = await ext.openSidePanel(page);
    await sidebar.expectText('Nothing for this page yet');
    await sidebar.expectButtonEnabled('Clip selection', false);

    // The sidebar asks again when the pointer comes over the buttons, before
    // they can be clicked.
    await selectParagraph(page);
    await sidebar.hover(CLIP_ACTIONS);
    await sidebar.expectButtonEnabled('Clip selection');

    await page.evaluate(() => getSelection()!.removeAllRanges());
    await sidebar.hover('header form');
    await sidebar.hover(CLIP_ACTIONS);
    await sidebar.expectButtonEnabled('Clip selection', false);
  });

  test('"Clip selection" clips the selected text into the journal', async ({ page, ext, logseq, articles }) => {
    const id = nonce('sidesel');
    const url = `https://example.com/e2e/${id}`;
    articles.set(url, { title: `Sidebar clip ${id}`, paragraph: `Sidebar selected ${id} words` });

    await ext.connect();
    await page.goto(url);
    await page.waitForLoadState('load');
    expect(await selectParagraph(page)).toContain(id);

    const sidebar = await ext.openSidePanel(page);
    await sidebar.expectButtonEnabled('Clip selection');
    await sidebar.clickButton('Clip selection');

    await expect.poll(async () => (await logseq.findBlocks(id)).length, { timeout: 30_000 }).toBeGreaterThan(0);
    const [block] = await logseq.findBlocks(id);
    const content: string = block.content ?? block.title ?? '';
    expect(content).toContain(`[Sidebar clip ${id}](${url})`);
    expect(content).toContain(`Sidebar selected ${id} words`);
  });

  test('shows on the action why Clip page clipped nothing', async ({ page, ext }) => {
    await ext.connect();
    await page.goto('https://example.com/copilot/article');

    const sidebar = await ext.openSidePanel(page);
    await sidebar.expectText('Reading notes from https://example.com/copilot/article');
    // The search worked; the clip after it does not.
    await ext.connect({ token: 'wrong-token' });
    await sidebar.clickButton('Clip page');
    await sidebar.expectAlert('The authorization token is wrong');
    await sidebar.expectButtonInvalid('Clip page');
    // It can be tried again.
    await sidebar.expectButtonEnabled('Clip page');
  });
});
