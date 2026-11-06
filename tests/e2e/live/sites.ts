/**
 * What the live site check visits: every built-in search engine of the
 * extension, with the selectors it ships (read from src/utils/storage.ts),
 * and the live result page to open for it. Shared by the check
 * (site-check.live.ts) and the reporter (report.ts).
 */
import fs from 'node:fs';
import path from 'node:path';
import type { BrowserContext } from '@playwright/test';
import ts from 'typescript';

/** A query the seeded test graph answers (tests/support/logseq-app.ts). */
export const QUERY = 'copilot';

/** Results, screenshots and the Markdown table; uploaded by site-check.yml. */
export const REPORT_DIR = path.resolve(__dirname, '../../../test-results/site-check');

export type Status = 'ok' | 'degraded' | 'blocked' | 'broken' | 'skipped';

/** Statuses that fail the check (and open the issue on CI). */
export const FAILING: readonly Status[] = ['broken', 'degraded'];

export interface SiteResult {
  id: string;
  name: string;
  status: Status;
  note: string;
  /** The result page the verdict is about ('' when skipped). */
  url: string;
  /** File name in REPORT_DIR. */
  screenshot?: string;
}

/** The fields of SearchEngineConfig the content script uses. */
export interface EngineConfig {
  id: string;
  name: string;
  urlPattern: string;
  querySelector: string;
  elementSelector: string;
  insertPosition: 'before' | 'after' | 'first' | 'last';
}

const STORAGE_TS = path.resolve(__dirname, '../../../src/utils/storage.ts');

/**
 * BUILT_IN_SEARCH_ENGINES of src/utils/storage.ts, in order. That module
 * imports WXT's virtual `#imports`, which Node cannot load, so the array
 * literal is read from the source.
 */
export function builtInEngines(): EngineConfig[] {
  const source = ts.createSourceFile(STORAGE_TS, fs.readFileSync(STORAGE_TS, 'utf8'), ts.ScriptTarget.Latest);
  let list: ts.ArrayLiteralExpression | undefined;
  const visit = (node: ts.Node) => {
    if (
      ts.isVariableDeclaration(node) &&
      node.name.getText(source) === 'BUILT_IN_SEARCH_ENGINES' &&
      node.initializer &&
      ts.isArrayLiteralExpression(node.initializer)
    ) {
      list = node.initializer;
    } else {
      ts.forEachChild(node, visit);
    }
  };
  visit(source);
  if (!list) throw new Error(`no BUILT_IN_SEARCH_ENGINES array in ${STORAGE_TS}`);

  return list.elements.map((element, i) => {
    if (!ts.isObjectLiteralExpression(element)) {
      throw new Error(`BUILT_IN_SEARCH_ENGINES[${i}] in ${STORAGE_TS} is not an object literal`);
    }
    const fields: Record<string, string> = {};
    for (const property of element.properties) {
      if (ts.isPropertyAssignment(property) && ts.isStringLiteralLike(property.initializer)) {
        fields[property.name.getText(source)] = property.initializer.text;
      }
    }
    for (const key of ['id', 'name', 'urlPattern', 'querySelector', 'elementSelector', 'insertPosition']) {
      if (!fields[key]) throw new Error(`BUILT_IN_SEARCH_ENGINES[${i}] in ${STORAGE_TS} has no string ${key}`);
    }
    return fields as unknown as EngineConfig;
  });
}

/**
 * The engines to check: `SITE_CHECK_SITES` (comma-separated ids, `all` or
 * empty for every one). `complete` when every built-in engine is checked.
 */
export function selectedEngines(): { engines: EngineConfig[]; complete: boolean } {
  const all = builtInEngines();
  const wanted = (process.env.SITE_CHECK_SITES ?? '')
    .split(/[\s,]+/)
    .map((id) => id.trim().toLowerCase())
    .filter((id) => id && id !== 'all');
  if (wanted.length === 0) return { engines: all, complete: true };
  const unknown = wanted.filter((id) => !all.some((e) => e.id === id));
  if (unknown.length) {
    throw new Error(`SITE_CHECK_SITES: unknown ${unknown.join(', ')} (known: ${all.map((e) => e.id).join(', ')})`);
  }
  const engines = all.filter((e) => wanted.includes(e.id));
  return { engines, complete: engines.length === all.length };
}

const kagiToken = () => process.env.KAGI_SESSION_TOKEN?.trim() || undefined;

/** Hide the Kagi session token in anything that is reported or uploaded. */
export function redact(text: string): string {
  const token = kagiToken();
  let out = text.replace(/([?&]token=)[^&#\s]+/g, '$1***');
  // As it is and URL-encoded (as in the sign-in URL).
  if (token) for (const form of [token, encodeURIComponent(token)]) out = out.split(form).join('***');
  return out;
}

/** The first line of an error, without URLs: a request error quotes its URL. */
function errorLine(error: unknown): string {
  const line = String(error instanceof Error ? error.message : error).split('\n')[0];
  return redact(line.replace(/^\w+\.\w+:\s*/, '').replace(/\b[a-z][a-z\d+.-]*:\/\/\S*/gi, '(URL)'));
}

export interface LiveSite {
  /**
   * Result pages for `query`, tried in order: the first one that is not
   * blocked decides (several only for SearX, a public instance can be down
   * or refuse the browser).
   */
  urls: (query: string) => string[];
  /**
   * The organic results on the result page (CSS selector, checked on the
   * live page): the card must be right of them (misplaced()). Kept apart
   * from the engine config's selectors, so that a redesign that breaks
   * those does not break this one too.
   */
  organic: string;
  /**
   * Signs the browser in before the result pages open. Throws an error
   * without URLs (the sign-in URL holds a secret).
   */
  signIn?: (context: BrowserContext) => Promise<void>;
  /** Why this run cannot check the site, if it cannot. */
  skip?: () => string | undefined;
}

const q = encodeURIComponent;

/**
 * Public SearXNG instances whose host name starts with `searx.`/`searxng.`
 * (the content script also recognizes `<meta name="generator"
 * content="searxng">`), picked from https://searx.space by uptime.
 */
export const SEARX_INSTANCES = [
  'https://searx.tiekoetter.com',
  'https://searx.oloke.xyz',
  'https://searx.rhscz.eu',
  'https://searxng.site',
];

/** The live result page per built-in engine id. */
export const LIVE_SITES: Record<string, LiveSite> = {
  google: {
    urls: (query) => [`https://www.google.com/search?q=${q(query)}`],
    // The result titles: Google renames its block classes often. Not
    // checked on the live page yet (it served the "unusual traffic" page).
    organic: '#rso a h3',
  },
  bing: { urls: (query) => [`https://www.bing.com/search?q=${q(query)}`], organic: '#b_results > li.b_algo' },
  duckduckgo: { urls: (query) => [`https://duckduckgo.com/?q=${q(query)}`], organic: 'li[data-layout="organic"]' },
  ecosia: { urls: (query) => [`https://www.ecosia.org/search?q=${q(query)}`], organic: '[data-test-id="organic-result"]' },
  yandex: {
    urls: (query) => [`https://yandex.com/search/?text=${q(query)}`],
    // Not checked on the live page yet (it served its captcha).
    organic: '#search-result .serp-item',
  },
  searx: {
    urls: (query) => SEARX_INSTANCES.map((base) => `${base}/search?q=${q(query)}`),
    organic: '#urls > article.result',
  },
  // .result-op are Baidu's own answers (dictionary, Baike), .result the web.
  baidu: { urls: (query) => [`https://www.baidu.com/s?wd=${q(query)}`], organic: '#content_left > .result' },
  kagi: {
    // Kagi shows results only to members. A session link (Settings >
    // Account > Session Link) signs a browser in through `?token=`. The
    // context's request API opens it and shares the session cookie with the
    // browser, so no checked URL (page.url(), navigation errors, notes)
    // holds the token. Without a session Kagi serves its sign-in or human
    // check page (`blocked`, SPECIFIC).
    urls: (query) => [`https://kagi.com/search?q=${q(query)}`],
    signIn: async (context) => {
      try {
        await context.request.get(`https://kagi.com/search?token=${q(kagiToken() ?? '')}`, { timeout: 30_000 });
      } catch (error) {
        // Not `error`: its message and call log hold the session link.
        throw new Error(`Kagi sign-in request failed: ${errorLine(error)}`);
      }
    },
    skip: () => (kagiToken() ? undefined : 'needs a Kagi account: set KAGI_SESSION_TOKEN (session link token)'),
    // Not checked on the live page (that needs an account).
    organic: '.search-result',
  },
  startpage: {
    // The query is read from the search box (#q), not the address.
    urls: (query) => [`https://www.startpage.com/sp/search?query=${q(query)}`],
    // Startpage serves visitors one of two layouts of section#main (a home
    // network got the first, GitHub's runners the second):
    // - div.w-bg blocks under "Related searches", split by a News carousel;
    //   the title link (a.result-title, data-testid="bg-title-link") is in
    //   .result__main;
    // - one div.w-gl block, each result with a favicon and the site name
    //   above its title link (a.result-title, data-testid="gl-title-link").
    // Both keep #main, .result and a.result-title, not the block's class,
    // and put 1 px high .result.h copies of results among the results.
    // Not matched: the hidden .result of the Wikipedia box (no title link),
    // news (.news-result), the ads (an iframe in #gcsa-top, above the
    // results) and the ad-blocker bait (.a-bg-result, outside #main).
    organic: '#main .result:not(.h):has(a.result-title)',
  },
  brave: { urls: (query) => [`https://search.brave.com/search?q=${q(query)}`], organic: '.snippet[data-type="web"]' },
};

/** A box in CSS px, from the top left of the page. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Where the card is, next to the organic results; read in the page. */
export interface Placement {
  /** The window: width without the scroll bar, and height. */
  viewport: { w: number; h: number };
  card: Rect;
  /**
   * What elementFromPoint finds at the centre of the part of the card in the
   * window, when it is not the card: '' when it is the card.
   */
  cover: string;
  /**
   * A layer over the whole page (fixed, or absolute with a z-index, outside
   * the right column) that covers the centre of the card: a popup the
   * visitor closes, e.g. DuckDuckGo's browser promotion in a new profile.
   * Not counted as a cover.
   */
  under?: string;
  /** Width of the card that an ancestor with overflow cuts off. */
  clipped: number;
  /** The first organic results with a box, RESULTS_CHECKED at most. */
  results: Rect[];
  /** The results column: the outermost ancestor of the first result that ends left of the card. */
  column?: Rect;
}

/** Narrower, the card's rows do not fit (the right columns are 300 to 470 px). */
export const MIN_CARD_WIDTH = 200;
/** Borders and rounding: how far the card may reach into the results column. */
const EDGE = 4;
/** The card must not overlap the first this many organic results. */
export const RESULTS_CHECKED = 3;
/**
 * How far the card's top may be from the top of the results column. The
 * sites start their right column level with the results (Brave 24 px
 * lower, by design); this is less than a result is high, so a card further
 * down sits next to another result, or under something else.
 */
export const ALIGN = 100;

const box = (r: Rect) => `x=${r.x} y=${r.y} w=${r.w} h=${r.h}`;

/** The boxes of the card, the first result and the results column, for a note. */
export function boxes(p: Placement): string {
  const under = p.under ? `, its centre under a page layer (${p.under})` : '';
  const column = p.column ? `, results column ${box(p.column)}` : '';
  return `card ${box(p.card)}${under}, first result ${p.results[0] ? box(p.results[0]) : 'none'}${column}`;
}

/**
 * What is wrong with where the card is, [] when nothing. A card in a
 * fallback place (`degraded`) is only checked to be visible: the fallback
 * places are not in the right column.
 */
export function misplaced(p: Placement, fallback = false): string[] {
  const { card, viewport } = p;
  const problems: string[] = [];
  if (card.w < MIN_CARD_WIDTH || card.h <= 0) problems.push(`card is ${card.w}x${card.h} px, narrower than ${MIN_CARD_WIDTH} px or flat`);
  if (card.x < 0 || card.x + card.w > viewport.w + 1) problems.push(`card is not inside the ${viewport.w} px wide window`);
  if (p.clipped > 1) problems.push(`overflow cuts ${p.clipped} px off the card`);
  if (p.cover) problems.push(`the centre of the card is covered (${p.cover})`);
  const first = p.results[0];
  if (!first) return [...problems, 'no organic results found'];
  if (fallback) return problems;
  if (card.x < first.x + first.w - EDGE) {
    problems.push(`card's left edge ${card.x} is left of the first result's right edge ${first.x + first.w}`);
  }
  const over = p.results.map((r, i) => (overlap(card, r) ? i + 1 : 0)).filter(Boolean);
  if (over.length) problems.push(`card overlaps result ${over.join(', ')}`);
  if (card.y >= viewport.h) {
    problems.push(`card's top ${card.y} is below the first screen (${viewport.h} px)`);
  } else if (p.column && Math.abs(card.y - p.column.y) > ALIGN) {
    problems.push(`card's top ${card.y} is ${Math.abs(card.y - p.column.y)} px from the results column's top ${p.column.y} (${box(p.column)})`);
  }
  return problems;
}

const overlap = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** What the page under check looks like, for blockedBy(). */
export interface PageState {
  url: string;
  title: string;
  /** The start of the page's visible text. */
  text: string;
  /** HTTP status of the last document loaded in the tab. */
  status?: number;
}

/** Signals that hold on any page, also one whose title names the query. */
const SPECIFIC: { reason: string; url?: RegExp; title?: RegExp; text?: RegExp }[] = [
  { reason: 'Google "unusual traffic" page', url: /^https:\/\/[^/]*google\.[^/]+\/sorry\// },
  { reason: 'consent page', url: /^https:\/\/consent\.[^/]+\// },
  { reason: 'Yandex captcha', url: /^https:\/\/[^/]*yandex\.[^/]+\/(showcaptcha|checkcaptcha)/ },
  { reason: 'Baidu security check', url: /^https:\/\/wappass\.baidu\.com\// },
  { reason: 'Baidu security check', title: /百度安全验证/ },
  { reason: 'Bing captcha', url: /^https:\/\/[^/]*bing\.com\/turing\// },
  { reason: 'DuckDuckGo bot check', text: /bots use DuckDuckGo too/i },
  { reason: 'Startpage suspended access', url: /^https:\/\/[^/]*startpage\.com\/.*\/blocked\.html/ },
  { reason: 'Kagi human check', url: /^https:\/\/kagi\.com\/turnstile/ },
  { reason: 'Kagi sign-in page (session token missing or expired)', url: /^https:\/\/kagi\.com\/(signin|signup|welcome)/ },
];

/**
 * Signals that only count on a page whose title does not name the query: a
 * result page can mention these words in its results.
 */
const GENERIC: { reason: string; pattern: RegExp }[] = [
  { reason: 'Cloudflare challenge', pattern: /just a moment\.\.\./i },
  { reason: 'captcha', pattern: /captcha/i },
  {
    reason: 'bot check',
    pattern:
      /unusual traffic|are you (not )?a robot|not a robot|not a bot|verify(ing)? (that )?you(['’]re| are) (a )?human|confirm you(['’]re| are) not a robot|Вы не робот/i,
  },
  { reason: 'access denied', pattern: /access denied|automated (scraping|queries|requests)|protected by anubis|too many requests|temporarily suspended/i },
  { reason: 'region restriction', pattern: /not available in your (country|region)|unavailable in your (country|region)/i },
];

/**
 * Evidence that the site served a captcha, consent, challenge or error page
 * instead of results, or undefined.
 */
export function blockedBy(page: PageState, query = QUERY): string | undefined {
  const quote = (s: string) => `\`${s.replace(/[`\s]+/g, ' ').trim().slice(0, 80)}\``;
  for (const rule of SPECIFIC) {
    if (rule.url?.test(page.url)) return `${rule.reason}: ${quote(new URL(page.url).host + new URL(page.url).pathname)}`;
    if (rule.title?.test(page.title)) return `${rule.reason}: title ${quote(page.title)}`;
    const m = rule.text && page.text.match(rule.text);
    if (m) return `${rule.reason}: ${quote(lineAround(page.text, m.index ?? 0))}`;
  }
  if (page.title.toLowerCase().includes(query.toLowerCase())) return undefined;
  for (const rule of GENERIC) {
    if (rule.pattern.test(page.title)) return `${rule.reason}: title ${quote(page.title)}`;
    const m = page.text.match(rule.pattern);
    if (m) return `${rule.reason}: ${quote(lineAround(page.text, m.index ?? 0))}`;
  }
  if (page.status !== undefined && page.status >= 400) {
    return `HTTP ${page.status}${page.title ? `, title ${quote(page.title)}` : ''}`;
  }
  return undefined;
}

/** The line of `text` around `index`. */
function lineAround(text: string, index: number) {
  const start = text.lastIndexOf('\n', index) + 1;
  const end = text.indexOf('\n', index);
  return text.slice(start, end < 0 ? undefined : end);
}
