/**
 * Shared by the store screenshots (store-screenshots.spec.ts) and the store
 * video clips (store-video.spec.ts): the demo notes written to the test
 * Logseq, the live article they are about, and helpers that drive the page
 * the way a person does (real mouse drags and clicks).
 *
 * Everything shown is real: the built extension, live pages (Wikipedia,
 * DuckDuckGo), and a test graph with demo notes on one topic, the
 * Zettelkasten note-taking method.
 */
import type { Locator, Page } from '@playwright/test';
import type { Extension, Logseq } from './fixtures';
import { expect } from './fixtures';

export const ARTICLE_URL = 'https://en.wikipedia.org/wiki/Zettelkasten';
export const SEARCH_QUERY = 'zettelkasten';
/**
 * DuckDuckGo's own no-AI edition (its AI answers and chat links turned off):
 * the same result page, with less of DuckDuckGo's features around the card.
 */
export const DUCKDUCKGO = 'https://noai.duckduckgo.com/';

/** Passages of the live article that get highlighted (clipped). */
export const PASSAGES = {
  noteTaking:
    'It has often been used as a system of note-taking and personal knowledge management for research, study, and writing.',
  wikis: 'In the 1990s, such software inspired the invention of wikis.',
  numbered:
    'The notes may be numbered hierarchically so that new notes may be inserted at the appropriate place, and contain metadata to allow the note-taker to associate notes with each other.',
};
export const NOTE = 'Same idea as my Logseq pages: one idea per block, each linked to an older one.';

/**
 * What the graph has about the Zettelkasten and the article. One Logseq serves
 * the whole run: written once.
 */
export async function seedNotes(logseq: Logseq) {
  if ((await logseq.findBlocks('Sources for the method')).length > 0) return;
  const append = (pageName: string, content: string) =>
    logseq.callApi('logseq.Editor.appendBlockInPage', [pageName, content]);
  const child = (parent: string, content: string) =>
    logseq.callApi('logseq.Editor.insertBlock', [parent, content, { sibling: false }]);

  await append('Zettelkasten', 'A note system built from small notes that link to each other. See [[Second brain]].');
  const principles = await append('Zettelkasten', 'Principles of a zettelkasten');
  await child(principles.uuid, 'One idea per note, written in your own words');
  await child(principles.uuid, 'Every zettelkasten note links to at least one older note');

  await append('Reading List', 'DONE Finish the chapter on the zettelkasten in How to Take Smart Notes');
  await append('Reading List', `TODO Read the Wikipedia article on the Zettelkasten ${ARTICLE_URL}`);

  const review = await append('Weekly review', 'Inbox');
  const process = await child(review.uuid, 'Process the fleeting notes');
  await child(process.uuid, 'Turn each fleeting note into a zettelkasten card and link it to an older card');

  const sources = await append('Second brain', `Sources for the method ${ARTICLE_URL}`);
  await child(sources.uuid, `Card files go back to the 17th century, long before software ${ARTICLE_URL}`);
}

/** The article's body text: the live page, closed to everything but reading. */
export const articleBody = (page: Page) => page.locator('#mw-content-text .mw-parser-output');

/**
 * Open the article. Wikipedia can show a fundraising banner over the top of
 * it (it loads after the page): close it with its own Close button, as a
 * reader does. Wikipedia remembers that for the rest of the browser session.
 */
export async function openArticle(page: Page) {
  await page.goto(ARTICLE_URL);
  await expect(articleBody(page).getByText(/It has often been used as a system of/)).toBeVisible();
  const banner = page.getByRole('region', { name: /fundraising/i });
  await banner.first().waitFor({ state: 'visible', timeout: 4000 }).catch(() => {});
  if (await banner.first().isVisible()) {
    await banner.first().getByRole('button', { name: 'Close' }).first().click();
    await expect(banner.first()).toBeHidden();
  }
}

/** Box of `text` inside `root` (first and last line of the range). */
export async function textBox(root: Locator, text: string) {
  const box = await root.evaluate((el, text) => {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const nodes: Text[] = [];
    let all = '';
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      nodes.push(n as Text);
      all += (n as Text).data;
    }
    const at = all.indexOf(text);
    if (at < 0) return null;
    const locate = (offset: number) => {
      let rest = offset;
      for (const node of nodes) {
        if (rest < node.data.length) return { node, offset: rest };
        rest -= node.data.length;
      }
      throw new Error('offset out of range');
    };
    const start = locate(at);
    // The end inside the last character's node (not the start of the next).
    const last = locate(at + text.length - 1);
    const range = document.createRange();
    range.setStart(start.node, start.offset);
    range.setEnd(last.node, last.offset + 1);
    const rects = [...range.getClientRects()].filter((r) => r.width > 0 && r.height > 0);
    const first = rects[0];
    const end = rects[rects.length - 1];
    return {
      start: { x: first.left, y: first.top + first.height / 2 },
      end: { x: end.right, y: end.top + end.height / 2 },
      top: first.top,
      bottom: end.bottom,
    };
  }, text);
  if (!box) throw new Error(`"${text}" is not on the page`);
  return box;
}

/** Scroll so that `text` is at `y` px from the top of the window. */
export async function scrollTextTo(page: Page, root: Locator, text: string, y: number) {
  const { top } = await textBox(root, text);
  await page.evaluate((dy) => window.scrollBy(0, dy), top - y);
}

/**
 * The visible pointer for the video clips: Playwright moves the mouse but
 * draws no cursor, so the clips get this dot. It follows the real mouse
 * events, sits in the top layer (above the extension's own UI), and shrinks
 * while a button is down. Recorded clips show it; screenshots never use it.
 */
export function cursorDot() {
  const KEY = '__store_cursor';
  let dot: HTMLElement | null = null;
  const place = (x: number, y: number) => {
    if (!dot) return;
    dot.style.translate = `${x - 11}px ${y - 11}px`;
    dot.style.opacity = '1';
    try {
      sessionStorage.setItem(KEY, JSON.stringify([x, y]));
    } catch {}
  };
  const raise = () => {
    if (!dot) return;
    try {
      dot.hidePopover();
      dot.showPopover();
    } catch {}
  };
  const install = () => {
    if (dot || !document.documentElement) return;
    dot = document.createElement('div');
    dot.setAttribute('popover', 'manual');
    dot.setAttribute('aria-hidden', 'true');
    dot.style.cssText = [
      'position:fixed', 'inset:auto', 'left:0', 'top:0', 'margin:0', 'padding:0',
      'width:22px', 'height:22px', 'box-sizing:border-box', 'border-radius:50%',
      'border:2px solid #fff', 'background:rgba(17,24,39,.55)',
      'box-shadow:0 1px 4px rgba(0,0,0,.35)', 'pointer-events:none', 'opacity:0',
      'overflow:visible', 'transition:scale .12s ease, background .12s ease',
    ].join(';');
    document.documentElement.appendChild(dot);
    raise();
    try {
      const saved = JSON.parse(sessionStorage.getItem(KEY) ?? 'null');
      if (saved) place(saved[0], saved[1]);
    } catch {}
  };
  addEventListener('mousemove', (e) => place(e.clientX, e.clientY), true);
  addEventListener('mousedown', () => {
    raise();
    if (dot) {
      dot.style.scale = '0.75';
      dot.style.background = 'rgba(17,24,39,.8)';
    }
  }, true);
  addEventListener('mouseup', () => {
    if (dot) {
      dot.style.scale = '1';
      dot.style.background = 'rgba(17,24,39,.55)';
    }
  }, true);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
  else install();
  // Extension UI mounted later must not cover it.
  setInterval(raise, 1500);
}

/** Where the mouse is, per page (Playwright does not say). */
const pointer = new WeakMap<Page, { x: number; y: number }>();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Move the mouse to (x, y) along an eased path, at a human pace. */
export async function glide(page: Page, x: number, y: number, ms = 700) {
  const from = pointer.get(page) ?? { x: 640, y: 400 };
  const steps = Math.max(2, Math.round(ms / 16));
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const e = t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
    await page.mouse.move(from.x + (x - from.x) * e, from.y + (y - from.y) * e);
    await sleep(16);
  }
  pointer.set(page, { x, y });
}

/** Put the mouse somewhere without a visible move (start of a clip). */
export async function placePointer(page: Page, x: number, y: number) {
  await page.mouse.move(x, y);
  pointer.set(page, { x, y });
}

/** Glide to the centre of `locator` and click it with the real mouse. */
export async function clickOn(page: Page, locator: Locator, { pause = 250, ms = 700 } = {}) {
  await locator.scrollIntoViewIfNeeded();
  const box = (await locator.boundingBox())!;
  await glide(page, box.x + box.width / 2, box.y + box.height / 2, ms);
  await sleep(pause);
  await page.mouse.down();
  await sleep(90);
  await page.mouse.up();
}

/**
 * Select `text` inside `root` by dragging the real mouse across it, the way a
 * reader does. Returns the selected text.
 */
export async function dragSelect(page: Page, root: Locator, text: string, { ms = 1400, glideMs = 700 } = {}) {
  const box = await textBox(root, text);
  await glide(page, box.start.x + 1, box.start.y, glideMs);
  await sleep(250);
  await page.mouse.down();
  await glide(page, box.end.x - 1, box.end.y, ms);
  await sleep(120);
  await page.mouse.up();
  const selected = await page.evaluate(() => getSelection()?.toString() ?? '');
  expect(selected.replace(/\s+/g, ' ').trim()).toBe(text);
  return selected;
}

/** The highlights the extension saved for the article. */
export const savedHighlights = async (ext: Extension) =>
  ((await ext.getStorage('highlights')) ?? []).filter((h: any) => h.url === ARTICLE_URL);

/** The sidebar drawn on the page. */
export const inPageSidebar = (page: Page) => page.locator('logseq-copilot-highlights');
