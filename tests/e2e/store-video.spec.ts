/**
 * Raw video clips for the store listing video: one real scene per clip,
 * recorded with Playwright's recordVideo at 1280x800 and converted to MP4
 * (H.264, yuv420p, faststart) with ffmpeg. The clips are not committed.
 * Skipped unless STORE_VIDEO=1. Needs the network, a headed browser and
 * ffmpeg (FFMPEG, or `ffmpeg` on the PATH):
 *
 *   BIN=$(scripts/download-logseq.sh file 0.10.15 .logseq-bin | tail -n 1)
 *   pnpm build:e2e
 *   STORE_VIDEO=1 STORE_VIDEO_DIR=/path/to/clips E2E_HEADED=1 LOGSEQ_VARIANT=file \
 *     LOGSEQ_BIN=$BIN LOGSEQ_API_PORT=12399 pnpm test:e2e:run --project=chromium store-video
 *
 * Playwright draws no pointer: the pages get a visible dot that follows the
 * real mouse (cursorDot in store-demo.ts). Moves, typing and waits are paced
 * like a person's. Opening Logseq from a note (a logseq:// link handed to the
 * desktop app) is outside the browser and cannot be recorded here.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { BrowserContext, Page } from '@playwright/test';
import { expect, logseqInfo, test, type Extension } from './fixtures';
import {
  DUCKDUCKGO,
  NOTE,
  PASSAGES,
  SEARCH_QUERY,
  articleBody,
  clickOn,
  cursorDot,
  dragSelect,
  glide,
  inPageSidebar,
  openArticle,
  placePointer,
  savedHighlights,
  scrollTextTo,
  seedNotes,
  textBox,
} from './store-demo';

const ROOT = path.resolve(__dirname, '../..');
const OUT_DIR = path.resolve(process.env.STORE_VIDEO_DIR || path.join(ROOT, 'test-results/store-video'));
const WEBM_DIR = path.join(ROOT, 'test-results/store-video-webm');
const SIZE = { width: 1280, height: 800 };

test.skip(process.env.STORE_VIDEO !== '1', 'store video: set STORE_VIDEO=1');
test.skip(({ browserName }) => browserName !== 'chromium', 'recorded on Chromium only');

const pause = (page: Page, ms: number) => page.waitForTimeout(ms);

/** A new tab for one scene, sized like the clip, with the pointer dot. */
async function scenePage(context: BrowserContext) {
  const page = await context.newPage();
  await page.setViewportSize(SIZE);
  await page.emulateMedia({ colorScheme: 'light' });
  await placePointer(page, SIZE.width / 2, SIZE.height / 2);
  return page;
}

/** Close the scene's tab, keep its recording and convert it to MP4. */
async function saveClip(page: Page, name: string) {
  const video = page.video();
  if (!video) throw new Error('no video: recordVideo is off');
  // Keep a tab open: the profile cannot open a page once the last one is closed.
  if (page.context().pages().length === 1) await page.context().newPage();
  await page.close();
  fs.mkdirSync(WEBM_DIR, { recursive: true });
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const webm = path.join(WEBM_DIR, `${name}.webm`);
  await video.saveAs(webm);
  const mp4 = path.join(OUT_DIR, `${name}.mp4`);
  execFileSync(process.env.FFMPEG || 'ffmpeg', [
    '-y', '-loglevel', 'error', '-i', webm,
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p',
    '-r', '30', '-movflags', '+faststart', '-an', mp4,
  ]);
  return mp4;
}

/** Clip two passages and comment on one, out of the recorded scenes. */
async function makeHighlights(context: BrowserContext, ext: Extension) {
  const page = await context.newPage();
  await page.setViewportSize(SIZE);
  await openArticle(page);
  const body = articleBody(page);
  const sidebar = inPageSidebar(page);
  for (const [i, passage] of [PASSAGES.noteTaking, PASSAGES.wikis].entries()) {
    await dragSelect(page, body, passage, { ms: 200, glideMs: 50 });
    await sidebar.getByRole('button', { name: 'Clip selection' }).click();
    await expect.poll(async () => (await savedHighlights(ext)).length).toBe(i + 1);
  }
  const first = await textBox(body, PASSAGES.noteTaking);
  await page.mouse.click(first.start.x + 30, first.start.y);
  const popup = page.locator('logseq-copilot-popup [data-highlight-popup]');
  await popup.getByRole('button', { name: 'Edit' }).click();
  await popup.getByPlaceholder('Add a comment to this highlight...').fill(NOTE);
  await popup.getByRole('button', { name: 'Save' }).click();
  await expect.poll(async () => (await savedHighlights(ext)).find((h: any) => h.note)?.note).toBe(NOTE);
  return page;
}

test.describe('store video', () => {
  test.use({
    fixtureSites: false,
    recordVideo: { dir: WEBM_DIR, size: SIZE },
  });

  test.beforeEach(async ({ context, logseq }) => {
    test.skip(logseqInfo().variant !== 'file', 'the demo notes are written for the file graph');
    test.setTimeout(300_000);
    await context.addInitScript(cursorDot);
    await seedNotes(logseq);
  });

  test('a: search on DuckDuckGo, the recall card appears', async ({ context, page, ext }) => {
    await ext.connect();
    const host = page.locator('logseq-copilot-search-engine');
    // A take out of the clip first: a bot check or the browser promotion
    // would spoil the recorded one. This tab's recording is not kept.
    await expect(async () => {
      await page.goto(`${DUCKDUCKGO}?q=${SEARCH_QUERY}`);
      await expect(host.getByText(/Principles of a/)).toBeVisible({ timeout: 15_000 });
    }).toPass({ timeout: 120_000 });
    const promotion = page.getByText('Try the DuckDuckGo Browser');
    if (await promotion.isVisible()) await page.getByRole('button', { name: 'Dismiss', exact: true }).click();

    // From the result page of a broader search (the article's other name):
    // the start page of DuckDuckGo's no-AI edition is all about AI.
    const scene = await scenePage(context);
    await scene.goto(`${DUCKDUCKGO}?q=card+file`);
    const input = scene.locator('input[name="q"]').first();
    await expect(input).toBeVisible();
    await expect(scene.locator('logseq-copilot-search-engine')).toBeVisible({ timeout: 30_000 });
    await pause(scene, 1500);
    await clickOn(scene, input, { ms: 900 });
    await pause(scene, 300);
    await scene.keyboard.press('ControlOrMeta+A');
    await pause(scene, 500);
    await scene.keyboard.type(SEARCH_QUERY, { delay: 140 });
    await pause(scene, 600);
    await scene.keyboard.press('Enter');
    const card = scene.locator('logseq-copilot-search-engine');
    await expect(card.getByText(/Principles of a/)).toBeVisible({ timeout: 30_000 });
    await pause(scene, 1500);
    // Over to the card, down its notes.
    const box = (await card.boundingBox())!;
    await glide(scene, box.x + box.width / 2, box.y + 40, 1100);
    await pause(scene, 800);
    await glide(scene, box.x + box.width / 2, box.y + Math.min(box.height, 600) * 0.7, 1400);
    await pause(scene, 2500);
    await saveClip(scene, 'a-search-recall-card');
  });

  test('b and c: the in-page sidebar, then a clip', async ({ context, page, ext }) => {
    await ext.connect();
    await ext.setStorage({ inPageSidebarOpen: true });
    const setup = await makeHighlights(context, ext);

    // b: open the article; the sidebar shows its highlights, the comment and
    // what Logseq has about it.
    const b = await scenePage(context);
    await setup.close();
    await page.close();
    await openArticle(b);
    const sidebar = inPageSidebar(b);
    await expect(sidebar.getByText(/Same idea as my Logseq pages/)).toBeVisible();
    await expect(sidebar.getByText(/Card files go back to the 17th century/)).toBeVisible({ timeout: 30_000 });
    await pause(b, 1500);
    const note = sidebar.getByText(/Same idea as my Logseq pages/);
    const noteBox = (await note.boundingBox())!;
    await glide(b, noteBox.x + noteBox.width / 2, noteBox.y + noteBox.height / 2, 1100);
    await pause(b, 1500);
    // A highlight in the sidebar: the page scrolls to it.
    await clickOn(b, sidebar.getByText(/such software inspired the invention/).first(), { ms: 900 });
    await pause(b, 1800);
    const recall = sidebar.getByText(/Card files go back to the 17th century/);
    await recall.scrollIntoViewIfNeeded();
    const recallBox = (await recall.boundingBox())!;
    await glide(b, recallBox.x + recallBox.width / 2, recallBox.y + recallBox.height / 2, 1100);
    await pause(b, 2500);
    await saveClip(b, 'b-in-page-sidebar');

    // c: select a passage and clip it from the sidebar.
    const c = await scenePage(context);
    await openArticle(c);
    const cSidebar = inPageSidebar(c);
    const body = articleBody(c);
    await expect(cSidebar.getByText(/Same idea as my Logseq pages/)).toBeVisible();
    await scrollTextTo(c, body, PASSAGES.numbered, 380);
    await pause(c, 1500);
    await dragSelect(c, body, PASSAGES.numbered, { ms: 2200, glideMs: 1000 });
    await pause(c, 900);
    const clipButton = cSidebar.getByRole('button', { name: 'Clip selection' });
    await expect(clipButton).toBeEnabled();
    await clickOn(c, clipButton, { ms: 1100, pause: 400 });
    await expect.poll(async () => (await savedHighlights(ext)).length).toBe(3);
    const added = cSidebar.getByText(/numbered hierarchically/).first();
    await expect(added).toBeVisible();
    await pause(c, 1500);
    const addedBox = (await added.boundingBox())!;
    await glide(c, addedBox.x + addedBox.width / 2, addedBox.y + addedBox.height / 2, 1100);
    await pause(c, 3000);
    await saveClip(c, 'c-clip-selection');
  });
});
