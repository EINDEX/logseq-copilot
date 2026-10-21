/**
 * Fixture pages served through `context.route`, so no test ever reaches the
 * real Google, Bing, DuckDuckGo or example.com. The content script injects
 * into them exactly like into the real sites.
 *
 * The search result pages copy the parts of the real layouts the sidebar
 * depends on: the mount point of the built-in engine config (Google `#rhs`,
 * Bing `#b_context`, DuckDuckGo `.js-react-sidebar`), the column widths, the
 * page fonts and colors. Dark mode follows `html.dark`, which is what the
 * screenshot spec toggles (together with the body background that Google's
 * theme detection reads). The numbers are approximations of the real pages
 * (measured on desktop at 1440px), not copies.
 */
import type { BrowserContext } from '@playwright/test';

const escapeHtml = (text: string) =>
  text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** Organic results shared by the engine fixtures. */
const organicResults = (q: string) => [
  {
    site: 'Logseq',
    url: 'https://docs.logseq.com',
    path: 'https://docs.logseq.com › #/page/search',
    title: `Search in Logseq: how to find ${q} in your graph`,
    snippet: `Logseq search covers pages and blocks of the current graph. Results for ${q} are ranked by relevance; full-text matches of long pages are cut to a snippet.`,
  },
  {
    site: 'GitHub',
    url: 'https://github.com/logseq/logseq',
    path: 'https://github.com › logseq › logseq',
    title: 'logseq/logseq: A privacy-first, open-source platform for knowledge management',
    snippet: 'A privacy-first, open-source platform for knowledge management and collaboration. Download link: http://github.com/logseq/logseq/releases.',
  },
  {
    site: 'Wikipedia',
    url: 'https://en.wikipedia.org/wiki/Zettelkasten',
    path: 'https://en.wikipedia.org › wiki › Zettelkasten',
    title: 'Zettelkasten - Wikipedia',
    snippet: 'A Zettelkasten consists of many individual notes with ideas and other short pieces of information that are taken down as they occur or are acquired.',
  },
  {
    site: 'Forum',
    url: 'https://discuss.logseq.com',
    path: 'https://discuss.logseq.com › t › 1234',
    title: `Tips for organizing ${q} notes`,
    snippet: 'Use page references and tags for the things you want to find again, and keep one idea per block so search results stay readable.',
  },
  {
    site: 'Blog',
    url: 'https://example.org',
    path: 'https://example.org › blog › second-brain',
    title: 'Building a second brain with outliners',
    snippet: 'Capture what resonates, organize by project, distill to the essence and express it in your own words.',
  },
];

export type GoogleRightColumn = 'empty' | 'panel' | 'none';

/**
 * Google result page. The built-in Google engine matches the `.google.com`
 * host, reads `?q` and mounts the sidebar first into `#rhs`; without `#rhs`
 * (most queries, no knowledge panel) it appends its own column after
 * `#center_col` (src/entrypoints/content/searchingEngines).
 *
 * `rhs`: `empty` (default) an empty `#rhs`, `panel` a knowledge panel in it,
 * `none` no right column at all. A white body keeps theme-detection on
 * "light" until a test switches it.
 */
export function googleResultsHtml(query: string, rhs: GoogleRightColumn = 'empty') {
  const q = escapeHtml(query);
  const results = organicResults(q)
    .map(
      (r) => `<div class="g">
        <div class="site"><span class="favicon">${r.site[0]}</span>
          <div><div class="site-name">${r.site}</div><cite>${r.path}</cite></div></div>
        <h3><a href="${r.url}">${r.title}</a></h3>
        <div class="snippet">${r.snippet}</div>
      </div>`,
    )
    .join('\n');
  const panel = `<div class="kp">
      <div class="kp-title">Logseq</div>
      <div class="kp-sub">Software</div>
      <div class="kp-text">Logseq is a privacy-first, open-source knowledge base that works on top of local plain-text Markdown and Org-mode files.</div>
      <div class="kp-row"><b>Developer:</b> Logseq team</div>
      <div class="kp-row"><b>License:</b> AGPL-3.0</div>
    </div>`;
  const rightColumn = rhs === 'none' ? '' : `<div id="rhs">${rhs === 'panel' ? panel : ''}</div>`;
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>${q} - Google Search</title>
<style>
  html, body { margin: 0; }
  body { background: #ffffff; color: #202124; font-family: Arial, sans-serif; font-size: 14px; line-height: 1.58; }
  a { text-decoration: none; }
  #searchform { display: flex; align-items: center; height: 72px; padding: 14px 0 0 32px; box-sizing: border-box; }
  .logo { width: 116px; margin-right: 32px; font: 500 28px/1 Arial, sans-serif; letter-spacing: -1px; color: #4285f4; }
  .sbox { box-sizing: border-box; width: 692px; height: 46px; padding: 0 20px; display: flex; align-items: center;
    border: 1px solid #dfe1e5; border-radius: 24px; box-shadow: 0 1px 6px rgba(32,33,36,.18); font-size: 16px; }
  .sbox input { flex: 1; border: 0; outline: 0; background: transparent; color: inherit; font: inherit; }
  #top_nav { display: flex; gap: 24px; height: 46px; align-items: center; padding-left: 180px; border-bottom: 1px solid #ebebeb; color: #5f6368; font-size: 14px; }
  #top_nav .on { color: #1a73e8; box-shadow: inset 0 -3px #1a73e8; height: 100%; display: flex; align-items: center; }
  #rcnt { display: flex; align-items: flex-start; padding: 20px 0 40px 180px; max-width: 1197px; }
  #center_col { flex: 0 0 auto; width: 652px; }
  #rhs { flex: 0 0 auto; width: 369px; margin-left: 76px; }
  .stats { color: #70757a; margin-bottom: 18px; }
  .g { margin-bottom: 30px; }
  .site { display: flex; align-items: center; gap: 12px; margin-bottom: 4px; }
  .favicon { width: 26px; height: 26px; border-radius: 50%; background: #f1f3f4; border: 1px solid #ecedef; display: flex; align-items: center; justify-content: center; font-size: 12px; color: #5f6368; }
  .site-name { font-size: 14px; line-height: 20px; color: #202124; }
  cite { display: block; font-style: normal; font-size: 12px; line-height: 18px; color: #4d5156; }
  .g h3 { margin: 6px 0 3px; font-size: 20px; line-height: 26px; font-weight: 400; }
  .g h3 a { color: #1a0dab; }
  .snippet { color: #4d5156; font-size: 14px; line-height: 22px; }
  .kp { border: 1px solid #dadce0; border-radius: 8px; padding: 16px; }
  .kp-title { font-size: 28px; line-height: 36px; }
  .kp-sub { color: #70757a; margin-bottom: 12px; }
  .kp-text { color: #4d5156; margin-bottom: 10px; }
  html.dark .sbox { border-color: #5f6368; background: #303134; box-shadow: none; }
  html.dark #top_nav { border-color: #3c4043; color: #9aa0a6; }
  html.dark #top_nav .on { color: #8ab4f8; box-shadow: inset 0 -3px #8ab4f8; }
  html.dark .stats { color: #9aa0a6; }
  html.dark .favicon { background: #303134; border-color: #3c4043; color: #bdc1c6; }
  html.dark .site-name { color: #dadce0; }
  html.dark cite, html.dark .snippet, html.dark .kp-text { color: #bdc1c6; }
  html.dark .g h3 a { color: #99c3ff; }
  html.dark .kp { border-color: #3c4043; }
</style></head>
<body>
  <div id="searchform"><div class="logo">Google</div>
    <form role="search" class="sbox"><input name="q" value="${q}"></form></div>
  <div id="top_nav"><span class="on">All</span><span>Images</span><span>Videos</span><span>News</span><span>Maps</span><span>More</span></div>
  <div id="main"><div id="cnt"><div id="rcnt">
    <div id="center_col"><div id="res"><div id="search"><div id="rso">
      <div class="stats">About 1,230,000 results (0.31 seconds)</div>
      ${results}
    </div></div></div></div>
    ${rightColumn}
  </div></div></div>
</body>
</html>`;
}

/**
 * Bing result page: the built-in Bing engine mounts an `li.b_ans` first into
 * the right rail `#b_context`, whose modules are white cards on Bing.
 */
export function bingResultsHtml(query: string) {
  const q = escapeHtml(query);
  const results = organicResults(q)
    .map(
      (r) => `<li class="b_algo">
        <div class="b_attribution"><span class="favicon">${r.site[0]}</span><div><div class="site-name">${r.site}</div><cite>${r.url}</cite></div></div>
        <h2><a href="${r.url}">${r.title}</a></h2>
        <p>${r.snippet}</p>
      </li>`,
    )
    .join('\n');
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>${q} - Search</title>
<style>
  html, body { margin: 0; }
  body { background: #ffffff; color: #111111; font-family: "Segoe UI", "Segoe UI Web (West European)", -apple-system, BlinkMacSystemFont, Roboto, "Helvetica Neue", Arial, sans-serif; font-size: 14px; line-height: 22px; }
  a { text-decoration: none; }
  #b_header { display: flex; align-items: center; gap: 28px; height: 64px; padding: 12px 0 0 24px; box-sizing: border-box; }
  .logo { width: 108px; font: 600 24px/1 "Segoe UI", Arial, sans-serif; color: #174ae4; }
  .sbox { box-sizing: border-box; width: 608px; height: 44px; padding: 0 18px; display: flex; align-items: center;
    border-radius: 24px; box-shadow: 0 0 0 1px rgba(0,0,0,.1), 0 2px 4px 1px rgba(0,0,0,.18); font-size: 16px; }
  .sbox input { flex: 1; border: 0; outline: 0; background: transparent; color: inherit; font: inherit; }
  #b_scopes { display: flex; gap: 24px; height: 40px; align-items: center; padding-left: 160px; border-bottom: 1px solid #ececec; color: #444; font-size: 13px; text-transform: uppercase; }
  #b_scopes .on { color: #111; box-shadow: inset 0 -3px #174ae4; height: 100%; display: flex; align-items: center; }
  #b_content { display: flex; align-items: flex-start; padding: 16px 0 40px 160px; }
  #b_results { list-style: none; margin: 0; padding: 0; width: 608px; flex: 0 0 auto; }
  #b_context { list-style: none; margin: 0 0 0 40px; padding: 0; width: 432px; flex: 0 0 auto; }
  #b_context > li.b_ans { background: #ffffff; border-radius: 6px; padding: 16px 20px; margin-bottom: 16px;
    box-shadow: 0 0 0 1px rgba(0,0,0,.05), 0 2px 3px 0 rgba(0,0,0,.1); }
  .b_algo { padding: 12px 0 18px; }
  .b_attribution { display: flex; align-items: center; gap: 8px; }
  .favicon { width: 18px; height: 18px; border-radius: 50%; background: #f1f1f1; font-size: 11px; line-height: 18px; text-align: center; color: #444; }
  .site-name { font-size: 14px; line-height: 18px; }
  cite { display: block; font-style: normal; font-size: 12px; line-height: 16px; color: #006d21; }
  .b_algo h2 { margin: 6px 0 4px; font-size: 20px; line-height: 26px; font-weight: 400; }
  .b_algo h2 a { color: #1a0dab; }
  .b_algo p { margin: 0; color: #71777d; }
  .related h2 { margin: 0 0 8px; font-size: 18px; font-weight: 600; }
  .related a { display: block; color: #1a0dab; padding: 4px 0; }
  html.dark #b_scopes { border-color: #333; color: #b3b3b3; }
  html.dark #b_scopes .on { color: #fff; box-shadow: inset 0 -3px #7da5ff; }
  html.dark .sbox { background: #2b2b2b; box-shadow: 0 0 0 1px rgba(255,255,255,.12); }
  html.dark #b_context > li.b_ans { background: #2b2b2b; box-shadow: 0 0 0 1px rgba(255,255,255,.08); }
  html.dark .favicon { background: #3a3a3a; color: #ddd; }
  html.dark cite { color: #8ac496; }
  html.dark .b_algo h2 a, html.dark .related a { color: #9ab6ff; }
  html.dark .b_algo p { color: #b3b3b3; }
</style></head>
<body>
  <header id="b_header"><div class="logo">Microsoft Bing</div>
    <form class="sbox"><input name="q" value="${q}"></form></header>
  <nav id="b_scopes"><span class="on">All</span><span>Search</span><span>Images</span><span>Videos</span><span>Maps</span><span>News</span></nav>
  <main id="b_content">
    <ol id="b_results">${results}</ol>
    <ol id="b_context">
      <li class="b_ans related"><h2>Related searches</h2>
        <a href="#">${q} tutorial</a><a href="#">${q} vs obsidian</a><a href="#">${q} plugins</a></li>
    </ol>
  </main>
</body>
</html>`;
}

/**
 * DuckDuckGo result page: the built-in engine mounts a div (8px left margin)
 * first into `.js-react-sidebar`, next to the result column.
 */
export function duckDuckGoResultsHtml(query: string) {
  const q = escapeHtml(query);
  const results = organicResults(q)
    .map(
      (r) => `<article class="result">
        <div class="result-url"><span class="favicon">${r.site[0]}</span><span>${r.site}</span><span class="path">${r.path}</span></div>
        <h2><a href="${r.url}">${r.title}</a></h2>
        <div class="result-snippet">${r.snippet}</div>
      </article>`,
    )
    .join('\n');
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>${q} at DuckDuckGo</title>
<style>
  html, body { margin: 0; }
  body { background: #ffffff; color: #1c1c1c; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; font-size: 14px; line-height: 1.5; }
  a { text-decoration: none; }
  #header { display: flex; align-items: center; gap: 24px; height: 76px; padding: 0 0 0 28px; }
  .logo { width: 120px; font: 700 20px/1 -apple-system, Arial, sans-serif; color: #de5833; }
  .sbox { box-sizing: border-box; width: 656px; height: 44px; padding: 0 16px; display: flex; align-items: center;
    border: 1px solid #ddd; border-radius: 8px; font-size: 16px; }
  .sbox input { flex: 1; border: 0; outline: 0; background: transparent; color: inherit; font: inherit; }
  #tabs { display: flex; gap: 24px; height: 40px; align-items: center; padding-left: 172px; border-bottom: 1px solid #eaeaea; color: #666; }
  #tabs .on { color: #1c1c1c; box-shadow: inset 0 -2px #de5833; height: 100%; display: flex; align-items: center; }
  #react-layout { display: flex; align-items: flex-start; padding: 20px 0 40px 172px; }
  section[data-area="mainline"] { width: 672px; flex: 0 0 auto; }
  .js-react-sidebar { width: 448px; margin-left: 32px; flex: 0 0 auto; }
  .module { border: 1px solid rgba(0,0,0,.08); border-radius: 8px; padding: 16px; margin-bottom: 16px; }
  .module h2 { margin: 0 0 6px; font-size: 18px; }
  .module p { margin: 0; color: #666; }
  .result { margin-bottom: 26px; }
  .result-url { display: flex; align-items: center; gap: 8px; color: #1c1c1c; font-size: 13px; }
  .result-url .path { color: #666; }
  .favicon { width: 16px; height: 16px; border-radius: 4px; background: #eee; font-size: 10px; line-height: 16px; text-align: center; }
  .result h2 { margin: 4px 0; font-size: 18px; line-height: 24px; font-weight: 400; }
  .result h2 a { color: #2b4ac4; }
  .result-snippet { color: #494949; }
  html.dark #tabs { border-color: #333; color: #aaa; }
  html.dark #tabs .on { color: #eee; }
  html.dark .sbox { border-color: #444; background: #282828; }
  html.dark .module { border-color: rgba(255,255,255,.1); }
  html.dark .module p, html.dark .result-url .path { color: #aaa; }
  html.dark .result-url { color: #eee; }
  html.dark .favicon { background: #333; color: #ddd; }
  html.dark .result h2 a { color: #8bb1ff; }
  html.dark .result-snippet { color: #bbb; }
</style></head>
<body>
  <div id="header"><div class="logo">DuckDuckGo</div>
    <form class="sbox" id="search_form"><input id="search_form_input" name="q" value="${q}"></form></div>
  <nav id="tabs"><span class="on">All</span><span>Images</span><span>Videos</span><span>News</span><span>Maps</span></nav>
  <div id="react-layout">
    <section data-area="mainline">${results}</section>
    <section data-area="sidebar" class="js-react-sidebar">
      <div class="module"><h2>Logseq</h2><p>Open-source outliner for knowledge management. More at Wikipedia.</p></div>
    </section>
  </div>
</body>
</html>`;
}

/** An article page with a unique title and paragraph to select and clip. */
export function articleHtml(title: string, paragraph: string) {
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>body { background: #fff; color: #111; font: 16px/1.5 sans-serif; margin: 40px; }</style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  <p id="target">${escapeHtml(paragraph)}</p>
  <p>Some other text that is not part of the selection.</p>
</body>
</html>`;
}

/** `rhs` is read by the fixture route only; the extension reads `q`. */
export const googleUrl = (query: string, rhs?: GoogleRightColumn) =>
  `https://www.google.com/search?q=${encodeURIComponent(query)}${rhs ? `&rhs=${rhs}` : ''}`;

export const bingUrl = (query: string) =>
  `https://www.bing.com/search?q=${encodeURIComponent(query)}`;

export const duckDuckGoUrl = (query: string) =>
  `https://duckduckgo.com/?q=${encodeURIComponent(query)}`;

/**
 * Route the fixture sites. Article pages are looked up by URL in `articles`;
 * unknown example.com URLs get a generic article.
 */
export async function routeFixtureSites(
  context: BrowserContext,
  articles: Map<string, { title: string; paragraph: string }>,
) {
  // Anything else stays offline. Registered first because Playwright tries
  // the most recently added route first.
  await context.route(/^https?:\/\/(?!127\.0\.0\.1|localhost)/, (route) => route.abort());
  await context.route('https://www.google.com/search*', (route) => {
    const params = new URL(route.request().url()).searchParams;
    const rhs = (params.get('rhs') as GoogleRightColumn | null) ?? 'empty';
    return route.fulfill({ contentType: 'text/html', body: googleResultsHtml(params.get('q') ?? '', rhs) });
  });
  await context.route('https://www.bing.com/search*', (route) => {
    const query = new URL(route.request().url()).searchParams.get('q') ?? '';
    return route.fulfill({ contentType: 'text/html', body: bingResultsHtml(query) });
  });
  await context.route('https://duckduckgo.com/?*', (route) => {
    const query = new URL(route.request().url()).searchParams.get('q') ?? '';
    return route.fulfill({ contentType: 'text/html', body: duckDuckGoResultsHtml(query) });
  });
  await context.route('https://example.com/**', (route) => {
    const url = route.request().url();
    const article = articles.get(url) ?? {
      title: `Fixture ${new URL(url).pathname}`,
      paragraph: 'Fixture article body.',
    };
    return route.fulfill({
      contentType: 'text/html',
      body: articleHtml(article.title, article.paragraph),
    });
  });
}
