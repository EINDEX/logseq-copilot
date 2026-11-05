import React from 'react';
import type { RecallSegment } from '@/types/recall';
import { makeSnippet, type SnippetRange } from '@/utils/snippet';

/**
 * Join highlight ranges that only whitespace separates, so "reverse proxy"
 * reads as one mark instead of two.
 */
export const mergeAdjacent = (text: string, ranges: SnippetRange[]): SnippetRange[] => {
  const merged: SnippetRange[] = [];
  for (const range of ranges) {
    const last = merged[merged.length - 1];
    if (last && /^\s*$/.test(text.slice(last.end, range.start))) {
      last.end = Math.max(last.end, range.end);
    } else {
      merged.push({ ...range });
    }
  }
  return merged;
};

type RecallTextProps = {
  /** Plain text; the segments joined. */
  text: string;
  segments: RecallSegment[];
  terms: string[];
  /** Characters kept around the first match (makeSnippet window). */
  maxLength: number;
  /** Color references with the theme color (hits, not context lines). */
  styleRefs?: boolean;
};

/**
 * Block text cut to a window that shows the first match, with every query
 * term marked (case-insensitive, neighbouring matches joined), references
 * and tags styled by kind. References are plain text here: the whole row is
 * the link.
 */
export const RecallText = ({ text, segments, terms, maxLength, styleRefs = true }: RecallTextProps) => {
  const snippet = makeSnippet(text, terms, maxLength);
  const from = snippet.start;
  const to = from + snippet.text.length;
  const marks = mergeAdjacent(snippet.text, snippet.highlights).map((r) => ({
    start: r.start + from,
    end: r.end + from,
  }));
  // Offsets in `text`; segments that do not add up to the text are ignored.
  const parts = segments.length > 0 && segments.map((s) => s.value).join('') === text
    ? segments
    : [{ kind: 'text' as const, value: text }];

  const out: React.ReactNode[] = [];
  let offset = 0;
  parts.forEach((segment, i) => {
    const segStart = offset;
    const segEnd = offset + segment.value.length;
    offset = segEnd;
    const start = Math.max(segStart, from);
    const end = Math.min(segEnd, to);
    if (start >= end) return;

    const pieces: React.ReactNode[] = [];
    let at = start;
    for (const mark of marks) {
      if (mark.end <= at || mark.start >= end) continue;
      const markStart = Math.max(mark.start, at);
      const markEnd = Math.min(mark.end, end);
      if (markStart > at) pieces.push(text.slice(at, markStart));
      pieces.push(<mark key={markStart}>{text.slice(markStart, markEnd)}</mark>);
      at = markEnd;
    }
    if (at < end) pieces.push(text.slice(at, end));

    const className =
      segment.kind === 'ref' && styleRefs ? 'lc-ref' : segment.kind === 'tag' ? 'lc-tag' : undefined;
    out.push(
      className ? (
        <span key={i} className={className}>
          {pieces}
        </span>
      ) : (
        <React.Fragment key={i}>{pieces}</React.Fragment>
      ),
    );
  });

  return (
    <>
      {snippet.cutBefore && '…'}
      {out}
      {snippet.cutAfter && '…'}
    </>
  );
};
