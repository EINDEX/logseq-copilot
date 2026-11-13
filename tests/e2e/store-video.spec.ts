/**
 * Raw video clips for the store listing video: one real scene per clip,
 * recorded with Playwright's recordVideo at 1280x800 CSS px, 30 fps, and
 * converted to MP4 (H.264, yuv420p, faststart) with ffmpeg. The clips are not
 * committed. Skipped unless STORE_VIDEO=1. Needs the network, a headed browser
 * and ffmpeg (FFMPEG, or `ffmpeg` on the PATH):
 *
 *   BIN=$(scripts/download-logseq.sh file 0.10.15 .logseq-bin | tail -n 1)
 *   npm pkg set version=2.0.0 && pnpm build && pnpm build:e2e; pnpm version:reset
 *   STORE_VIDEO=1 STORE_VIDEO_DIR=/path/to/clips E2E_DEVICE_SCALE_FACTOR=2 E2E_HEADED=1 \
 *     LOGSEQ_VARIANT=file LOGSEQ_BIN=$BIN LOGSEQ_API_PORT=12399 \
 *     pnpm test:e2e:run --project=chromium store-video
 *
 * The version is set for the build only, as for the screenshots (see
 * store-screenshots.spec.ts). With E2E_DEVICE_SCALE_FACTOR=2 the clips are
 * 2560x1600: the cut zooms into the card and the sidebar without upscaling.
 * Next to each clip, <name>.json has the boxes (CSS px) of what the scene is
 * about and when (seconds from the start of the clip), to place the zooms.
 *
 * Playwright draws no pointer: the pages get a visible dot that follows the
 * real mouse (cursorDot in store-demo.ts). Moves, typing and waits are paced
 * like a person's. Opening Logseq from a note (a logseq:// link handed to the
 * desktop app) is outside the browser and cannot be recorded here.
 *
 * Pages are set with their own settings and buttons, never painted over:
 * DuckDuckGo in "All regions" with no autocomplete (kl=wt-wt, kac=-1),
 * Wikipedia's Appearance panel closed with its "hide"; the pointer reaches a
 * passage from below so no footnote's reference popup opens on the way.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { BrowserContext, Locator, Page } from '@playwright/test';
import { expect, logseqInfo, test, type Extension } from './fixtures';
import {
  NOTE,
  PASSAGES,
  SEARCH_QUERY,
  aiControlsInView,
  articleBody,
  clickOn,
  cursorDot,
  dragSelect,
  duckDuckGoUrl,
  glide,
  inPageSidebar,
  openArticle,
  placePointer,
  savedHighlights,
  scrollTextTo,
  seedNotes,
  settleDuckDuckGo,
  textBox,
} from './store-demo';

const ROOT = path.resolve(__dirname, '../..');
const OUT_DIR = path.resolve(process.env.STORE_VIDEO_DIR || path.join(ROOT, 'test-results/store-video'));
const WEBM_DIR = path.join(ROOT, 'test-results/store-video-webm');
const SIZE = { width: 1280, height: 800 };
const SCALE = Number(process.env.E2E_DEVICE_SCALE_FACTOR) || 1;
const FPS = 30;
/** On the way to a passage, pass below its first line: no footnote on the way. */
const FROM_BELOW = { dx: 40, dy: 34 };

test.skip(process.env.STORE_VIDEO !== '1', 'store video: set STORE_VIDEO=1');
test.skip(({ browserName }) => browserName !== 'chromium', 'recorded on Chromium only');

const pause = (page: Page, ms: number) => page.waitForTimeout(ms);

/**
 * Note when Wikipedia opens a reference popup (Reference Previews) on the
 * page; a scene where one opened is not kept.
 */
function watchReferencePopups() {
  const seen = () => {
    if (document.querySelector('.mwe-popups')) (window as any).__referencePopup = true;
  };
  new MutationObserver(seen).observe(document, { childList: true, subtree: true });
}

/** Where things are in a scene, for the zooms of the cut (see the top). */
type Mark = { t: number; label: string; box: { x: number; y: number; width: number; height: number } };
const scenes = new WeakMap<Page, { start: number; marks: Mark[] }>();

async function mark(page: Page, label: string, target: Locator) {
  const box = await target.boundingBox();
  if (!box) return;
  const scene = scenes.get(page)!;
  const round = (n: number) => Math.round(n);
  scene.marks.push({
    t: Math.round((Date.now() - scene.start) / 100) / 10,
    label,
    box: { x: round(box.x), y: round(box.y), width: round(box.width), height: round(box.height) },
  });
}

/** A new tab for one scene, sized like the clip, with the pointer dot. */
async function scenePage(context: BrowserContext) {
  const page = await context.newPage();
  scenes.set(page, { start: Date.now(), marks: [] });
  await page.setViewportSize(SIZE);
  await page.emulateMedia({ colorScheme: 'light' });
  await placePointer(page, SIZE.width / 2, SIZE.height / 2);
  return page;
}

/** Close the scene's tab, keep its recording and convert it to MP4. */
async function saveClip(page: Page, name: string) {
  const video = page.video();
  if (!video) throw new Error('no video: recordVideo is off');
  const { marks } = scenes.get(page)!;
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
    '-r', String(FPS), '-movflags', '+faststart', '-an', mp4,
  ]);
  fs.writeFileSync(path.join(OUT_DIR, `${name}.json`), JSON.stringify({ scale: SCALE, size: SIZE, marks }, null, 2) + '\n');
  return mp4;
}

const noReferencePopup = async (page: Page) =>
  expect(await page.evaluate(() => (window as any).__referencePopup ?? false)).toBe(false);

/** Clip two passages and comment on one, out of the recorded scenes. */
async function makeHighlights(context: BrowserContext, ext: Extension) {
  const page = await context.newPage();
  await page.setViewportSize(SIZE);
  await ext.setStorage({ inPageSidebarOpen: true });
  await openArticle(page);
  const body = articleBody(page);
  const sidebar = inPageSidebar(page);
  for (const [i, passage] of [PASSAGES.noteTaking, PASSAGES.wikis].entries()) {
    await dragSelect(page, body, passage, { ms: 200, glideMs: 50, via: FROM_BELOW });
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
    recordVideo: {
      dir: WEBM_DIR,
      size: { width: SIZE.width * SCALE, height: SIZE.height * SCALE },
      fps: FPS,
    },
  });

  test.beforeEach(async ({ context, logseq }) => {
    test.skip(logseqInfo().variant !== 'file', 'the demo notes are written for the file graph');
    test.setTimeout(300_000);
    await context.addInitScript(cursorDot);
    await context.addInitScript(watchReferencePopups);
    await seedNotes(logseq);
  });

  test('a: search on DuckDuckGo, the recall card appears', async ({ context, page, ext }) => {
    await ext.connect();
    const host = page.locator('logseq-copilot-search-engine');
    const url = `${duckDuckGoUrl(SEARCH_QUERY)}&kac=-1`;
    // A take out of the clip first: a bot check, the browser promotion or the
    // region menu would spoil the recorded one. This tab's recording is not kept.
    await expect(async () => {
      await page.goto(url);
      await expect(host.getByText(/Principles of a/)).toBeVisible({ timeout: 15_000 });
    }).toPass({ timeout: 120_000 });
    await settleDuckDuckGo(page);

    // The result page of the same search, its query cleared and typed again:
    // the start page of DuckDuckGo's no-AI edition is all about AI.
    const scene = await scenePage(context);
    await scene.goto(url);
    const input = scene.locator('input[name="q"]').first();
    await expect(input).toBeVisible();
    const card = scene.locator('logseq-copilot-search-engine');
    await expect(card.getByText(/Principles of a/)).toBeVisible({ timeout: 30_000 });
    await expect(scene.getByTestId('region-filter-label')).toHaveText('All regions');
    expect(await aiControlsInView(scene)).toEqual([]);
    await pause(scene, 1500);
    await clickOn(scene, input, { ms: 900 });
    await pause(scene, 300);
    await scene.keyboard.press('ControlOrMeta+A');
    await pause(scene, 250);
    await scene.keyboard.press('Backspace');
    await pause(scene, 700);
    await mark(scene, 'typing', input);
    await scene.keyboard.type(SEARCH_QUERY, { delay: 140 });
    await pause(scene, 600);
    await scene.keyboard.press('Enter');
    await expect(card.getByText(/Principles of a/)).toBeVisible({ timeout: 30_000 });
    await mark(scene, 'card', card);
    expect(await aiControlsInView(scene)).toEqual([]);
    await pause(scene, 1500);
    // Over to the card, down its notes.
    const box = (await card.boundingBox())!;
    await glide(scene, box.x + box.width / 2, box.y + 40, 1100);
    await pause(scene, 800);
    await glide(scene, box.x + box.width / 2, box.y + Math.min(box.height, 600) * 0.7, 1400);
    await pause(scene, 2500);
    expect(await aiControlsInView(scene)).toEqual([]);
    await saveClip(scene, 'a-search-recall-card');
  });

  test('b and c: the in-page sidebar, then a clip', async ({ context, page, ext }) => {
    await ext.connect();
    const setup = await makeHighlights(context, ext);

    // b: back on the article, further down it; the sidebar shows its
    // highlights, the comment and what Logseq has about it.
    const b = await scenePage(context);
    await setup.close();
    await page.close();
    await openArticle(b);
    await scrollTextTo(b, articleBody(b), 'The paper slip or card has long been used', 160);
    const sidebar = inPageSidebar(b);
    await expect(sidebar.getByText(/Same idea as my Logseq pages/)).toBeVisible();
    await expect(sidebar.getByText(/Card files go back to the 17th century/)).toBeVisible({ timeout: 30_000 });
    await expect(b.locator('#vector-appearance-pinned-container')).toBeHidden();
    await pause(b, 1500);
    const note = sidebar.getByText(/Same idea as my Logseq pages/);
    await mark(b, 'note', note);
    const noteBox = (await note.boundingBox())!;
    await glide(b, noteBox.x + noteBox.width / 2, noteBox.y + noteBox.height / 2, 1100);
    await pause(b, 1500);
    // A highlight in the sidebar: the page scrolls to it.
    const wikisItem = sidebar.getByText(/such software inspired the invention/).first();
    await mark(b, 'click-highlight', wikisItem);
    await clickOn(b, wikisItem, { ms: 900 });
    await pause(b, 900);
    const scrolledTo = (await textBox(articleBody(b), PASSAGES.wikis));
    scenes.get(b)!.marks.push({
      t: Math.round((Date.now() - scenes.get(b)!.start) / 100) / 10,
      label: 'page-highlight',
      box: {
        x: Math.round(scrolledTo.start.x),
        y: Math.round(scrolledTo.top),
        width: Math.round(Math.max(1, scrolledTo.end.x - scrolledTo.start.x)),
        height: Math.round(scrolledTo.bottom - scrolledTo.top),
      },
    });
    await pause(b, 900);
    const recall = sidebar.getByText(/Card files go back to the 17th century/);
    await recall.scrollIntoViewIfNeeded();
    await mark(b, 'recall', recall);
    const recallBox = (await recall.boundingBox())!;
    await glide(b, recallBox.x + recallBox.width / 2, recallBox.y + recallBox.height / 2, 1100);
    await pause(b, 2500);
    await noReferencePopup(b);
    await saveClip(b, 'b-in-page-sidebar');

    // c: select a passage and clip it from the sidebar.
    const c = await scenePage(context);
    await openArticle(c);
    const cSidebar = inPageSidebar(c);
    const body = articleBody(c);
    await expect(cSidebar.getByText(/Same idea as my Logseq pages/)).toBeVisible();
    await scrollTextTo(c, body, PASSAGES.numbered, 380);
    await pause(c, 1500);
    const passage = await textBox(body, PASSAGES.numbered);
    scenes.get(c)!.marks.push({
      t: Math.round((Date.now() - scenes.get(c)!.start) / 100) / 10,
      label: 'passage',
      box: {
        x: Math.round(passage.start.x),
        y: Math.round(passage.top),
        width: Math.round(passage.end.x - passage.start.x),
        height: Math.round(passage.bottom - passage.top),
      },
    });
    await dragSelect(c, body, PASSAGES.numbered, { ms: 2200, glideMs: 1000, via: FROM_BELOW });
    await pause(c, 900);
    const clipButton = cSidebar.getByRole('button', { name: 'Clip selection' });
    await expect(clipButton).toBeEnabled();
    await mark(c, 'clip-button', clipButton);
    // Down off the line first: the footnote right after the passage stays unhovered.
    await glide(c, passage.end.x - 30, passage.bottom + 22, 400);
    await clickOn(c, clipButton, { ms: 1100, pause: 400 });
    await expect.poll(async () => (await savedHighlights(ext)).length).toBe(3);
    const added = cSidebar.getByText(/numbered hierarchically/).first();
    await expect(added).toBeVisible();
    await mark(c, 'added', added);
    await pause(c, 1500);
    const addedBox = (await added.boundingBox())!;
    await glide(c, addedBox.x + addedBox.width / 2, addedBox.y + addedBox.height / 2, 1100);
    await pause(c, 3000);
    await noReferencePopup(c);
    await saveClip(c, 'c-clip-selection');
  });
});
