import { escapeRegExp } from './recall-query';

export type SnippetRange = { start: number; end: number };

export type Snippet = {
  /** The window of the text that is shown. */
  text: string;
  /** Offset of `text` in the full text (to line up segment offsets). */
  start: number;
  /** Matched terms, as offsets into `text`, sorted and not overlapping. */
  highlights: SnippetRange[];
  /** Text was cut before / after the window (show an ellipsis). */
  cutBefore: boolean;
  cutAfter: boolean;
};

// How far to move a cut to land on a space instead of inside a word.
const WORD_SNAP = 12;

/** All matches of every term (each on its own), merged, in text order. */
const findRanges = (text: string, terms: string[]): SnippetRange[] => {
  const found = [...new Set(terms.filter(Boolean))]
    .flatMap((term) =>
      [...text.matchAll(new RegExp(escapeRegExp(term), 'giu'))].map((m) => ({
        start: m.index!,
        end: m.index! + m[0].length,
      })),
    )
    .sort((a, b) => a.start - b.start);
  const ranges: SnippetRange[] = [];
  for (const range of found) {
    const last = ranges[ranges.length - 1];
    if (last && range.start <= last.end) {
      last.end = Math.max(last.end, range.end);
    } else {
      ranges.push({ ...range });
    }
  }
  return ranges;
};

/**
 * A window of at most `maxLen` characters around the first match of any term
 * (case-insensitive, each term matched on its own), with the matches inside
 * the window as highlight ranges. Without a match the window starts at the
 * beginning of the text.
 */
export const makeSnippet = (
  text: string,
  terms: string[],
  maxLen: number,
): Snippet => {
  const ranges = findRanges(text, terms);
  let start = 0;
  let end = text.length;

  if (text.length > maxLen) {
    const first = ranges[0];
    if (first) {
      // Keep some context before the match, about a quarter of the window.
      start = Math.max(0, first.start - Math.floor(maxLen / 4));
      start = Math.min(start, text.length - maxLen);
      if (start > 0) {
        const space = text.indexOf(' ', start);
        if (space !== -1 && space < start + WORD_SNAP && space < first.start) {
          start = space + 1;
        }
      }
    }
    end = Math.min(text.length, start + maxLen);
    if (end < text.length) {
      const space = text.lastIndexOf(' ', end);
      const mustKeep = first ? first.end : start;
      if (space > end - WORD_SNAP && space >= mustKeep) {
        end = space;
      }
    }
  }

  const highlights = ranges
    .filter((r) => r.end > start && r.start < end)
    .map((r) => ({
      start: Math.max(r.start, start) - start,
      end: Math.min(r.end, end) - start,
    }));

  return {
    text: text.slice(start, end),
    start,
    highlights,
    cutBefore: start > 0,
    cutAfter: end < text.length,
  };
};
