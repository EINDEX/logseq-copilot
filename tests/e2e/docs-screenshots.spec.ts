/**
 * Screenshots for the docs site (docs/public/screenshots/), taken from the
 * built extension against the test Logseq, with demo notes written through
 * its API. Light mode only. Skipped unless DOCS_SCREENSHOTS=1, so the default
 * e2e run (and CI) does not change.
 *
 *   BIN=$(scripts/download-logseq.sh file 0.10.15 .logseq-bin | tail -n 1)
 *   pnpm build && pnpm build:e2e
 *   DOCS_SCREENSHOTS=1 E2E_DEVICE_SCALE_FACTOR=2 LOGSEQ_VARIANT=file LOGSEQ_BIN=$BIN \
 *     LOGSEQ_API_PORT=12399 pnpm test:e2e:run --project=chromium docs-screenshots
 *
 * recall-card.png is taken on the real DuckDuckGo result page, so it needs
 * the network and a headed browser; add DOCS_SCREENSHOTS_LIVE=1 E2E_HEADED=1.
 *
 * The PNGs are quantized to a palette when `sharp` can be loaded (it is a
 * dependency of docs/), which keeps each one well under 400 KB.
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import type { Page } from '@playwright/test';
import { expect, logseqInfo, test } from './fixtures';

const OUT_DIR = path.resolve(__dirname, '../../docs/public/screenshots');
const ARTICLE_URL = 'https://example.com/blog/notes-for-busy-people';
const ARTICLE_TITLE = 'Zettelkasten for busy people';
const PARAGRAPHS = [
  'A zettelkasten is a collection of short notes, each about one idea, that link to each other. You do not need a system to start. Write ten notes and see what connects.',
  'Write every note in your own words, then link it to one note you already have. The links are what make the pile useful a year from now.',
  'Keep the habit small. Ten minutes at the end of the day is enough to turn the things you read into notes you will find again.',
  'Do not sort notes into folders. A note about a recipe may belong with a note about chemistry, and a link can say that. A folder cannot.',
];

test.skip(process.env.DOCS_SCREENSHOTS !== '1', 'docs screenshots: set DOCS_SCREENSHOTS=1');
test.skip(({ browserName }) => browserName !== 'chromium', 'taken on Chromium only');

const articleHtml = () => `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>${ARTICLE_TITLE}</title>
<style>
  html { background: #fff; }
  body { max-width: 640px; margin: 0 auto; padding: 56px 32px; color: #1f2933;
    font: 18px/1.65 Georgia, 'Times New Roman', serif; }
  h1 { font: 700 34px/1.2 -apple-system, 'Segoe UI', Helvetica, sans-serif; margin: 0 0 8px; }
  .byline { font: 14px -apple-system, 'Segoe UI', Helvetica, sans-serif; color: #6b7280; margin-bottom: 32px; }
  p { margin: 0 0 20px; }
</style>
</head>
<body>
  <h1>${ARTICLE_TITLE}</h1>
  <div class="byline">Nov 3, 2026 · 4 min read</div>
  ${PARAGRAPHS.map((text) => `<p>${text}</p>`).join('\n  ')}
</body>
</html>`;

const highlightOf = (index: number, text: string, extra: object = {}) => ({
  id: `docs-shot-${index}`,
  url: ARTICLE_URL,
  title: ARTICLE_TITLE,
  hostname: 'example.com',
  range: {
    startContainerXPath: `/html/body/p[${index}]/text()[1]`,
    endContainerXPath: `/html/body/p[${index}]/text()[1]`,
    startOffset: 0,
    endOffset: text.length,
    textContent: text,
  },
  createdAt: Date.now() - index * 3 * 60 * 1000,
  lastAccessedAt: Date.now(),
  color: 'yellow',
  ...extra,
});

const lightPage = (page: Page) =>
  page.evaluate(() => {
    document.documentElement.classList.remove('dark');
    document.documentElement.classList.add('light');
    document.body.classList.remove('dark');
  });

/** Write a PNG for the docs: quantized when sharp is available. */
const save = async (name: string, png: Buffer) => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  let out = png;
  try {
    const sharp = createRequire(path.resolve(__dirname, '../../docs/package.json'))('sharp');
    out = await sharp(png).png({ palette: true, quality: 90, effort: 10, colours: 128 }).toBuffer();
  } catch {
    // Keep the original.
  }
  fs.writeFileSync(path.join(OUT_DIR, name), out);
};

test.describe('docs screenshots', () => {
  test.beforeEach(async ({ page, articles, context, logseq }) => {
    test.skip(logseqInfo().variant !== 'file', 'the demo notes are written for the file graph');
    await page.emulateMedia({ colorScheme: 'light' });
    articles.set(ARTICLE_URL, { title: ARTICLE_TITLE, paragraph: PARAGRAPHS[0] });
    // A nicer article than the fixture one (registered last, tried first).
    await context.route(ARTICLE_URL, (route) =>
      route.fulfill({ contentType: 'text/html', body: articleHtml() }),
    );

    // One Logseq serves the whole run (a failed test restarts the worker, not
    // Logseq): write the demo notes once.
    if ((await logseq.findBlocks('Sources for the method')).length > 0) return;
    // What the graph has about zettelkasten, and about the article.
    const append = (pageName: string, content: string) =>
      logseq.callApi('logseq.Editor.appendBlockInPage', [pageName, content]);
    const child = (parent: string, content: string) =>
      logseq.callApi('logseq.Editor.insertBlock', [parent, content, { sibling: false }]);

    await append('Zettelkasten', 'A note system built from small notes that link to each other. See [[Second brain]].');
    const principles = await append('Zettelkasten', 'Principles of a zettelkasten');
    await child(principles.uuid, 'One idea per note, written in your own words');
    await child(principles.uuid, 'Every zettelkasten note links to at least one older note');

    await append('Reading List', 'DONE Finish the chapter on the zettelkasten in How to Take Smart Notes');
    await append('Reading List', `TODO Read Zettelkasten for busy people ${ARTICLE_URL}`);

    const review = await append('Weekly review', 'Inbox');
    const process = await child(review.uuid, 'Process the fleeting notes');
    await child(process.uuid, 'Turn each fleeting note into a zettelkasten card and link it to an older card');

    const sources = await append('Second brain', `Sources for the method ${ARTICLE_URL}`);
    await child(sources.uuid, `Start with ten notes and let the links grow ${ARTICLE_URL}`);
  });

  test('browser sidebar next to a page', async ({ page, ext, logseq }) => {
    await page.setViewportSize({ width: 800, height: 700 });
    await ext.connect();
    await ext.setStorage({
      highlights: [
        highlightOf(1, PARAGRAPHS[0], { note: 'Compare with how I link pages in Logseq.', tags: ['pkm'] }),
        highlightOf(2, PARAGRAPHS[1]),
      ],
    });
    await page.goto(ARTICLE_URL);
    await expect.poll(() => page.evaluate(() => CSS.highlights.size)).toBeGreaterThan(0);

    const sidebar = await page.context().newPage();
    await sidebar.setViewportSize({ width: 380, height: 700 });
    await sidebar.emulateMedia({ colorScheme: 'light' });
    // The index of a block written a moment ago can lag: try again.
    await expect(async () => {
      await sidebar.goto(ext.url('sidepanel.html'));
      await ext.activate(page);
      await expect(sidebar.getByText('Compare with how I link pages in Logseq.')).toBeVisible({ timeout: 4000 });
      await expect(sidebar.getByText(/Read Zettelkasten for busy people/)).toBeVisible({ timeout: 4000 });
      await expect(sidebar.getByText(/Start with ten notes/)).toBeVisible({ timeout: 4000 });
      await expect(sidebar.getByRole('link', { name: logseq.graph })).toBeVisible({ timeout: 4000 });
    }).toPass({ timeout: 60_000 });
    await page.mouse.move(0, 0);

    const pagePng = await page.screenshot({ animations: 'disabled' });
    const sidebarPng = await sidebar.screenshot({ animations: 'disabled' });

    // The browser window: the page, and the side panel on its right.
    const compose = await page.context().newPage();
    await compose.setViewportSize({ width: 1180, height: 700 });
    const uri = (png: Buffer) => `data:image/png;base64,${png.toString('base64')}`;
    await compose.setContent(`<body style="margin:0;display:flex;background:#d1d5db">
      <img src="${uri(pagePng)}" width="800" height="700">
      <img src="${uri(sidebarPng)}" width="380" height="700" style="border-left:1px solid #d1d5db">
    </body>`);
    await save('sidebar.png', await compose.screenshot());
    await compose.close();
    await sidebar.close();
  });

  // The real DuckDuckGo result page, not a fixture: needs the network and a
  // headed browser (E2E_HEADED=1), and DOCS_SCREENSHOTS_LIVE=1 on top of
  // DOCS_SCREENSHOTS=1. The page can answer with a bot check; then the test
  // fails and recall-card.png stays as it is.
  test.describe('live', () => {
    test.skip(process.env.DOCS_SCREENSHOTS_LIVE !== '1', 'live: set DOCS_SCREENSHOTS_LIVE=1');
    test.use({ fixtureSites: false });

    test('recall card on DuckDuckGo', async ({ page, ext }) => {
      test.setTimeout(180_000);
      await page.setViewportSize({ width: 1280, height: 1000 });
      await ext.connect();
      const host = page.locator('logseq-copilot-search-engine');
      const organic = page.locator('li[data-layout="organic"]');
      await expect(async () => {
        await page.goto('https://duckduckgo.com/?q=zettelkasten');
        await expect(organic.first()).toBeVisible({ timeout: 15_000 });
        await expect(host.locator('.lc-page-name').getByText('Zettelkasten', { exact: true })).toBeVisible({ timeout: 8000 });
        await expect(host.getByText(/Turn each fleeting note/)).toBeVisible({ timeout: 8000 });
      }).toPass({ timeout: 120_000 });
      // The browser promotion every new profile gets: close it with its X.
      const promotion = page.getByText('Try the DuckDuckGo Browser');
      if (await promotion.isVisible()) await page.getByRole('button', { name: 'Dismiss', exact: true }).click();
      await expect(promotion).toBeHidden();
      // Its closing note fades out by itself.
      await expect(page.getByText('start.duckduckgo.com')).toBeHidden({ timeout: 30_000 });
      await lightPage(page);
      await page.mouse.move(0, 0);
      await page.evaluate(() => window.scrollTo(0, 0));
      const results = (await organic.first().boundingBox())!;
      const card = (await host.boundingBox())!;
      const second = (await organic.nth(1).boundingBox())!;
      const margin = 24;
      const x = Math.max(0, Math.min(results.x, card.x) - margin);
      // From the card down: the bar above it holds the visitor's region.
      const y = Math.max(0, card.y - 8);
      await save('recall-card.png', await page.screenshot({
        animations: 'disabled',
        clip: { x, y, width: Math.min(1280 - x, card.x + card.width + margin - x), height: second.y + second.height + margin - y },
      }));
    });
  });

  test('Settings, Sidebar, In-page sidebar', async ({ page, ext }) => {
    await page.setViewportSize({ width: 900, height: 900 });
    await ext.connect();
    await page.goto(ext.url('options.html#/settings'));
    await expect(page.getByRole('button', { name: /Connected to Logseq v/ })).toBeVisible();
    const section = page.locator('section', { has: page.getByRole('heading', { name: 'Sidebar', exact: true }) });
    await expect(section.getByRole('switch', { name: 'In-page sidebar' })).toBeVisible();
    const box = (await section.boundingBox())!;
    const margin = 16;
    await page.mouse.move(0, 0);
    // From just under the rule that opens the section.
    await save('settings-in-page-sidebar.png', await page.screenshot({
      animations: 'disabled',
      clip: { x: Math.max(0, box.x - margin), y: box.y + 2, width: box.width + 2 * margin, height: box.height + margin - 2 },
    }));
  });

  test('sidebar drawn on the page', async ({ page, ext }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await ext.connect();
    await ext.setStorage({
      highlights: [
        highlightOf(1, PARAGRAPHS[0], { note: 'Compare with how I link pages in Logseq.', tags: ['pkm'] }),
        highlightOf(2, PARAGRAPHS[1]),
      ],
      inPageSidebarOpen: true,
    });
    await page.goto(ARTICLE_URL);
    const host = page.locator('logseq-copilot-highlights');
    await expect(host.getByText('Compare with how I link pages in Logseq.')).toBeVisible();
    await expect(host.getByText(/Read Zettelkasten for busy people/)).toBeVisible({ timeout: 30_000 });
    await lightPage(page);
    await page.mouse.move(0, 0);
    await save('in-page-sidebar.png', await page.screenshot({ animations: 'disabled' }));
  });

  test('recall rule editor', async ({ page, ext }) => {
    await page.setViewportSize({ width: 900, height: 1400 });
    await ext.connect();
    await page.goto(ext.url('options.html#/recall-rules'));
    await page.getByRole('button', { name: 'Edit GitHub Pull Request' }).click();
    await page.locator('#testUrl').fill('https://github.com/acme/notes/pull/12');
    await expect(page.getByText('✓ Matches · github.com/acme/notes')).toBeVisible();
    await page.getByRole('heading', { name: 'Basics' }).click();
    const top = page.locator('section', { has: page.locator('#urlPattern') });
    const processing = page.locator('section', { has: page.getByRole('heading', { name: 'Query processing' }) });
    const a = (await top.boundingBox())!;
    const b = (await processing.boundingBox())!;
    const margin = 16;
    await page.mouse.move(0, 0);
    await save('recall-rule-editor.png', await page.screenshot({
      animations: 'disabled',
      fullPage: true,
      clip: { x: Math.max(0, a.x - margin), y: a.y + 2, width: a.width + 2 * margin, height: b.y + b.height - a.y + margin - 2 },
    }));
  });
});
