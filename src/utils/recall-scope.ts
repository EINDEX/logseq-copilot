/**
 * Recall scope: how many URL path segments a recall keeps (a rule's
 * `queryProcessing.scopeDepth`). Never broader than the first segment: the
 * bare host would recall every note that mentions the site.
 */

const segmentsOf = (url: URL) => url.pathname.split('/').filter(Boolean);

/**
 * The prefixes (host + path, no scheme, no trailing slash) to search for a
 * page already processed by its rules, narrowest first: the page itself,
 * then each parent path down to `depth` segments. Without depth (or 0), or
 * when the page is no deeper than it, only the page. Empty for a page with
 * no path, whose only prefix would be the bare host.
 */
export const scopePrefixes = (url: URL, depth?: number): string[] => {
  const segments = segmentsOf(url);
  if (segments.length === 0) return [];
  const keep = depth && depth > 0 ? Math.min(Math.floor(depth), segments.length) : segments.length;
  const prefixes: string[] = [];
  for (let n = segments.length; n >= keep; n--) {
    prefixes.push([url.host, ...segments.slice(0, n)].join('/'));
  }
  return prefixes;
};

/** The broadest prefix a recall reaches, or undefined (see scopePrefixes). */
export const broadestScopePrefix = (
  url: URL,
  depth?: number,
): string | undefined => {
  const prefixes = scopePrefixes(url, depth);
  return prefixes[prefixes.length - 1];
};

// Characters that continue a path segment. Non-ASCII text (CJK written right
// after a link) cannot be part of a URL, so it ends one.
const PATH_CHAR = /[A-Za-z0-9\-_~%$&*+=@]/;
// Punctuation that is part of a path when more of it follows, and ends a URL
// in prose otherwise ("see github.com/foo/bar." vs "github.com/foo/bar.js").
const TRAILING_PUNCTUATION = /[.,;:!]/;

const endsPath = (content: string, index: number): boolean => {
  let i = index;
  const first = content[i];
  if (first === undefined || '/?#'.includes(first)) return true;
  if (!TRAILING_PUNCTUATION.test(first)) return !PATH_CHAR.test(first);
  while (content[i] !== undefined && TRAILING_PUNCTUATION.test(content[i])) i++;
  return content[i] === undefined || !PATH_CHAR.test(content[i]);
};

/**
 * Whether `content` mentions `prefix` as a whole path: Logseq search matches
 * substrings, so `github.com/foo/bar` must not recall `github.com/foo/barbaz`.
 * Case-insensitive.
 */
export const mentionsScope = (
  content: string | undefined,
  prefix: string,
): boolean => {
  if (!content || !prefix) return false;
  const text = content.toLowerCase();
  const needle = prefix.toLowerCase();
  for (
    let at = text.indexOf(needle);
    at !== -1;
    at = text.indexOf(needle, at + 1)
  ) {
    if (endsPath(text, at + needle.length)) return true;
  }
  return false;
};
