import type { RecallSegment } from '@/types/recall';

/** A reference by uuid that needs a lookup to become readable. */
export type UuidRef = { kind: 'block' | 'page'; uuid: string };

export const refKey = (ref: UuidRef) => `${ref.kind}:${ref.uuid}`;

export type ParsedBlock = {
  text: string;
  segments: RecallSegment[];
  task?: { marker: string; done: boolean };
  /** References that `lookup` could not resolve (shown as placeholders). */
  unresolved: UuidRef[];
};

export type ParseOptions = {
  /** Readable text of a uuid reference, undefined when unknown. */
  lookup?: (ref: UuidRef) => string | undefined;
  /** Task marker reported by Logseq (file graphs) or the DB status. */
  marker?: string;
};

export const IMAGE_PLACEHOLDER = '[image]';
export const BLOCK_REF_PLACEHOLDER = '[block]';
export const PAGE_REF_PLACEHOLDER = '[page]';

const MARKERS = [
  'TODO',
  'DOING',
  'DONE',
  'LATER',
  'NOW',
  'WAITING',
  'WAIT',
  'CANCELED',
  'CANCELLED',
  'IN-PROGRESS',
];
const DONE_MARKERS = new Set(['DONE', 'CANCELED', 'CANCELLED']);
const LEADING_MARKER = new RegExp(`^\\s*(${MARKERS.join('|')})(?=\\s|$)\\s*`);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Search hit markers Logseq puts around matches. */
const SEARCH_HIGHLIGHT = /\$pfts_2lqh>\$|\$<pfts_2lqh\$/g;

const stripMarkup = (raw: string) =>
  raw
    .replace(SEARCH_HIGHLIGHT, '')
    .replace(/\r\n?/g, '\n')
    // :LOGBOOK: ... :END: and other drawers
    .replace(/^[ \t]*:[a-z_-]+:[ \t]*\n[\s\S]*?^[ \t]*:end:[ \t]*$/gim, '')
    // property lines (key:: value)
    .replace(/^[ \t]*[\w./-]+::.*$/gm, '')
    .replace(/^[ \t]*(SCHEDULED|DEADLINE):[ \t]*<[^>\n]*>.*$/gim, '')
    // macros: {{renderer ...}}, {{video ...}}, {{embed ...}}, {{query ...}}
    .replace(/\{\{[\s\S]*?\}\}/g, '')
    // code fences (the code itself is kept)
    .replace(/^[ \t]*```.*$/gm, '')
    .replace(/^[ \t]*#{1,6}[ \t]+/gm, '')
    .replace(/^[ \t]*>[ \t]?/gm, '')
    .replace(/\[#[A-C]\]/g, '')
    .replace(/!\[[^\]\n]*\]\([^)\n]*\)(\{[^}\n]*\})?/g, IMAGE_PLACEHOLDER)
    // [label](((uuid))) and [label]([[page]]) and [label](url) -> label
    .replace(/\[([^[\]\n]+)\]\(\(\([^)\n]*\)\)\)/g, '$1')
    .replace(/\[([^[\]\n]+)\]\(\[\[[^\]\n]*\]\]\)/g, '$1')
    .replace(/(^|[^[])\[([^[\]\n]+)\]\([^)\n]*\)/g, '$1$2')
    .replace(/\*\*([^*\n]+)\*\*/g, '$1')
    .replace(/__([^_\n]+)__/g, '$1')
    .replace(/~~([^~\n]+)~~/g, '$1')
    .replace(/\^\^([^^\n]+)\^\^/g, '$1')
    .replace(/==([^=\n]+)==/g, '$1')
    .replace(/(^|[^\w*])\*(?!\s)([^*\n]+?)\*(?!\w)/g, '$1$2')
    .replace(/(^|[^\w])_(?!\s)([^_\n]+?)_(?!\w)/g, '$1$2')
    .replace(/`([^`\n]+)`/g, '$1');

// [[page]], #[[page]], ((block uuid)) and #tag. A #tag starts the text or
// follows whitespace / an opening bracket, so URL fragments are not tags.
const TOKEN =
  /#\[\[([^\]\n]+?)\]\]|\[\[([^\]\n]+?)\]\]|\(\(([0-9a-f-]{36})\)\)|(?<=^|[\s(（])#([^\s#[\](){}<>"'“”‘’,，]+)/giu;
const TRAILING_PUNCTUATION = /[.。!！?？:：;；、]+$/u;

/** Merge text segments, collapse whitespace, drop empties, trim the ends. */
const tidy = (segments: RecallSegment[]): RecallSegment[] => {
  const merged: RecallSegment[] = [];
  for (const segment of segments) {
    const value =
      segment.kind === 'text'
        ? segment.value.replace(/\s+/g, ' ')
        : segment.value.trim();
    if (!value) continue;
    const last = merged[merged.length - 1];
    if (segment.kind === 'text' && last?.kind === 'text') {
      last.value = (last.value + value).replace(/\s+/g, ' ');
    } else {
      merged.push({ kind: segment.kind, value });
    }
  }
  const first = merged[0];
  if (first?.kind === 'text') first.value = first.value.trimStart();
  const last = merged[merged.length - 1];
  if (last?.kind === 'text') last.value = last.value.trimEnd();
  return merged.filter((segment) => segment.value);
};

/**
 * Turn the raw text of a block (file graph `content`, DB graph `fullTitle`)
 * into plain text plus segments for styling: references become the page
 * name / block text, tags stay `#name`, and properties, SCHEDULED/DEADLINE,
 * drawers, macros and markdown markup are removed. Images become `[image]`.
 */
export const parseBlockText = (
  raw: string | undefined | null,
  options: ParseOptions = {},
): ParsedBlock => {
  const unresolved: UuidRef[] = [];
  const resolve = (ref: UuidRef, placeholder: string) => {
    const value = options.lookup?.(ref);
    if (value !== undefined) return value;
    unresolved.push(ref);
    return placeholder;
  };
  const pageName = (name: string) =>
    UUID.test(name.trim())
      ? resolve({ kind: 'page', uuid: name.trim() }, PAGE_REF_PLACEHOLDER)
      : name;

  let text = stripMarkup(raw ?? '');

  let marker = options.marker?.toUpperCase() || undefined;
  const leading = text.match(LEADING_MARKER);
  if (leading) {
    marker = marker ?? leading[1];
    text = text.slice(leading[0].length);
  }

  const segments: RecallSegment[] = [];
  let index = 0;
  for (const match of text.matchAll(TOKEN)) {
    const at = match.index!;
    segments.push({ kind: 'text', value: text.slice(index, at) });
    index = at + match[0].length;
    const [, tagRef, pageRef, blockRef, hashTag] = match;
    if (tagRef !== undefined) {
      segments.push({ kind: 'tag', value: `#${pageName(tagRef)}` });
    } else if (pageRef !== undefined) {
      segments.push({ kind: 'ref', value: pageName(pageRef) });
    } else if (blockRef !== undefined) {
      segments.push({
        kind: 'ref',
        value: resolve({ kind: 'block', uuid: blockRef }, BLOCK_REF_PLACEHOLDER),
      });
    } else {
      const name = hashTag.replace(TRAILING_PUNCTUATION, '');
      if (name) segments.push({ kind: 'tag', value: `#${name}` });
      segments.push({ kind: 'text', value: hashTag.slice(name.length) });
    }
  }
  segments.push({ kind: 'text', value: text.slice(index) });

  const tidied = tidy(segments);
  return {
    text: tidied.map((segment) => segment.value).join(''),
    segments: tidied,
    task: marker
      ? { marker, done: DONE_MARKERS.has(marker) }
      : undefined,
    unresolved,
  };
};

/** Cut `text` to `max` characters, ending with an ellipsis when cut. */
export const truncate = (text: string, max: number) =>
  text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;

/**
 * Cut segments to `max` characters in total, ending with an ellipsis when
 * cut. The joined segments stay equal to the returned text.
 */
export const truncateSegments = (
  segments: RecallSegment[],
  max: number,
): { text: string; segments: RecallSegment[] } => {
  const text = segments.map((s) => s.value).join('');
  if (text.length <= max) return { text, segments };
  const cut: RecallSegment[] = [];
  let room = max - 1;
  for (const segment of segments) {
    if (room <= 0) break;
    const value = segment.value.slice(0, room);
    room -= value.length;
    cut.push({ kind: segment.kind, value });
  }
  const last = cut[cut.length - 1];
  if (last) last.value = last.value.trimEnd();
  if (last && !last.value) cut.pop();
  const end = cut[cut.length - 1];
  if (end?.kind === 'text') {
    end.value += '…';
  } else {
    cut.push({ kind: 'text', value: '…' });
  }
  return { text: cut.map((s) => s.value).join(''), segments: cut };
};
