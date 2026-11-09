/**
 * UI screenshots for review, not a visual regression test: every options
 * page, the popup, the browser sidebar page and the in-page UI (search engine
 * sidebar, page highlight and float button, highlight comment popup, in-page
 * highlights sidebar) in light and dark, against the seeded Logseq. The tests
 * only assert that the key elements are visible.
 *
 * The search engine card is taken on the Google (empty right column,
 * knowledge panel, no right column, narrow window), Bing, DuckDuckGo and
 * Brave Search (also narrow) fixture pages, with the recall data of the
 * fixture graph: hits nested
 * under a hit and "+N" (`recallprobe`), two hits under one context line
 * (`deepnest`), a journal day with two topics (`journaldeep`), more pages
 * than shown (`notes`), and the hover, no result, loading and error states.
 * The popup also with the rich content.
 *
 * Output: test-results/ui-screenshots/<name>-<light|dark>.png (uploaded by
 * CI as the `ui-screenshots-<variant>` artifact on every run). Runs on
 * Chromium only; most pictures with the file graph only, so the matrix does
 * not take the same pictures twice.
 */
import path from 'node:path';
import type { Locator, Page } from '@playwright/test';
import { expect, logseqInfo, nonce, test } from './fixtures';
import { bingUrl, braveUrl, duckDuckGoUrl, googleUrl, type GoogleRightColumn } from './pages';

const OUT_DIR = path.resolve(__dirname, '../../test-results/ui-screenshots');
const VIEWPORT = { width: 1440, height: 900 };
const SCHEMES = ['light', 'dark'] as const;
type Scheme = (typeof SCHEMES)[number];

test.skip(({ browserName }) => browserName !== 'chromium', 'screenshots are taken on Chromium only');
/**
 * Most screenshots are taken with the file graph only; the rich content and
 * many results ones run for both graph types (`-db` suffix), since the DB
 * graph returns different fields.
 */
const fileGraphOnly = () =>
  test.skip(logseqInfo().variant !== 'file', 'taken with the file graph only');
const variantSuffix = () => (logseqInfo().variant === 'db' ? '-db' : '');

const file = (name: string, scheme: Scheme) => path.join(OUT_DIR, `${name}-${scheme}.png`);

const shoot = async (
  target: Page | Locator,
  name: string,
  scheme: Scheme,
  clip?: { x: number; y: number; width: number; height: number },
) => {
  const options = { path: file(name, scheme), animations: 'disabled', caret: 'hide' } as const;
  if ('goto' in target && clip) {
    await target.screenshot({ ...options, clip });
  } else if ('goto' in target) {
    // No hover state on whatever the last click left the pointer over.
    await target.mouse.move(VIEWPORT.width - 1, VIEWPORT.height - 1);
    await target.screenshot({ ...options, fullPage: true });
  } else {
    await target.page().mouse.move(0, 0);
    await target.screenshot(options);
  }
};

/** Extension pages follow prefers-color-scheme. */
const setScheme = (page: Page, scheme: Scheme) => page.emulateMedia({ colorScheme: scheme });

/**
 * Host page theme for the in-page UI: theme-detection reads the html class
 * (also on Brave Search), the body class on Bing and DuckDuckGo and, on
 * Google, the body background.
 * The fixture pages switch their own colors on `html.dark`.
 */
const setPageTheme = (
  page: Page,
  scheme: Scheme,
  colors = { background: 'rgb(32, 33, 36)', color: 'rgb(232, 234, 237)' },
) =>
  page.evaluate(
    ({ dark, colors }) => {
      document.documentElement.classList.toggle('dark', dark);
      document.documentElement.classList.toggle('light', !dark);
      document.body.classList.toggle('dark', dark);
      document.body.style.background = dark ? colors.background : 'rgb(255, 255, 255)';
      document.body.style.color = dark ? colors.color : '';
    },
    { dark: scheme === 'dark', colors },
  );

/** The search engines with a fixture page, their mount point and dark colors. */
const ENGINES = [
  {
    name: 'google',
    url: (q: string, rhs?: GoogleRightColumn) => googleUrl(q, rhs),
    host: '#rhs logseq-copilot-search-engine',
    dark: { background: 'rgb(32, 33, 36)', color: 'rgb(232, 234, 237)' },
  },
  {
    name: 'bing',
    url: (q: string) => bingUrl(q),
    host: '#b_context logseq-copilot-search-engine',
    dark: { background: 'rgb(27, 26, 25)', color: 'rgb(255, 255, 255)' },
  },
  {
    name: 'duckduckgo',
    url: (q: string) => duckDuckGoUrl(q),
    host: '.js-react-sidebar logseq-copilot-search-engine',
    dark: { background: 'rgb(28, 28, 28)', color: 'rgb(238, 238, 238)' },
  },
  {
    name: 'brave',
    url: (q: string) => braveUrl(q),
    host: '#mixed-side logseq-copilot-search-engine',
    dark: { background: 'rgb(28, 28, 29)', color: 'rgb(255, 255, 255)' },
  },
] as const;

/** Click every visible button named `name` (e.g. all "+N" buttons). */
const clickAll = async (host: Locator, name: RegExp) => {
  for (let i = 0; i < 50; i++) {
    const button = host.getByRole('button', { name }).first();
    if (!(await button.isVisible().catch(() => false))) return;
    await button.click();
  }
};

/** The title of a page in the search engine card. */
const pageRow = (host: Locator, title: string) =>
  host.locator('.lc-page-name').getByText(title, { exact: true });

const expectTheme = (host: Locator, scheme: Scheme) =>
  scheme === 'dark'
    ? expect(host.locator('[data-theme-container]').first()).toHaveClass(/\bdark\b/)
    : expect(host.locator('[data-theme-container]').first()).not.toHaveClass(/\bdark\b/);

const selectParagraph = (page: Page) =>
  page.evaluate(() => {
    const range = document.createRange();
    range.selectNodeContents(document.getElementById('target')!);
    getSelection()!.removeAllRanges();
    getSelection()!.addRange(range);
  });

/** Highlights on other sites, so the options list has more than one host. */
const seededHighlights = () => {
  const now = Date.now();
  const make = (i: number, url: string, title: string, text: string, extra: object = {}) => ({
    id: `ui-shot-${i}`,
    url,
    title,
    hostname: new URL(url).hostname,
    range: {
      startContainerXPath: '/html/body/p[1]/text()[1]',
      endContainerXPath: '/html/body/p[1]/text()[1]',
      startOffset: 0,
      endOffset: text.length,
      textContent: text,
    },
    createdAt: now - i * 26 * 60 * 60 * 1000,
    lastAccessedAt: now - i * 60 * 60 * 1000,
    color: 'yellow',
    ...extra,
  });
  return [
    make(1, 'https://developer.mozilla.org/en-US/docs/Web/API/CSS_Custom_Highlight_API', 'CSS Custom Highlight API - Web APIs | MDN',
      'The CSS Custom Highlight API provides a mechanism for styling arbitrary text ranges on a document by using JavaScript to create the ranges, and CSS to style them.',
      { note: 'Use this instead of wrapping text in spans.', tags: ['css', 'reading'] }),
    make(2, 'https://docs.logseq.com/#/page/http%20api', 'HTTP API - Logseq',
      'The HTTP APIs server listens on port 12315 by default and requires an authorization token for every request.',
      { tags: ['logseq'] }),
    make(9, 'https://en.wikipedia.org/wiki/Zettelkasten', 'Zettelkasten - Wikipedia',
      'A Zettelkasten consists of many individual notes with ideas and other short pieces of information that are taken down as they occur or are acquired.'),
  ];
};

test.describe('UI screenshots', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(VIEWPORT);
  });

  test('options pages', async ({ page, ext }) => {
    fileGraphOnly();
    await ext.connect();
    await ext.setStorage({ highlights: seededHighlights() });

    for (const scheme of SCHEMES) {
      await setScheme(page, scheme);

      await page.goto(ext.url('options.html#/settings'));
      await expect(page.getByRole('button', { name: /Connected to Logseq v/ })).toBeVisible();
      await shoot(page, 'options-settings', scheme);

      await page.goto(ext.url('options.html#/search-engine'));
      await expect(page.getByText('Google', { exact: true }).first()).toBeVisible();
      await shoot(page, 'options-search-engine', scheme);

      await page.goto(ext.url('options.html#/recall-rules'));
      const githubRule = page.getByText('GitHub Pull Request', { exact: true }).first();
      await expect(githubRule).toBeVisible();
      await shoot(page, 'options-recall-rules', scheme);

      await page.getByRole('button', { name: 'Edit GitHub Pull Request' }).click();
      await expect(page.locator('#urlPattern')).toHaveValue('github\\.com.*/(pull|issues)/');
      await shoot(page, 'options-recall-rule-form', scheme);

      await page.goto(ext.url('options.html#/templates'));
      await expect(page.locator('#template-content')).toBeVisible();
      await shoot(page, 'options-templates', scheme);

      await page.goto(ext.url('options.html#/highlights'));
      await expect(page.getByText('HTTP API - Logseq')).toBeVisible();
      await shoot(page, 'options-highlights', scheme);
    }
  });

  test('popup with results', async ({ page, ext }) => {
    fileGraphOnly();
    await ext.connect();
    await page.goto('https://example.com/copilot/article');

    for (const scheme of SCHEMES) {
      const popup = (await ext.openPopup(page)).page!;
      await setScheme(popup, scheme);
      await expect(popup.getByText('Reading notes from https://example.com/copilot/article')).toBeVisible();
      await shoot(popup.locator('#app-container > *').first(), 'popup', scheme);
      await popup.close();
    }
  });

  test('popup clip actions: with a selection, and a failed clip', async ({ page, ext }) => {
    fileGraphOnly();
    await ext.connect();
    await page.goto('https://example.com/copilot/article');
    await selectParagraph(page);

    for (const scheme of SCHEMES) {
      const popup = (await ext.openPopup(page)).page!;
      await setScheme(popup, scheme);
      await expect(popup.getByText('Reading notes from https://example.com/copilot/article')).toBeVisible();
      await expect(popup.getByRole('button', { name: 'Clip selection' })).toBeEnabled();
      await shoot(popup.locator('#app-container > *').first(), 'popup-selection', scheme);
      await popup.close();
    }

    // The search of the page worked, the clip after it fails: the error
    // is shown on the action.
    for (const scheme of SCHEMES) {
      await ext.connect();
      const popup = (await ext.openPopup(page)).page!;
      await setScheme(popup, scheme);
      await expect(popup.getByText('Reading notes from https://example.com/copilot/article')).toBeVisible();
      await ext.connect({ token: 'wrong-token' });
      await popup.getByRole('button', { name: 'Clip page' }).first().click();
      await expect(popup.getByRole('alert')).toContainText('The authorization token is wrong');
      await shoot(popup.locator('#app-container > *').first(), 'popup-clip-error', scheme);
      await popup.close();
    }

    // A wrong token from the start: the search shows the error, the failed
    // clip only marks its button.
    await ext.connect({ token: 'wrong-token' });
    for (const scheme of SCHEMES) {
      const popup = (await ext.openPopup(page)).page!;
      await setScheme(popup, scheme);
      await expect(popup.getByText(/The authorization token is wrong/)).toBeVisible();
      const clipPage = popup.getByRole('button', { name: 'Clip page' }).first();
      await clipPage.click();
      await expect(clipPage).toHaveAttribute('aria-invalid', 'true');
      await expect(popup.getByRole('alert')).toHaveCount(0);
      await shoot(popup.locator('#app-container > *').first(), 'popup-clip-error-search', scheme);
      await popup.close();
    }
  });

  test('page clip error', async ({ page, ext, articles }) => {
    fileGraphOnly();
    const id = nonce('shotfail');
    const url = `https://example.com/e2e/${id}`;
    articles.set(url, {
      title: 'Notes on building a second brain',
      paragraph: 'Capture what resonates, organize by project, distill to the essence.',
    });
    await ext.connect({ token: 'wrong-token' });
    await page.goto(url);
    const host = page.locator('logseq-copilot-popup');
    await expect(host).toBeAttached();

    for (const scheme of SCHEMES) {
      await setPageTheme(page, scheme);
      await expectTheme(host, scheme);
      await ext.sendToTab(page, 'content:quickCapturePage');
      const alert = host.locator('[data-clip-error]');
      await expect(alert).toContainText('The authorization token is wrong');
      await shoot(page, 'page-clip-error', scheme, {
        x: VIEWPORT.width - 480,
        y: VIEWPORT.height - 140,
        width: 480,
        height: 140,
      });
      await alert.click();
      await expect(alert).toHaveCount(0);
    }
  });

  test('popup with rich content', async ({ page, ext }) => {
    await ext.connect();
    await page.goto('https://example.com/copilot/article');

    for (const scheme of SCHEMES) {
      const popup = (await ext.openPopup(page)).page!;
      await setScheme(popup, scheme);
      await expect(popup.getByText('Reading notes from https://example.com/copilot/article')).toBeVisible();
      await popup.getByPlaceholder(/Search in your Logseq graph/).fill('showcase');
      await popup.getByPlaceholder(/Search in your Logseq graph/).press('Enter');
      await expect(popup.getByText('showcase parent block')).toBeVisible();
      await shoot(popup.locator('#app-container > *').first(), `popup-rich${variantSuffix()}`, scheme);
      await popup.close();
    }
  });

  test('search engine sidebar on Google, Bing, DuckDuckGo and Brave Search', async ({ page, ext }) => {
    fileGraphOnly();
    await ext.connect();
    const cases = [
      ...ENGINES.map((engine) => ({ engine, name: engine.name, url: engine.url('recallprobe') })),
      { engine: ENGINES[0], name: 'google-panel', url: googleUrl('recallprobe', 'panel') },
      // No right column: the sidebar makes its own column next to the results.
      { engine: { ...ENGINES[0], host: 'logseq-copilot-search-engine' }, name: 'google-no-rhs', url: googleUrl('recallprobe', 'none') },
    ];
    for (const { engine, name, url } of cases) {
      await page.goto(url);
      const host = page.locator(engine.host);
      await expect(pageRow(host, 'Recall Notes')).toBeVisible();
      for (const scheme of SCHEMES) {
        await setPageTheme(page, scheme, engine.dark);
        await expectTheme(host, scheme);
        await shoot(page, `search-sidebar-${name}`, scheme);
      }
    }
  });

  test('search engine sidebar in a narrow window', async ({ page, ext }) => {
    fileGraphOnly();
    await ext.connect();
    await page.setViewportSize({ width: 1024, height: 800 });
    await page.goto(googleUrl('recallprobe', 'none'));
    const host = page.locator('logseq-copilot-search-engine');
    await expect(pageRow(host, 'Recall Notes')).toBeVisible();
    for (const scheme of SCHEMES) {
      await setPageTheme(page, scheme);
      await expectTheme(host, scheme);
      await shoot(page, 'search-sidebar-google-narrow', scheme);
    }

    // Brave's right column would be cut off: the card goes above the results.
    await page.goto(braveUrl('recallprobe'));
    const braveHost = page.locator('#mixed-main logseq-copilot-search-engine');
    await expect(pageRow(braveHost, 'Recall Notes')).toBeVisible();
    for (const scheme of SCHEMES) {
      await setPageTheme(page, scheme, ENGINES[3].dark);
      await expectTheme(braveHost, scheme);
      await shoot(page, 'search-sidebar-brave-narrow', scheme);
    }
  });

  test('search engine card: deep hits under their context lines', async ({ page, ext }) => {
    await ext.connect();
    // The hit's parent is itself a hit (nested), tasks, references, "+N".
    await page.goto(bingUrl('recallprobe'));
    const host = page.locator(ENGINES[1].host);
    await expect(pageRow(host, 'Recall Notes')).toBeVisible();
    for (const scheme of SCHEMES) {
      await setPageTheme(page, scheme, ENGINES[1].dark);
      await expectTheme(host, scheme);
      await shoot(host, `search-card-deep${variantSuffix()}`, scheme);
    }
    await clickAll(host, /^Show \d+ more/);
    await expect(host.getByText(/^Recallprobe outline about/)).toBeVisible();
    await expect(host.locator('.lc-kids .lc-hit').first()).toBeVisible();
    const text = await host.locator('.lc-card').innerText();
    // References and tags read by name.
    expect(text).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-/);
    expect(text).toContain('Another Page');
    for (const scheme of SCHEMES) {
      await setPageTheme(page, scheme, ENGINES[1].dark);
      await expectTheme(host, scheme);
      await shoot(host, `search-card-deep-expanded${variantSuffix()}`, scheme);
    }

    // Two hits under one context line ("Recallprobe grandchild detail"),
    // below a block with only a property.
    await page.goto(bingUrl('deepnest'));
    await expect(host.getByText('Deepnest leaf alpha')).toBeVisible();
    await expect(host.locator('.lc-ctx')).toHaveCount(1);
    await expect(host.locator('.lc-kids .lc-hit')).toHaveCount(2);
    for (const scheme of SCHEMES) {
      await setPageTheme(page, scheme, ENGINES[1].dark);
      await expectTheme(host, scheme);
      await shoot(host, `search-card-shared-context${variantSuffix()}`, scheme);
    }
  });

  test('search engine card: a journal day with two topics', async ({ page, ext }) => {
    await ext.connect();
    await page.goto(googleUrl('journaldeep'));
    const host = page.locator(ENGINES[0].host);
    // Three hits, two levels under a root and a parent context line each;
    // which two come first depends on the graph type.
    await expect(host.locator('.lc-kids .lc-kids .lc-hit')).toHaveCount(2);
    for (const scheme of SCHEMES) {
      await setPageTheme(page, scheme);
      await expectTheme(host, scheme);
      await shoot(host, `search-card-journal${variantSuffix()}`, scheme);
    }
    await clickAll(host, /^Show \d+ more/);
    await expect(host.locator('.lc-kids .lc-kids .lc-hit')).toHaveCount(3);
    for (const text of ['Homelab', 'Router upgrade', 'Journaldeep firmware notes', '1:1 with Alice', 'Journaldeep promotion notes', 'Journaldeep raise notes']) {
      await expect(host.getByText(text, { exact: true })).toBeVisible();
    }
    // "Career goals" is the context of two hits, drawn once.
    await expect(host.getByText('Career goals', { exact: true })).toHaveCount(1);
    for (const scheme of SCHEMES) {
      await setPageTheme(page, scheme);
      await expectTheme(host, scheme);
      await shoot(host, `search-card-journal-expanded${variantSuffix()}`, scheme);
    }
  });

  test('search engine card with many pages', async ({ page, ext }) => {
    await ext.connect();
    await page.goto(googleUrl('notes'));
    const host = page.locator(ENGINES[0].host);
    await expect(host.locator('.lc-page')).toHaveCount(3);
    for (const scheme of SCHEMES) {
      await setPageTheme(page, scheme);
      await expectTheme(host, scheme);
      await shoot(host, `search-card-many${variantSuffix()}`, scheme);
    }
    await clickAll(host, /more pages$/);
    await clickAll(host, /^Show \d+ more/);
    expect(await host.locator('.lc-page').count()).toBeGreaterThan(3);
    for (const scheme of SCHEMES) {
      await setPageTheme(page, scheme);
      await expectTheme(host, scheme);
      await shoot(host, `search-card-many-all${variantSuffix()}`, scheme);
    }
  });

  test('search engine card states: hover, no results, loading, error', async ({ page, ext }) => {
    fileGraphOnly();
    await ext.connect();
    const host = page.locator(ENGINES[0].host);

    // Hover: the settings gear and the row background.
    await page.goto(googleUrl('journaldeep'));
    const hit = host.locator('.lc-hit').first();
    await expect(hit).toBeVisible();
    for (const scheme of SCHEMES) {
      await setPageTheme(page, scheme);
      await expectTheme(host, scheme);
      await hit.hover();
      await expect(host.locator('.lc-gear')).toHaveCSS('opacity', '1');
      await host.locator('.lc-card').screenshot({ path: file('search-card-hover', scheme), animations: 'disabled' });
    }

    await page.goto(googleUrl('zzqxnomatch'));
    await expect(host.getByText('No related notes in Logseq')).toBeVisible();
    for (const scheme of SCHEMES) {
      await setPageTheme(page, scheme);
      await expectTheme(host, scheme);
      await shoot(host, 'search-card-empty', scheme);
    }

    // Loading: Logseq never answers.
    await ext.evaluate(() => {
      (globalThis as any).fetch = () => new Promise(() => {});
    });
    await page.goto(googleUrl('loadingprobe'));
    await expect(host.locator('[aria-busy="true"]')).toBeVisible();
    for (const scheme of SCHEMES) {
      await setPageTheme(page, scheme);
      await expectTheme(host, scheme);
      await shoot(host, 'search-card-loading', scheme);
    }
  });

  test('search engine card when Logseq refuses the token', async ({ page, ext }) => {
    fileGraphOnly();
    await ext.connect({ token: 'wrong-token' });
    await page.goto(googleUrl('recallprobe'));
    const host = page.locator(ENGINES[0].host);
    await expect(host.getByRole('button', { name: 'Check the connection' })).toBeVisible();
    for (const scheme of SCHEMES) {
      await setPageTheme(page, scheme);
      await expectTheme(host, scheme);
      await shoot(host, 'search-card-error', scheme);
    }
  });

  test('page highlight, float button and comment popup', async ({ page, ext, articles }) => {
    fileGraphOnly();
    const id = nonce('shot');
    const url = `https://example.com/e2e/${id}`;
    articles.set(url, {
      title: 'Notes on building a second brain',
      paragraph:
        'Capture what resonates, organize by project, distill to the essence and express it in your own words.',
    });

    // The float button is behind an option (off by default).
    await ext.connect({ enableClipNoteFloatButton: true });
    await page.goto(url);
    await expect(page.locator('logseq-copilot-popup')).toBeAttached();
    await selectParagraph(page);
    await ext.sendToTab(page, 'content:quickCapture');
    const stored = async () =>
      ((await ext.getStorage('highlights')) ?? []).filter((h: any) => h.url === url);
    await expect.poll(async () => (await stored()).length).toBe(1);
    const [highlight] = await stored();
    await ext.setStorage({
      highlights: [{ ...highlight, note: 'Good summary of the CODE method.', tags: ['pkm'] }],
    });

    await page.reload();
    await expect.poll(() => page.evaluate(() => CSS.highlights.size)).toBeGreaterThan(0);
    const popupHost = page.locator('logseq-copilot-popup');

    for (const scheme of SCHEMES) {
      await setPageTheme(page, scheme);
      await expectTheme(popupHost, scheme);

      // The saved highlight on the page and the float button after a mouse
      // selection of the next paragraph.
      const other = (await page.locator('p').nth(1).boundingBox())!;
      await page.mouse.move(other.x + 1, other.y + other.height / 2);
      await page.mouse.down();
      await page.mouse.move(other.x + other.width * 0.6, other.y + other.height / 2, { steps: 5 });
      await page.mouse.up();
      const floatButton = popupHost.locator('img.quickCapture');
      await expect(floatButton).toBeVisible();
      await shoot(page, 'page-highlight-float-button', scheme, { x: 0, y: 0, width: 960, height: 240 });
      // A click on other text clears the selection and hides the button.
      await page.locator('h1').click();
      await expect(floatButton).toBeHidden();

      const box = await page.locator('#target').boundingBox();
      await page.mouse.click(box!.x + 20, box!.y + box!.height / 2);
      const popup = popupHost.locator('[data-highlight-popup]');
      await expect(popup).toContainText('Good summary of the CODE method.');
      await shoot(popup, 'highlight-popup', scheme);
      await page.keyboard.press('Escape');
      await expect(popup).toHaveCount(0);
    }
  });

  test('in-page highlights sidebar', async ({ page, ext, articles }) => {
    fileGraphOnly();
    const id = nonce('shot');
    const url = `https://example.com/e2e/${id}`;
    const paragraph =
      'Capture what resonates, organize by project, distill to the essence and express it in your own words.';
    articles.set(url, { title: 'Notes on building a second brain', paragraph });
    // Highlights of this page: one on its paragraph, so the page shows it too.
    const [first, second, third] = seededHighlights();
    const onThisPage = (highlight: typeof first, extra: object = {}) => ({
      ...highlight,
      ...extra,
      id: `${highlight.id}-${id}`,
      url,
      title: 'Notes on building a second brain',
      hostname: 'example.com',
    });

    // Browsers without a sidebar of their own (Safari) show this one; here
    // the open state is set the way their popup button sets it.
    await ext.connect();
    await ext.setStorage({
      highlights: [
        onThisPage(first, {
          range: { ...first.range, endOffset: paragraph.length, textContent: paragraph },
          createdAt: Date.now(),
        }),
        onThisPage(second),
        onThisPage(third),
      ],
      inPageSidebarOpen: true,
    });

    await page.goto(url);
    const host = page.locator('logseq-copilot-highlights');
    await expect(host.getByText(paragraph)).toBeVisible();
    await expect(host.getByRole('button', { name: 'Close' })).toBeVisible();
    for (const scheme of SCHEMES) {
      await setPageTheme(page, scheme);
      await expectTheme(host, scheme);
      await shoot(page, 'in-page-sidebar', scheme);
    }
  });

  test('browser sidebar page', async ({ page, ext, articles, logseq }) => {
    fileGraphOnly();
    const id = nonce('sidepanel');
    const url = `https://example.com/e2e/${id}`;
    const paragraph =
      'Progressive summarization distills a note in layers: bold the key passages, then highlight the best of those.';
    articles.set(url, { title: 'Progressive summarization', paragraph });

    // What the graph has about the page: a task, and a block under a parent
    // that mentions the page too (nested, with its guide line).
    const append = (pageName: string, content: string) =>
      logseq.callApi('logseq.Editor.appendBlockInPage', [pageName, content]);
    await append('Reading List', `TODO Try the layers on the next long article ${url}`);
    const parent = await append('Copilot Test Page', `Summarizing in layers ${url}`);
    await logseq.callApi('logseq.Editor.insertBlock', [
      parent.uuid,
      `Second pass: keep only what changes how I act, see [[Another Page]] ${url}`,
      { sibling: false },
    ]);

    // Highlights of the page, one with a note.
    const [first, second] = seededHighlights();
    const onThisPage = (highlight: typeof first, text: string, extra: object = {}) => ({
      ...highlight,
      ...extra,
      id: `${highlight.id}-${id}`,
      url,
      title: 'Progressive summarization',
      hostname: 'example.com',
      range: { ...highlight.range, endOffset: text.length, textContent: text },
    });
    await ext.connect();
    await ext.setStorage({
      highlights: [
        onThisPage(first, paragraph, { note: 'Try this on the next long read.' }),
        onThisPage(second, 'Each layer is a smaller, sharper version of the one before.', {
          note: undefined,
          createdAt: Date.now() - 60 * 60 * 1000,
        }),
      ],
    });

    // The real sidebar (Chrome side panel, Firefox sidebar) follows the active
    // tab of its window and is not exposed to Playwright. Opened as a tab in
    // the article's window, as narrow as a sidebar, with the article as the
    // active tab, it shows what the side panel would.
    await page.goto(url);
    const sidebar = await page.context().newPage();
    await sidebar.setViewportSize({ width: 400, height: 720 });

    for (const scheme of SCHEMES) {
      await setScheme(sidebar, scheme);
      await sidebar.goto(ext.url('sidepanel.html'));
      await ext.activate(page);
      await expect(sidebar.getByText('Try this on the next long read.')).toBeVisible();
      await expect(sidebar.getByText('Try the layers on the next long article')).toBeVisible();
      await expect(sidebar.getByText(/Second pass: keep only/)).toBeVisible();
      await expect(sidebar.getByRole('link', { name: logseq.graph })).toBeVisible();
      await shoot(sidebar.locator('#app > *').first(), 'sidepanel', scheme);
    }
    await sidebar.close();
  });
});
