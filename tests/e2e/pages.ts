/**
 * Fixture pages served through `context.route`, so no test ever reaches the
 * real Google or example.com. The content script injects into them exactly
 * like into the real sites.
 */
import type { BrowserContext } from '@playwright/test';

const escapeHtml = (text: string) =>
  text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/**
 * Minimal Google result page: the built-in Google engine matches the
 * `.google.com` host, reads `?q` and mounts the sidebar into `#rhs`
 * (src/entrypoints/content/searchingEngines). A white body keeps
 * theme-detection on "light" until a test switches it.
 */
export function googleResultsHtml(query: string) {
  const q = escapeHtml(query);
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>${q} - Google Search</title>
<style>
  body { background: #ffffff; color: #202124; font-family: sans-serif; margin: 0; }
  #main { display: flex; gap: 24px; padding: 16px; }
  #center_col { width: 600px; }
  #rhs { width: 372px; }
</style></head>
<body>
  <form role="search"><input name="q" value="${q}"></form>
  <div id="main">
    <div id="center_col"><div id="search"><div class="g"><h3>Result for ${q}</h3></div></div></div>
    <div id="rhs"></div>
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

export const googleUrl = (query: string) =>
  `https://www.google.com/search?q=${encodeURIComponent(query)}`;

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
    const query = new URL(route.request().url()).searchParams.get('q') ?? '';
    return route.fulfill({ contentType: 'text/html', body: googleResultsHtml(query) });
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
