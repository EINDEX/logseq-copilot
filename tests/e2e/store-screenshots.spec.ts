/**
 * Store listing screenshots (Chrome Web Store, Edge Add-ons, AMO):
 * store/screenshots/*.png, each exactly 1280x800, light mode, no captions.
 * Taken from the built extension on live pages (Wikipedia, DuckDuckGo) with
 * the demo notes of store-demo.ts in the test Logseq. Highlights are made by
 * selecting text with the mouse and clipping it, as a reader does.
 * Skipped unless STORE_SCREENSHOTS=1. Needs the network and a headed browser
 * (DuckDuckGo answers a headless one with a bot check):
 *
 *   BIN=$(scripts/download-logseq.sh file 0.10.15 .logseq-bin | tail -n 1)
 *   pnpm build:e2e
 *   STORE_SCREENSHOTS=1 E2E_HEADED=1 LOGSEQ_VARIANT=file LOGSEQ_BIN=$BIN \
 *     LOGSEQ_API_PORT=12399 pnpm test:e2e:run --project=chromium store-screenshots
 *
 * 02-sidebar.png is a composite: the browser's side panel is not exposed to
 * Playwright, so the page and sidepanel.html are taken one by one, in the
 * same browser, and put side by side. The others are single captures.
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import type { Page } from '@playwright/test';
import { expect, logseqInfo, test } from './fixtures';
import {
  DUCKDUCKGO,
  NOTE,
  PASSAGES,
  SEARCH_QUERY,
  articleBody,
  clickOn,
  dragSelect,
  inPageSidebar,
  openArticle,
  savedHighlights,
  scrollTextTo,
  seedNotes,
  textBox,
} from './store-demo';

const OUT_DIR = path.resolve(__dirname, '../../store/screenshots');
const WIDTH = 1280;
const HEIGHT = 800;
/** Stay under this size; the stores take more, but the repo keeps them. */
const MAX_BYTES = 480 * 1024;

test.skip(process.env.STORE_SCREENSHOTS !== '1', 'store screenshots: set STORE_SCREENSHOTS=1');
test.skip(({ browserName }) => browserName !== 'chromium', 'taken on Chromium only');

const sharp = () => createRequire(path.resolve(__dirname, '../../docs/package.json'))('sharp');

/**
 * Write a 1280x800 PNG. A capture at a device scale factor above 1
 * (E2E_DEVICE_SCALE_FACTOR) is scaled down to it. Quantized to a palette only
 * when the full-colour PNG is too large.
 */
const save = async (name: string, png: Buffer) => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const image = sharp()(png).resize(WIDTH, HEIGHT, { fit: 'fill', kernel: 'lanczos3' });
  let out: Buffer = await image.clone().png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer();
  if (out.length > MAX_BYTES) {
    out = await image.clone().png({ palette: true, quality: 95, effort: 10, colours: 256, dither: 0.6 }).toBuffer();
  }
  const meta = await sharp()(out).metadata();
  expect([meta.width, meta.height]).toEqual([WIDTH, HEIGHT]);
  expect(out.length).toBeLessThan(MAX_BYTES);
  fs.writeFileSync(path.join(OUT_DIR, name), out);
};

const shot = (page: Page) => page.screenshot({ animations: 'disabled', caret: 'hide' });

test.describe('store screenshots', () => {
  test.use({ fixtureSites: false });

  test.beforeEach(async ({ page, logseq }) => {
    test.skip(logseqInfo().variant !== 'file', 'the demo notes are written for the file graph');
    test.setTimeout(240_000);
    await page.emulateMedia({ colorScheme: 'light' });
    await page.setViewportSize({ width: WIDTH, height: HEIGHT });
    await seedNotes(logseq);
  });

  test('recall card on DuckDuckGo', async ({ page, ext }) => {
    await ext.connect();
    const host = page.locator('logseq-copilot-search-engine');
    const organic = page.locator('li[data-layout="organic"]');
    await expect(async () => {
      await page.goto(`${DUCKDUCKGO}?q=${SEARCH_QUERY}`);
      await expect(organic.first()).toBeVisible({ timeout: 15_000 });
      await expect(host.locator('.lc-page-name').getByText('Zettelkasten', { exact: true })).toBeVisible({ timeout: 8000 });
      await expect(host.getByText(/Principles of a/)).toBeVisible({ timeout: 8000 });
    }).toPass({ timeout: 120_000 });
    // The browser promotion every new profile gets: close it with its X.
    const promotion = page.getByText('Try the DuckDuckGo Browser');
    if (await promotion.isVisible()) await page.getByRole('button', { name: 'Dismiss', exact: true }).click();
    await expect(promotion).toBeHidden();
    await expect(page.getByText('start.duckduckgo.com')).toBeHidden({ timeout: 30_000 });
    await page.mouse.move(0, 0);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(500);
    await save('01-recall-card-duckduckgo.png', await shot(page));
  });

  // One browser for the three article shots: the highlights made by clipping
  // in the first steps are on the page and in Logseq for the later ones.
  test('article: in-page sidebar, clipping, browser sidebar', async ({ page, ext }) => {
    await ext.connect({ enableClipNoteFloatButton: true });
    await ext.setStorage({ inPageSidebarOpen: true });
    await openArticle(page);
    const body = articleBody(page);
    const sidebar = inPageSidebar(page);
    await expect(sidebar.getByRole('button', { name: 'Clip selection' })).toBeVisible();

    // Two passages of the lead: select with the mouse, then Clip selection.
    for (const [i, passage] of [PASSAGES.noteTaking, PASSAGES.wikis].entries()) {
      await dragSelect(page, body, passage, { ms: 300, glideMs: 100 });
      const clip = sidebar.getByRole('button', { name: 'Clip selection' });
      await expect(clip).toBeEnabled();
      await clip.click();
      await expect.poll(async () => (await savedHighlights(ext)).length).toBe(i + 1);
    }

    // A comment on the first one, in the popup a click on it opens.
    const first = await textBox(body, PASSAGES.noteTaking);
    await page.mouse.click(first.start.x + 30, first.start.y);
    const popup = page.locator('logseq-copilot-popup [data-highlight-popup]');
    await expect(popup).toBeVisible();
    await popup.getByRole('button', { name: 'Edit' }).click();
    await popup.getByPlaceholder('Add a comment to this highlight...').fill(NOTE);
    await popup.getByRole('button', { name: 'Save' }).click();
    await expect.poll(async () => (await savedHighlights(ext)).find((h: any) => h.note)?.note).toBe(NOTE);
    await page.keyboard.press('Escape');
    await page.mouse.click(5, HEIGHT - 5);
    await expect(popup).toBeHidden();

    // 03: the sidebar drawn on the page, with the highlights, the comment and
    // what Logseq has about the page (the demo notes and the two clips).
    await expect(async () => {
      await expect(sidebar.getByText(/Same idea as my Logseq pages/)).toBeVisible({ timeout: 3000 });
      await expect(sidebar.getByText(/Card files go back to the 17th century/)).toBeVisible({ timeout: 3000 });
      await expect(sidebar.getByText(/Read the Wikipedia article/)).toBeVisible({ timeout: 3000 });
    }).toPass({ timeout: 60_000 });
    await page.evaluate(() => {
      getSelection()?.removeAllRanges();
      window.scrollTo(0, 0);
    });
    // Past the moment of "done" after the last clip: nothing is selected.
    await expect(sidebar.getByRole('button', { name: 'Clip selection' })).toBeDisabled();
    await page.mouse.move(0, HEIGHT / 2);
    await page.waitForTimeout(500);
    await save('03-in-page-sidebar.png', await shot(page));

    // 04: clipping. The sidebar closed, a third passage selected with the
    // mouse, the clip button next to it, the earlier clips highlighted above.
    await sidebar.getByRole('button', { name: 'Close' }).click();
    await expect(sidebar).toHaveCount(0);
    // A line of the lead at the top edge, so no line is cut there.
    await scrollTextTo(page, body, 'such as numbers and', 6);
    await dragSelect(page, body, PASSAGES.numbered, { ms: 300, glideMs: 100 });
    const floatButton = page.locator('logseq-copilot-popup [title="Clip to Logseq"]');
    await expect(floatButton).toBeVisible();
    await page.waitForTimeout(300);
    await save('04-clip-selection.png', await shot(page));
    await clickOn(page, floatButton.locator('img'), { ms: 100, pause: 50 });
    await expect.poll(async () => (await savedHighlights(ext)).length).toBe(3);

    // 02: the browser sidebar beside the page (composite, see the top).
    const pageWidth = 880;
    await page.setViewportSize({ width: pageWidth, height: HEIGHT });
    await page.evaluate(() => {
      getSelection()?.removeAllRanges();
      window.scrollTo(0, 0);
    });
    const panel = await ext.openSidePanel(page);
    const panelPage = panel.page!;
    await panelPage.setViewportSize({ width: WIDTH - pageWidth - 1, height: HEIGHT });
    await panelPage.emulateMedia({ colorScheme: 'light' });
    await expect(async () => {
      await panelPage.reload();
      await ext.activate(page);
      await expect(panelPage.getByText(/Same idea as my Logseq pages/)).toBeVisible({ timeout: 4000 });
      await expect(panelPage.getByText(/numbered hierarchically/).first()).toBeVisible({ timeout: 4000 });
      await expect(panelPage.getByText(/Card files go back to the 17th century/)).toBeVisible({ timeout: 4000 });
    }).toPass({ timeout: 60_000 });
    await page.mouse.move(0, HEIGHT / 2);
    await page.waitForTimeout(500);
    const pagePng = await shot(page);
    const panelPng = await shot(panelPage);
    const compose = await page.context().newPage();
    await compose.setViewportSize({ width: WIDTH, height: HEIGHT });
    const uri = (png: Buffer) => `data:image/png;base64,${png.toString('base64')}`;
    await compose.setContent(`<body style="margin:0;display:flex;background:#d1d5db">
      <img src="${uri(pagePng)}" width="${pageWidth}" height="${HEIGHT}">
      <img src="${uri(panelPng)}" width="${WIDTH - pageWidth - 1}" height="${HEIGHT}" style="border-left:1px solid #d1d5db">
    </body>`);
    await save('02-sidebar.png', await shot(compose));
    await compose.close();
  });

  test('recall rule editor', async ({ page, ext }) => {
    await ext.connect();
    await page.goto(ext.url('options.html#/recall-rules'));
    await page.getByRole('button', { name: 'Edit GitHub Pull Request' }).click();
    await page.locator('#testUrl').fill('https://github.com/EINDEX/logseq-copilot/pull/115');
    await expect(page.getByText('✓ Matches · github.com/EINDEX/logseq-copilot')).toBeVisible();
    await expect(page.getByRole('radiogroup', { name: 'Recall scope' })).toBeVisible();
    await page.getByRole('heading', { name: 'Basics' }).click();
    await page.mouse.move(0, 0);
    await page.waitForTimeout(300);
    await save('05-recall-rule-editor.png', await shot(page));
  });
});
