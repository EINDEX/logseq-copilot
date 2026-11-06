/**
 * Live site check: for every built-in search engine, the E2E build opens the
 * real result page for QUERY in Chromium, with a real Logseq holding the
 * seeded test graph (global-setup.ts), and gives it a status:
 *
 * - ok: the card is where the engine config puts it, lists the seeded page,
 *   and is in view right of the organic results (sites.ts, misplaced);
 * - degraded: it lists the seeded page from a fallback place
 *   (searchingEngines.ts has one for Brave and Kagi only);
 * - blocked: the site served a captcha, consent, challenge or error page, or
 *   could not be reached (sites.ts, blockedBy);
 * - broken: the page loaded, but there is no card, or it is hidden, empty,
 *   failing or out of place, or the page has no organic results;
 * - skipped: this run cannot check the site (Kagi without a session token).
 *
 * Broken and degraded fail the test (and get one retry). One screenshot per
 * site goes to REPORT_DIR; report.ts writes the tables. See ../README.md.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { ConsoleMessage, Page, Response, TestInfo } from '@playwright/test';
import { TEST_PAGE } from '../../support/logseq-app';
import { expect, test } from '../fixtures';
import {
  blockedBy,
  boxes,
  FAILING,
  LIVE_SITES,
  misplaced,
  QUERY,
  redact,
  REPORT_DIR,
  RESULTS_CHECKED,
  selectedEngines,
  type EngineConfig,
  type Placement,
  type SiteResult,
} from './sites';

/** How long a result page gets to show the card with results. */
const CARD_TIMEOUT = 30_000;
/** A block signal that lasts this long is final (a challenge can pass by itself). */
const BLOCK_SETTLE = 12_000;
/** The card must still list the results this long after it first did. */
const STABLE_FOR = 3_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const firstLine = (error: unknown) => String(error instanceof Error ? error.message : error).split('\n')[0];

type Verdict = Pick<SiteResult, 'status' | 'note' | 'url'>;

/** The card and its surroundings, read in the page by inspect(). */
interface Snapshot {
  url: string;
  title: string;
  text: string;
  /** The engine's URL test (CustomSearchEngine.isMatch) passes. */
  urlMatch: boolean;
  /** What CustomSearchEngine.getQuery reads. */
  query: string | null;
  /** The size of the engine's elementSelector ("WxH px"), empty when it is not on the page. */
  target: string;
  /** Card and container mounts and removals, ms since navigation (watchCard). */
  events: [string, number][];
  /** The content script ran here: its popup host (logseq-copilot-popup) is on the page. */
  contentScript: boolean;
  /** Organic results with a box (LiveSite.organic). */
  organic: number;
  card?: {
    state: 'loading' | 'error' | 'empty' | 'results' | 'unknown';
    text: string;
    /** It lists TEST_PAGE. */
    seed: boolean;
    width: number;
    height: number;
    visible: boolean;
    /** Where it is, for the note. */
    place: string;
    /** In a fallback place, not where the engine config puts it. */
    fallback: boolean;
    placement: Placement;
  };
}

/**
 * Init script: log when the card's shadow host is added and removed, and its
 * container (the element the content script puts at elementSelector first).
 */
function watchCard() {
  const events: [string, number][] = [];
  (window as any).__siteCheckCard = events;
  const HOST = 'LOGSEQ-COPILOT-SEARCH-ENGINE';
  const CONTAINER = '.logseq-copilot-custom-container';
  const is = (node: Node, selector: string) =>
    node instanceof Element && (node.matches(selector) || !!node.querySelector(selector));
  new MutationObserver((records) => {
    for (const record of records) {
      record.addedNodes.forEach((node) => {
        if (node.nodeName === HOST) events.push(['mounted', Math.round(performance.now())]);
        else if (node instanceof Element && node.matches(CONTAINER)) events.push(['container added', Math.round(performance.now())]);
      });
      record.removedNodes.forEach((node) => {
        if (node.nodeName === HOST || is(node, HOST.toLowerCase())) events.push(['removed', Math.round(performance.now())]);
        else if (is(node, CONTAINER)) events.push(['container removed', Math.round(performance.now())]);
      });
    }
  }).observe(document, { childList: true, subtree: true });
}

/**
 * Runs in the page (self-contained). Mirrors CustomSearchEngine
 * (src/entrypoints/content/searchingEngines) for the URL test, the query and
 * the mount places, and reads the card through its open shadow root (E2E
 * build), and where it is next to the organic results.
 */
function inspect({
  engine,
  seed,
  organic,
  checked,
}: {
  engine: EngineConfig;
  seed: string;
  organic: string;
  checked: number;
}): Snapshot {
  const toRect = (r: DOMRect) => ({
    x: Math.round(r.left + scrollX),
    y: Math.round(r.top + scrollY),
    w: Math.round(r.width),
    h: Math.round(r.height),
  });
  const describe = (el: Element) =>
    el.tagName.toLowerCase() +
    (el.id ? `#${el.id}` : '') +
    (typeof el.className === 'string' && el.className.trim() ? `.${el.className.trim().split(/\s+/)[0]}` : '');
  let results: Element[] = [];
  try {
    results = [...document.querySelectorAll(organic)].filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && el.checkVisibility();
    });
  } catch {
    results = [];
  }

  let urlMatch = false;
  if (engine.id === 'searx') {
    const generator = document.querySelector('head > meta[name="generator"]')?.getAttribute('content') ?? '';
    urlMatch = generator.includes('searxng') || /^searx(ng)?\./.test(location.hostname);
  } else {
    try {
      const pattern = new RegExp(engine.urlPattern, 'i');
      urlMatch =
        pattern.test(location.href) || pattern.test(location.hostname) || location.hostname.includes(engine.urlPattern);
    } catch {
      urlMatch = false;
    }
  }

  let query: string | null = null;
  const searchUrl = engine.id === 'searx' ? document.querySelector('#search_url pre')?.textContent : null;
  if (searchUrl) {
    try {
      query = new URL(searchUrl).searchParams.get('q');
    } catch {
      query = null;
    }
  } else if (engine.querySelector.startsWith('?')) {
    query = new URLSearchParams(location.search).get(engine.querySelector.slice(1));
  } else {
    const el = document.querySelector(engine.querySelector);
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) query = el.value;
    else if (el) query = el.getAttribute('value') || el.textContent?.trim() || null;
  }

  const target = document.querySelector(engine.elementSelector);
  const host = [...document.querySelectorAll('logseq-copilot-search-engine')].find((h) => h.isConnected);
  let card: Snapshot['card'];
  if (host) {
    const root = host.shadowRoot;
    const has = (selector: string) => !!root?.querySelector(selector);
    const state = !root
      ? 'unknown'
      : has('.lc-error')
        ? 'error'
        : has('[aria-busy="true"]')
          ? 'loading'
          : has('.lc-empty')
            ? 'empty'
            : has('.lc-page-row')
              ? 'results'
              : 'unknown';
    const rect = host.getBoundingClientRect();
    const container = host.parentElement!;
    const configured = !!target && (
      engine.insertPosition === 'before' || engine.insertPosition === 'after'
        ? container.parentNode === target.parentNode
        : target.contains(container)
    );
    let place = '';
    let fallback = false;
    const inside = (id: string) => !!document.getElementById(id)?.contains(container);
    if (engine.id === 'google' && !configured) {
      // No #rhs (most result pages): a column beside #center_col, or the
      // top of it in a narrow window. Both are the designed places.
      const center = document.getElementById('center_col');
      if (inside('center_col')) place = 'at the top of #center_col (page without #rhs, narrow window)';
      else if (center && container.parentNode === center.parentNode) place = 'in a column beside #center_col (page without #rhs)';
    } else if (engine.id === 'brave' && !configured && inside('mixed-main')) {
      // The top of the results: by design in a window too narrow for the
      // right column, a fallback when there is no right column.
      place = target ? 'at the top of #mixed-main (window too narrow for #mixed-side)' : 'at the top of #mixed-main: no #mixed-side';
      fallback = !target;
    } else if (engine.id === 'kagi' && configured && !container.closest('._0_right_sidebar')) {
      place = `in ${engine.elementSelector} without ._0_right_sidebar`;
      fallback = true;
    } else if (configured) {
      place = `in ${engine.elementSelector}`;
    }
    if (!place) {
      const parent = container.parentElement;
      const name = parent ? parent.tagName.toLowerCase() + (parent.id ? `#${parent.id}` : '') : 'a detached element';
      place = `outside ${engine.elementSelector}, in ${name}`;
      fallback = true;
    }

    const viewport = { w: document.documentElement.clientWidth, h: innerHeight };
    // The centre of the part of the card in the window: a card taller than
    // the window has its centre below it.
    const top = Math.max(rect.top, 0);
    const bottom = Math.min(rect.bottom, viewport.h);
    const left = Math.max(rect.left, 0);
    const right = Math.min(rect.right, viewport.w);
    const hit = bottom > top && right > left ? document.elementFromPoint((left + right) / 2, (top + bottom) / 2) : null;
    // What covers the card does not count when it is a layer over the whole
    // page, e.g. a popup a site shows new visitors: fixed, or absolute with
    // a z-index, and outside the right column (the first element up from it
    // that holds the card also holds the results).
    let positioned: Element | undefined;
    let common: Element | null = hit;
    for (; common && !common.contains(host); common = common.parentElement) {
      const style = getComputedStyle(common);
      if (style.position === 'fixed' || (style.position === 'absolute' && style.zIndex !== 'auto')) positioned = common;
    }
    const layer = positioned && results[0] && common?.contains(results[0]) ? positioned : undefined;
    // A point in the shadow root finds the host.
    const cover = !hit ? 'no part of it is in the window' : hit === host || host.contains(hit) || layer ? '' : `by ${describe(hit)}`;
    // What ancestors with overflow leave of the card's width.
    let clipLeft = rect.left;
    let clipRight = rect.right;
    for (let el = host.parentElement; el; el = el.parentElement) {
      if (getComputedStyle(el).overflowX === 'visible') continue;
      const r = el.getBoundingClientRect();
      clipLeft = Math.max(clipLeft, r.left);
      clipRight = Math.min(clipRight, r.right);
    }
    // The results column: up from the first result while left of the card
    // (ancestors without a box, e.g. display: contents, do not count).
    let column: Element | undefined;
    for (let el = results[0] as Element | null; el && el !== document.body; el = el.parentElement) {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      if (r.right > rect.left + 4) break;
      column = el;
    }

    card = {
      state,
      text: (root?.querySelector('.lc-error, .lc-empty')?.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 120),
      seed: [...(root?.querySelectorAll('.lc-page-name') ?? [])].some((el) => el.textContent?.trim() === seed),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      visible:
        rect.width > 0 && rect.height > 0 && host.checkVisibility({ opacityProperty: true, visibilityProperty: true }),
      place,
      fallback,
      placement: {
        viewport,
        card: toRect(rect),
        cover,
        under: layer ? describe(layer) : undefined,
        clipped: Math.round(rect.width - Math.max(0, clipRight - clipLeft)),
        results: results.slice(0, checked).map((el) => toRect(el.getBoundingClientRect())),
        column: column && toRect(column.getBoundingClientRect()),
      },
    };
  }

  return {
    url: location.href,
    title: document.title,
    text: (document.body?.innerText ?? '').slice(0, 3000),
    urlMatch,
    query,
    target: target ? `${Math.round(target.getBoundingClientRect().width)}x${Math.round(target.getBoundingClientRect().height)} px` : '',
    events: (window as any).__siteCheckCard ?? [],
    contentScript: !!document.querySelector('logseq-copilot-popup'),
    organic: results.length,
    card,
  };
}

/** The card with the seeded page; whether it is in place is up to misplaced(). */
const shown = (card: NonNullable<Snapshot['card']>) => card.state === 'results' && card.seed && card.visible;

/** Why the card is not there with the results, or out of place, from the last snapshot. */
function diagnose(
  snap: Snapshot,
  engine: EngineConfig,
  organic: string,
  warnings: Set<string>,
  navigations: string[],
): string {
  const facts: string[] = [];
  const card = snap.card;
  if (card && shown(card)) {
    const problems = misplaced(card.placement, card.fallback);
    facts.push(
      problems.length
        ? `card ${card.place} lists ${TEST_PAGE}, out of place: ${problems.join(', ')} (${boxes(card.placement)})`
        : `card ${card.place} lists ${TEST_PAGE} in place, but not for ${STABLE_FOR / 1000} s before the timeout (${boxes(card.placement)})`,
    );
    if (!snap.organic) facts.push(`\`${organic}\` finds nothing`);
    return facts.join('; ');
  }
  const at = (name: string) => snap.events.find(([event]) => event === name)?.[1];
  const mounted = at('mounted');
  const removed = at('removed');
  const added = at('container added');
  const dropped = at('container removed');
  const s = (ms: number) => (ms / 1000).toFixed(1);
  if (!card) {
    if (mounted !== undefined && removed !== undefined) {
      facts.push(`card mounted ${s(mounted)} s after navigation, then removed at ${s(removed)} s (the page replaced the element it was in)`);
    } else if (added !== undefined && mounted === undefined) {
      facts.push(
        dropped !== undefined
          ? `no card: its container was added ${s(added)} s after navigation and removed by the page at ${s(dropped)} s, before the card was in it`
          : `no card: its container was added ${s(added)} s after navigation, the card never mounted in it`,
      );
    } else {
      facts.push('no card');
    }
  } else if (!card.visible) {
    facts.push(`card ${card.place} is not visible (${card.width}x${card.height} px)`);
  } else if (card.state === 'error') {
    facts.push(`card shows an error: ${card.text}`);
  } else if (card.state === 'empty') {
    facts.push(`card shows "${card.text}"`);
  } else if (card.state === 'loading') {
    facts.push(`card still loading after ${CARD_TIMEOUT / 1000} s`);
  } else {
    facts.push(`card ${card.place} does not list ${TEST_PAGE}`);
  }
  if (!snap.organic) facts.push(`no organic results found: \`${organic}\``);
  if (!snap.urlMatch) facts.push(`URL pattern \`${engine.urlPattern}\` does not match ${new URL(snap.url).host}`);
  if (!snap.query) facts.push(`no query: \`${engine.querySelector}\` is empty`);
  else if (snap.query.toLowerCase() !== QUERY) facts.push(`query read as "${snap.query.slice(0, 60)}"`);
  facts.push(`\`${engine.elementSelector}\` ${snap.target ? `present (${snap.target})` : 'not found'}`);
  if (!card && !snap.contentScript) facts.push('the content script did not run on the page (no logseq-copilot-popup)');
  if (navigations.length > 1) {
    const where = (url: string) => {
      const u = new URL(url);
      return `${u.host}${u.pathname}${u.search.slice(0, 60)}`;
    };
    facts.push(`the page loaded ${navigations.length} documents: ${navigations.slice(-3).map(where).join(' > ')}`);
  }
  for (const warning of [...warnings].slice(0, 2)) facts.push(`content script: \`${warning.slice(0, 120)}\``);
  return facts.join('; ');
}

/** Open `url` and wait for the card with the results in place, a block, or the timeout. */
async function checkPage(page: Page, engine: EngineConfig, organic: string, url: string): Promise<Verdict> {
  let status: number | undefined;
  const warnings = new Set<string>();
  const onResponse = (response: Response) => {
    if (response.request().isNavigationRequest() && response.frame() === page.mainFrame()) {
      status = response.status();
    }
  };
  const onConsole = (message: ConsoleMessage) => {
    const text = message.text();
    if ((message.type() === 'warning' || message.type() === 'error') && text.startsWith('[Logseq Copilot]')) {
      warnings.add(text.replace(/^\[Logseq Copilot\]\s*/, ''));
    }
  };
  // One URL per document the page loads (the content script runs in each).
  const navigations: string[] = [];
  const onLoaded = () => navigations.push(page.url());
  page.on('response', onResponse);
  page.on('console', onConsole);
  page.on('domcontentloaded', onLoaded);
  try {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    } catch (error) {
      if (/^(about:blank|chrome-error:)/.test(page.url())) {
        return { status: 'blocked', note: `unreachable: ${firstLine(error)}`, url };
      }
    }

    const started = Date.now();
    let last: Snapshot | undefined;
    let shownSince: number | undefined;
    let blockedSince: number | undefined;
    for (;;) {
      // Fails while the page navigates (a challenge that passes reloads it).
      const snap = await page
        .evaluate(inspect, { engine, seed: TEST_PAGE, organic, checked: RESULTS_CHECKED })
        .catch(() => undefined);
      if (snap) {
        last = snap;
        const card = snap.card;
        // A card out of place gets until the timeout: the page can still be
        // laying out.
        if (card && shown(card) && !misplaced(card.placement, card.fallback).length) {
          shownSince ??= Date.now();
          if (Date.now() - shownSince >= STABLE_FOR) {
            const where = boxes(card.placement);
            return card.fallback
              ? { status: 'degraded', note: `card ${card.place} (fallback), lists ${TEST_PAGE} (${where})`, url }
              : { status: 'ok', note: `card ${card.place}, lists ${TEST_PAGE} (${where})`, url };
          }
        } else {
          shownSince = undefined;
          const block = blockedBy({ url: snap.url, title: snap.title, text: snap.text, status });
          blockedSince = block ? (blockedSince ?? Date.now()) : undefined;
          if (block && Date.now() - blockedSince! >= BLOCK_SETTLE) return { status: 'blocked', note: block, url };
        }
      }
      if (Date.now() - started > CARD_TIMEOUT) break;
      await sleep(500);
    }

    if (!last) return { status: 'broken', note: `could not read the page (${page.url()})`, url };
    const block = blockedBy({ url: last.url, title: last.title, text: last.text, status });
    if (block) return { status: 'blocked', note: block, url };
    return { status: 'broken', note: diagnose(last, engine, organic, warnings, navigations), url };
  } finally {
    page.off('response', onResponse);
    page.off('console', onConsole);
    page.off('domcontentloaded', onLoaded);
  }
}

async function record(testInfo: TestInfo, result: SiteResult) {
  await testInfo.attach('site-check', { body: JSON.stringify(result), contentType: 'application/json' });
}

fs.mkdirSync(REPORT_DIR, { recursive: true });

for (const engine of selectedEngines().engines) {
  const site = LIVE_SITES[engine.id];
  const skip = site ? site.skip?.() : `no live result page for \`${engine.id}\` in tests/e2e/live/sites.ts`;
  const details = { annotation: { type: 'site', description: engine.id } };

  if (skip || !site) {
    test(engine.name, details, async ({}, testInfo) => {
      await record(testInfo, { id: engine.id, name: engine.name, status: 'skipped', note: skip ?? '', url: '' });
    });
    continue;
  }

  test(engine.name, details, async ({ context, page, ext }, testInfo) => {
    await ext.connect();
    await page.addInitScript(watchCard);

    const urls = site.urls(QUERY);
    const blocked: string[] = [];
    let verdict: Verdict | undefined;
    // A sign-in request that fails is a site that cannot be reached.
    const signInError = site.signIn ? await site.signIn(context).then(() => undefined, firstLine) : undefined;
    if (signInError) verdict = { status: 'blocked', note: `unreachable: ${signInError}`, url: urls[0] };
    // The first result page that is not blocked decides.
    for (const url of signInError ? [] : urls) {
      verdict = await checkPage(page, engine, site.organic, url);
      if (verdict.status !== 'blocked') break;
      blocked.push(`${new URL(url).host}: ${verdict.note}`);
    }
    if (!verdict) throw new Error(`no result page for ${engine.id}`);
    if (blocked.length > 1 || (blocked.length && verdict.status !== 'blocked')) {
      verdict.note = verdict.status === 'blocked' ? blocked.join('; ') : `${verdict.note}; blocked before: ${blocked.join('; ')}`;
    }

    // The first screen: a card in place is in it, next to the results.
    await page.evaluate(() => scrollTo(0, 0)).catch(() => {});
    const screenshot = `${engine.id}.png`;
    const shot = await page
      .screenshot({ path: path.join(REPORT_DIR, screenshot), timeout: 15_000 })
      .then(() => true)
      .catch(() => false);
    await record(testInfo, {
      id: engine.id,
      name: engine.name,
      status: verdict.status,
      note: redact(verdict.note),
      url: redact(verdict.url),
      screenshot: shot ? screenshot : undefined,
    });

    expect(FAILING, `${engine.name} is ${verdict.status}: ${redact(verdict.note)}`).not.toContain(verdict.status);
  });
}
