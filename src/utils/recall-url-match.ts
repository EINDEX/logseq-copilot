/**
 * Which blocks are about *this* page, not only about its path (#59).
 *
 * A recall searches for `host + path` as a substring, so on
 * `youtube.com/watch?v=BBB` every block that mentions any `youtube.com/watch`
 * link matches. The query often is what names the content (`?v=`, `?id=`), so
 * the blocks found for the path are compared with the page's query afterwards.
 *
 * Pure and synchronous. Rule data never becomes a regular expression here:
 * URL forms are templates read by hand (see `parseForm`).
 */

export interface UrlMatchOptions {
  /**
   * Query parameters that identify the content; every other one is ignored.
   * Without it only tracking parameters are ignored.
   */
  keepQueryParams?: string[];
  /**
   * Equivalent shapes of one page's URL, as templates without a scheme:
   * `youtube.com/watch?v={id}`, `youtu.be/{id}`. The first one is canonical.
   */
  urlForms?: string[];
}

/** Query parameters that only say where a visitor came from. */
const TRACKING_PARAM = /^(utm_.*|fbclid|gclid|dclid|msclkid|mc_cid|mc_eid|igshid|_ga)$/i;

const ID_PLACEHOLDER = '{id}';
const ID_CHARS = /^[A-Za-z0-9_-]+$/;

const toUrl = (url: URL | string): URL | undefined => {
  if (url instanceof URL) return url;
  try {
    return new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(url) ? url : `https://${url}`);
  } catch {
    return undefined;
  }
};

/** Host without a leading `www.` / `m.`, lower-case. */
const bareHost = (host: string): string =>
  host.toLowerCase().replace(/^(www|m)\./, '');

const trimSlashes = (path: string): string => path.replace(/\/+$/, '') || '/';

const compareText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

const queryEntries = (
  search: string,
  opts: UrlMatchOptions,
): [string, string][] => {
  const keep = opts.keepQueryParams?.length ? new Set(opts.keepQueryParams) : undefined;
  const entries: [string, string][] = [];
  for (const [key, value] of new URLSearchParams(search)) {
    if (keep ? !keep.has(key) : TRACKING_PARAM.test(key)) continue;
    entries.push([key, value]);
  }
  return entries.sort(([ka, va], [kb, vb]) => compareText(ka, kb) || compareText(va, vb));
};

const canonicalQuery = (entries: [string, string][]): string =>
  entries
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');

/**
 * The query parameters that identify the content of `url`, as one canonical
 * text: sorted by key then value, so the order in the URL does not matter.
 * Repeated keys keep all their values. Empty when nothing identifies it.
 */
export const effectiveQuery = (url: URL | string, opts: UrlMatchOptions = {}): string => {
  const parsed = toUrl(url);
  return parsed ? canonicalQuery(queryEntries(parsed.search, opts)) : '';
};

// ---------------------------------------------------------------------------
// URL forms

interface ParsedForm {
  host: string;
  /** Path segments; `undefined` stands for the id. */
  path: (string | undefined)[];
  /** Query parameters the form fixes: a literal value, or `undefined` for the id. */
  query: [string, string | undefined][];
}

const parseForm = (form: string): ParsedForm | undefined => {
  const at0 = form.indexOf('?');
  const head = at0 < 0 ? form : form.slice(0, at0);
  const queryText = at0 < 0 ? '' : form.slice(at0 + 1);
  const [host, ...segments] = head.split('/');
  if (!host) return undefined;
  const path = segments.filter(Boolean).map((s) => (s === ID_PLACEHOLDER ? undefined : s.toLowerCase()));
  const query: ParsedForm['query'] = [];
  for (const pair of queryText.split('&').filter(Boolean)) {
    const at = pair.indexOf('=');
    const key = at < 0 ? pair : pair.slice(0, at);
    const value = at < 0 ? '' : pair.slice(at + 1);
    query.push([key, value === ID_PLACEHOLDER ? undefined : value]);
  }
  const ids = path.filter((s) => s === undefined).length + query.filter(([, v]) => v === undefined).length;
  return ids === 1 ? { host: bareHost(host), path, query } : undefined;
};

interface FormMatch {
  id: string;
  /** The query parameter that carries the id, when it is not in the path. */
  idParam?: string;
}

const matchParsed = (url: URL, form: ParsedForm): FormMatch | undefined => {
  if (bareHost(url.host) !== form.host) return undefined;
  const segments = url.pathname.split('/').filter(Boolean);
  if (segments.length !== form.path.length) return undefined;
  let match: FormMatch | undefined;
  for (let i = 0; i < segments.length; i++) {
    const expected = form.path[i];
    if (expected === undefined) {
      if (!ID_CHARS.test(segments[i])) return undefined;
      match = { id: segments[i] };
    } else if (segments[i].toLowerCase() !== expected) {
      return undefined;
    }
  }
  for (const [key, expected] of form.query) {
    const value = url.searchParams.get(key);
    if (value === null) return undefined;
    if (expected === undefined) {
      if (!ID_CHARS.test(value)) return undefined;
      match = { id: value, idParam: key };
    } else if (value !== expected) {
      return undefined;
    }
  }
  return match;
};

const matchFormDetail = (
  url: URL | string,
  forms: string[] | undefined,
): FormMatch | undefined => {
  const parsed = toUrl(url);
  if (!parsed || !forms) return undefined;
  for (const form of forms) {
    const template = parseForm(form);
    const match = template && matchParsed(parsed, template);
    if (match) return match;
  }
  return undefined;
};

/** The id of the page when its URL has one of the forms, else undefined. */
export const matchForm = (
  url: URL | string,
  forms: string[] | undefined,
): { id: string } | undefined => {
  const match = matchFormDetail(url, forms);
  return match && { id: match.id };
};

const renderForm = (form: string, id: string): string => form.split(ID_PLACEHOLDER).join(id);

/**
 * Every form of the page's URL, without scheme (`youtube.com/watch?v=ID`,
 * `youtu.be/ID`): extra substrings to search. Empty when no form fits.
 */
export const searchTermsFor = (url: URL | string, forms: string[] | undefined): string[] => {
  const match = matchFormDetail(url, forms);
  if (!match || !forms) return [];
  return [
    ...new Set(
      forms.filter((form) => parseForm(form)).map((form) => renderForm(form, match.id)),
    ),
  ];
};

/**
 * The page's URL in the canonical form (the first one), keeping the other
 * query parameters the options allow (`?p=2` on a video). Undefined when no
 * form fits.
 */
export const canonicalUrl = (url: URL, opts: UrlMatchOptions): URL | undefined => {
  const match = matchFormDetail(url, opts.urlForms);
  const forms = opts.urlForms;
  const first = forms?.[0];
  if (!match || !forms || !first) return undefined;
  const parsed = parseForm(first);
  if (!parsed) return undefined;
  const canonical = new URL(`https://${renderForm(first, match.id)}`);
  // The site as the visitor writes it (`youtube.com`), else `www.`: another
  // host (`youtu.be`) or a mobile one (`m.`) becomes the main site.
  canonical.hostname =
    url.hostname.toLowerCase() === parsed.host ? parsed.host : `www.${parsed.host}`;
  for (const [key, value] of queryEntries(url.search, opts)) {
    if (canonical.searchParams.has(key)) continue;
    canonical.searchParams.append(key, value);
  }
  canonical.hash = url.hash;
  return canonical;
};

// ---------------------------------------------------------------------------
// Blocks

// A URL in prose or markdown: scheme optional, ends at whitespace, brackets,
// quotes, a backslash (`\)` of an escaped link) or non-ASCII text.
const URL_IN_TEXT =
  /(?:https?:\/\/)?(?:[a-z0-9-]+\.)+[a-z]{2,}(?::\d+)?(?:[/?#][^\s<>"'`()[\]\\\u0080-￿]*)?/gi;

/** Punctuation that ends a sentence, not a URL. */
const TRAILING = /[.,;:!?]+$/;

/**
 * Whether the URL that ends at `end` may go on: it stopped at a bracket or a
 * backslash that is part of it (`?q=a(b)`, `/a)b`, `\)`), not at the one that
 * closes a markdown link. What was read of it then says nothing.
 */
const cutShort = (content: string, end: number): boolean => {
  const next = content[end];
  if (next === undefined) return false;
  if ('([\\'.includes(next)) return true;
  if (')]'.includes(next)) {
    const after = content[end + 1];
    return after !== undefined && !/[\s)\].,;:!?'"<>]/.test(after);
  }
  return false;
};

interface UrlInText {
  url: URL;
  /** Read only up to a bracket that may be part of it. */
  cut: boolean;
}

const urlsIn = (content: string): UrlInText[] => {
  const urls: UrlInText[] = [];
  for (const match of content.matchAll(URL_IN_TEXT)) {
    const raw = match[0];
    const parsed = toUrl(raw.replace(TRAILING, ''));
    if (parsed) urls.push({ url: parsed, cut: cutShort(content, match.index + raw.length) });
  }
  return urls;
};

const samePath = (a: URL, b: URL): boolean =>
  bareHost(a.host) === bareHost(b.host) &&
  trimSlashes(a.pathname) === trimSlashes(b.pathname);

/** Query of `url` without the parameter that carries the form's id. */
const extraQuery = (url: URL, opts: UrlMatchOptions, idParam?: string): string =>
  canonicalQuery(queryEntries(url.search, opts).filter(([key]) => key !== idParam));

/**
 * Whether a block found for the page's path is about the page itself.
 *
 * - The block has no URL to this path that can be read, or one that may go
 *   on past a bracket (`?q=a(b)`): kept. It cannot be judged (this also
 *   protects the `%28` / `\)` forms a clip writes).
 * - It has one without a query (a bare path mention) or with the page's
 *   query: kept.
 * - Every URL to this path has another query: dropped.
 * - A page whose own query is empty is not filtered.
 *
 * With URL forms, a block URL is the same page only when it has one of the
 * forms with exactly the same id (`av123` is not `av1234`; `youtu.be/ID`
 * is `youtube.com/watch?v=ID`). Parameters besides the id still compare as
 * above. A page whose URL has no form is compared by its query.
 */
export const blockMatchesPage = (
  blockContent: string | undefined,
  pageUrl: URL,
  opts: UrlMatchOptions = {},
): boolean => {
  if (!blockContent) return true;
  const page = matchFormDetail(pageUrl, opts.urlForms);
  const candidates = urlsIn(blockContent);

  if (page) {
    const sameForm = candidates
      .map(({ url, cut }) => ({ url, cut, match: matchFormDetail(url, opts.urlForms) }))
      .filter((c): c is { url: URL; cut: boolean; match: FormMatch } => c.match !== undefined);
    if (sameForm.length === 0 || sameForm.some((c) => c.cut)) return true;
    const pageExtra = extraQuery(pageUrl, opts, page.idParam);
    return sameForm.some(
      ({ url, match }) =>
        match.id === page.id &&
        (pageExtra === '' ||
          extraQuery(url, opts, match.idParam) === '' ||
          extraQuery(url, opts, match.idParam) === pageExtra),
    );
  }

  const pageQuery = effectiveQuery(pageUrl, opts);
  if (pageQuery === '') return true;
  const samePage = candidates.filter(({ url }) => samePath(url, pageUrl));
  if (samePage.length === 0 || samePage.some(({ cut }) => cut)) return true;
  return samePage.some(({ url }) => {
    const query = effectiveQuery(url, opts);
    return query === '' || query === pageQuery;
  });
};
