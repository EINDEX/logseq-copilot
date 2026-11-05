/**
 * Query handling for recall (the search engine result page card): turn the
 * text typed into a search engine into the terms Logseq is searched with,
 * and tell which of those terms a piece of text contains.
 */

// Common English function words and search filler. They carry no topic, and
// Logseq's search (all terms must match) finds nothing when they are kept.
const STOP_WORDS = new Set(
  `a about above after again against all am an and any are as at be because
  been before being below between both but by can cannot could did do does
  doing down during each few for from further had has have having he her here
  hers herself him himself his how i if in into is it its itself just me more
  most my myself no nor not now of off on once only or other ought our ours
  ourselves out over own same she should so some such than that the their
  theirs them themselves then there these they this those through to too under
  until up very was we were what when where which while who whom why will with
  would you your yours yourself yourselves vs versus via get got use using used
  best way ways
  don doesn didn isn aren wasn weren won wouldn couldn shouldn hasn haven hadn`
    .split(/\s+/)
    .filter(Boolean),
);

const CJK_RUN =
  /([\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]+)/u;
const CJK_ONLY =
  /^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]+$/u;
// Characters that split a non-CJK chunk into words. `+`, `#`, `.`, `-` and
// `_` stay inside words (c++, c#, node.js, e-mail, snake_case).
const WORD_SEPARATOR = /[^\p{L}\p{N}\p{M}+#._-]+/u;
const ENGLISH_WORD = /^[a-z0-9]+$/;

/** Max number of single-term searches after an empty primary search. */
export const MAX_FALLBACK_SEARCHES = 2;

export type NormalizedQuery = {
  /** Text for the first Logseq search: the terms joined by spaces. */
  primary: string;
  /** Lower-cased (non-CJK) terms; a run of CJK characters is one term. */
  terms: string[];
  /**
   * Single terms to search, longest first, when `primary` finds nothing
   * useful. Empty when there is only one term.
   */
  fallbacks: string[];
};

const tokenize = (query: string): string[] =>
  query
    .split(/\s+/)
    .flatMap((chunk) => chunk.split(CJK_RUN))
    .flatMap((part) =>
      CJK_ONLY.test(part) ? [part] : part.toLowerCase().split(WORD_SEPARATOR),
    )
    .map((token) => token.replace(/^[._-]+|[._-]+$/g, ''))
    .filter(Boolean);

const isNoise = (token: string) =>
  !CJK_ONLY.test(token) &&
  (STOP_WORDS.has(token) || (ENGLISH_WORD.test(token) && token.length <= 2));

/**
 * Split a search engine query into search terms. English stop words and
 * English words of two characters or less are dropped; CJK text is kept as
 * typed. When every word is dropped (e.g. "to be or not"), all words are
 * kept so there is still something to search.
 */
export const normalizeQuery = (query: string): NormalizedQuery => {
  const tokens = [...new Set(tokenize(query))];
  const kept = tokens.filter((token) => !isNoise(token));
  const terms = kept.length > 0 ? kept : tokens;
  const fallbacks =
    terms.length > 1
      ? [...terms]
          .sort((a, b) => b.length - a.length)
          .slice(0, MAX_FALLBACK_SEARCHES)
      : [];
  return { primary: terms.join(' '), terms, fallbacks };
};

export const escapeRegExp = (text: string) =>
  text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The terms that occur in `text` (case-insensitive substring match). */
export const findMatchedTerms = (text: string, terms: string[]): string[] =>
  terms.filter((term) => new RegExp(escapeRegExp(term), 'iu').test(text));
