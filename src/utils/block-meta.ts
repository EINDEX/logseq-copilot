/**
 * The tags and properties a clip template writes into a block, in Logseq's
 * own syntax: `#Tag` / `#[[Tag]]` in the text, `key:: value` lines after the
 * first line. A file graph reads them from the text. A DB graph reads the tags
 * from the text too (probed on 2.0.2: inline `#Tag` written through the API
 * becomes a real tag, as typed in its editor), but not the property lines, so
 * the DB service sets those (db/properties.ts).
 *
 * Only text of the template counts. `literal` says, per character of the
 * block's text, whether it came from the template ('1') or from a page value
 * or the note ('0'), see `renderClip`. A page value can never be a tag, a
 * property key or a property line; it can be in the value of a property line
 * of the template (`source:: {{url}}`), escaped as it is there.
 */
import { isFenceMark } from './logseq-format';

/** The type a property gets when the graph has none of that title. */
export type PropertyKind = 'date' | 'url' | 'default';

export interface TemplateProperty {
  /** The key as written, `source` of `source:: ...`. */
  key: string;
  /** The value as rendered (page values escaped), trimmed. */
  value: string;
  /** The line of the block's text that holds it. */
  line: number;
  /** The type for a new property: see `kindOf`. */
  kind: PropertyKind;
  /** The value is the clip's date: the title of its journal page. */
  date?: string;
}

export interface BlockMeta {
  tags: string[];
  properties: TemplateProperty[];
}

/** `key:: value`: the key has no white space, `::` is followed by one or the end. */
const PROPERTY_LINE = /^(\S+?)::(?=[ \t]|$)[ \t]*(.*?)[ \t]*$/;

/**
 * Keys Logseq keeps for itself: on a DB graph they are built-in properties
 * (tags, alias, ...), never a property of the user, so their lines stay text.
 */
const RESERVED_KEYS = new Set([
  'id',
  'tags',
  'alias',
  'title',
  'icon',
  'collapsed',
  'heading',
  'public',
  'template',
  'template-including-parent',
  'exclude-from-graph-view',
  'filters',
]);

const URL_VALUE = /^[a-z][a-z0-9+.-]*:\/\/\S+$/i;

export const isUrl = (value: string) => {
  if (!URL_VALUE.test(value)) return false;
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
};

const allLiteral = (literal: string, from: number, to: number) =>
  !literal.slice(from, to).includes('0');

/**
 * The type for a new property: `date` when the value is the clip's date
 * (`{{date}}`, or `[[{{date}}]]`), all of it from the template; `url` for a
 * URL; else `default` (text).
 */
const kindOf = (
  value: string,
  valueLiteral: boolean,
  date: string,
): { kind: PropertyKind; date?: string } => {
  if (valueLiteral && date && (value === date || value === `[[${date}]]`)) {
    return { kind: 'date', date };
  }
  if (isUrl(value)) return { kind: 'url' };
  return { kind: 'default' };
};

/** Tag names in a line: `#name` or `#[[name]]` after a space or the line start. */
const TAG = /(^|\s)#(?:\[\[([^\]\n]+)\]\]|([^\s#,.!?;:"'()[\]{}`]+))/g;

/** The line without code spans (same length, their text blanked). */
const blankCode = (line: string) =>
  line.replace(/(`+)[^`]*?\1/g, (span) => ' '.repeat(span.length));

/**
 * Reads the tags and the property lines of the template from a block's text.
 * `literal` is as long as `content` (missing characters count as page text).
 * `date` is the clip's `{{date}}` as rendered.
 */
export const parseBlockMeta = (
  content: string,
  literal: string,
  date: string,
): BlockMeta => {
  const lit = literal.padEnd(content.length, '0');
  const lines = content.split('\n');
  const starts: number[] = [];
  let offset = 0;
  for (const line of lines) {
    starts.push(offset);
    offset += line.length + 1;
  }

  // Properties: the run of property lines right after the first line, or from
  // the first line when it is one (a block of properties only).
  const properties: TemplateProperty[] = [];
  const propertyLines = new Set<number>();
  if (!isFenceMark(lines[0])) {
    let index = PROPERTY_LINE.test(lines[0]) ? 0 : 1;
    for (; index < lines.length; index++) {
      const match = PROPERTY_LINE.exec(lines[index]);
      if (!match) break;
      propertyLines.add(index);
      const [, key, value] = match;
      const start = starts[index];
      // The key and its `::` are the template's own.
      if (!allLiteral(lit, start, start + key.length + 2)) {
        continue;
      }
      if (value === '' || RESERVED_KEYS.has(key.toLowerCase())) continue;
      const valueFrom = start + lines[index].indexOf(value, key.length + 2);
      properties.push({
        key,
        value,
        line: index,
        ...kindOf(
          value,
          allLiteral(lit, valueFrom, valueFrom + value.length),
          date,
        ),
      });
    }
  }

  // Tags: in the text of the template, not in code or in property lines.
  const tags: string[] = [];
  let fence = false;
  lines.forEach((line, index) => {
    if (isFenceMark(line)) {
      fence = !fence;
      return;
    }
    if (fence || propertyLines.has(index)) return;
    const text = blankCode(line);
    for (const match of text.matchAll(TAG)) {
      const from = starts[index] + match.index! + match[1].length;
      const to = starts[index] + match.index! + match[0].length;
      if (!allLiteral(lit, from, to)) continue;
      const name = (match[2] ?? match[3]).trim();
      if (name && !tags.some((tag) => tag.toLowerCase() === name.toLowerCase())) {
        tags.push(name);
      }
    }
  });

  return { tags, properties };
};

/** The block's text without the lines of `properties` (set as properties). */
export const withoutPropertyLines = (
  content: string,
  properties: Pick<TemplateProperty, 'line'>[],
): string => {
  if (properties.length === 0) return content;
  const drop = new Set(properties.map((property) => property.line));
  return content
    .split('\n')
    .filter((_, index) => !drop.has(index))
    .join('\n');
};
