/**
 * When two links are the same web page, for grouping the clips of one page
 * under one block (see `findGroupTarget`).
 *
 * `samePageKey(url)` is the normalised form: two URLs are the same page when
 * their keys are equal.
 *
 * - The scheme is ignored (`http` = `https`).
 * - The host is lower case; `www.` stays (`www.a.com` and `a.com` differ).
 * - The `#fragment` is dropped.
 * - A trailing `/` of the path is dropped, except for the root `/`.
 * - The tracking parameters are dropped: `utm_*`, `fbclid`, `gclid`,
 *   `mc_cid`, `mc_eid`, `ref_src`.
 * - Every other query parameter stays, sorted by key: a query usually selects
 *   different content.
 * - Percent-escapes are decoded, and so are the `\)` style escapes of a link
 *   stored in Logseq, so a stored link compares with the page's own URL.
 */

const TRACKING_PARAMS = new Set([
  'fbclid',
  'gclid',
  'mc_cid',
  'mc_eid',
  'ref_src',
]);

const isTracking = (key: string) => {
  const lower = key.toLowerCase();
  return lower.startsWith('utm_') || TRACKING_PARAMS.has(lower);
};

/** Percent-decodes `text`; a malformed escape keeps the text as it is. */
const decode = (text: string) => {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
};

/** `\)` and the like: a backslash before a punctuation mark. */
const unescapeLink = (text: string) => text.replace(/\\([!-/:-@[-`{-~])/g, '$1');

/**
 * The key of a page URL, or undefined for a text that is not an http(s) URL.
 */
export const samePageKey = (url: string | undefined): string | undefined => {
  if (!url) return undefined;
  let parsed: URL;
  try {
    parsed = new URL(unescapeLink(url.trim()));
  } catch {
    return undefined;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return undefined;
  }

  let path = decode(parsed.pathname);
  if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);

  const params = parsed.search
    .slice(1)
    .split('&')
    .filter((part) => part !== '')
    .map((part) => {
      const at = part.indexOf('=');
      const key = decode((at === -1 ? part : part.slice(0, at)).replace(/\+/g, ' '));
      const value =
        at === -1 ? undefined : decode(part.slice(at + 1).replace(/\+/g, ' '));
      return { key, value };
    })
    .filter(({ key }) => !isTracking(key))
    .sort((a, b) =>
      a.key === b.key
        ? (a.value ?? '') < (b.value ?? '')
          ? -1
          : (a.value ?? '') > (b.value ?? '')
            ? 1
            : 0
        : a.key < b.key
          ? -1
          : 1,
    )
    .map(({ key, value }) =>
      value === undefined
        ? encodeURIComponent(key)
        : `${encodeURIComponent(key)}=${encodeURIComponent(value)}`,
    );

  return `${parsed.host}${path}${params.length ? `?${params.join('&')}` : ''}`;
};

/** A Markdown link destination: escapes, and one level of balanced parentheses. */
const MARKDOWN_LINK =
  /\[(?:\\.|[^\]\\])*\]\(\s*<?((?:\\.|[^()\\\s>]|\((?:\\.|[^()\\\s>])*\)|\()+)>?(?:\s+(?:"[^"]*"|'[^']*'))?\s*\)/g;
const BARE_URL = /https?:\/\/(?:\\.|[^\s<>"'\]\\])+/g;

/**
 * A bare URL ends before the punctuation that closes a sentence. An escaped
 * `\)` belongs to the URL (that is how Logseq text stores an unbalanced `)`),
 * and so does a `)` that closes a `(` of the URL.
 */
const trimBareUrl = (url: string) => {
  let end = url.length;
  while (end > 0) {
    const last = url[end - 1];
    let backslashes = 0;
    while (url[end - 2 - backslashes] === '\\') backslashes++;
    if (backslashes % 2 === 1) break; // the last character is escaped
    if (/[.,;:!?]/.test(last)) end--;
    else if (last === ')') {
      const head = url.slice(0, end - 1);
      const opens = (head.match(/(?<!\\)\(/g) ?? []).length;
      const closes = (head.match(/(?<!\\)\)/g) ?? []).length;
      if (opens > closes) break; // closes a `(` of the URL
      end--;
    } else break;
  }
  return url.slice(0, end);
};

/**
 * The keys of every page `text` links to: Markdown links `[..](url)` and bare
 * URLs.
 */
export const linkKeys = (text: string): Set<string> => {
  const keys = new Set<string>();
  const add = (link: string) => {
    const key = samePageKey(link);
    if (key) keys.add(key);
  };
  for (const match of text.matchAll(MARKDOWN_LINK)) add(match[1]);
  for (const match of text.matchAll(BARE_URL)) {
    add(trimBareUrl(match[0]));
  }
  return keys;
};
