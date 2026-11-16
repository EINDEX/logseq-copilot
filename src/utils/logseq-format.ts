import { format } from 'date-fns';
import { Drop, Liquid } from 'liquidjs';
import log from './logger';

export const logseqTimeFormat = (date: Date): string => {
  return format(date, 'HH:mm');
};

/**
 * Logseq renders `preferredDateFormat` (`:journal/page-title-format`) with
 * cljs-time, where `D` is the day of the month and `Y` is the year. date-fns
 * reads them as day-of-year and week-numbering year and throws a RangeError, so
 * rewrite those two tokens to their date-fns equivalents. Single-quoted
 * literals are left alone; every other token means the same in both libraries.
 */
export const toDateFnsPattern = (logseqPattern: string): string =>
  logseqPattern.replace(/'(?:''|[^'])*(?:'|$)|D+|Y+/g, (match) =>
    match.startsWith("'") ? match : match.toLowerCase(),
  );

/**
 * Format a date the way Logseq names the journal page for it. Use it for both
 * the journal page name and the `{{date}}` template variable so they agree.
 */
export const formatLogseqDate = (date: Date, logseqPattern: string): string =>
  format(date, toDateFnsPattern(logseqPattern));

export function logseqEscape(str: string): string {
  return str.replaceAll(/([\[\{\(]{2})/g, '\\$1');
}


export type EscapeContext =
  /** Markdown that turndown made from a page: keeps links, code and fences. */
  | 'block'
  /** Plain text that goes between `[` and `](`, e.g. the page title. */
  | 'linkText'
  /** A URL in `(`...`)` of a Markdown link. */
  | 'linkDest'
  /** A URL that is the whole value of a `key:: value` property line. */
  | 'propertyUrl'
  /** Plain text that is the whole value of a `key:: value` property line. */
  | 'propertyText';

/** Task markers Logseq reads at the start of a block (file graphs). */
const TASK_MARKER =
  /^(?:TODO|DOING|DONE|LATER|NOW|CANCELED|CANCELLED|WAITING|WAIT|IN-PROGRESS)(?= |$)/;
/** `SCHEDULED: <date>` and the like, Logseq reads them anywhere in the text. */
const PLANNING = /^(?:SCHEDULED|DEADLINE|CLOSED|CLOCK):[ \t]*[<[]/;
/** `key:: value` property; the key has no space. */
const PROPERTY = /^\S+?(::)(?=[ \t]|$)/;
/** `:LOGBOOK:`, `:PROPERTIES:`, `:END:`, `:id: abc` drawer lines. */
const DRAWER = /^:[\w-]+:(?=\s|$)/;
/**
 * A line that Logseq counts as a fence mark: three backticks or tildes, any
 * indent, any text after them. A mark opens a fence when none is open, and
 * the next mark closes it, whatever its char, length or indent. A fence that
 * never closes is text.
 */
const FENCE_MARK = /^\s*(?:`{3}|~{3})/;
/**
 * A mark with a plain info string (`js`, `c++`, `c#`) and nothing else. A file
 * graph does not read a mark with a `key::` info string as a mark, a DB graph
 * does, so after a mark that is not plain nobody knows which marks pair up.
 */
const FENCE_PLAIN = /^\s*(?:`{3,}|~{3,})[\w+./-]*#?\s*$/;
/** A plain mark that opens code both graphs render: up to three spaces. */
const FENCE_OPEN = /^ {0,3}(?:`{3,}|~{3,})[\w+./-]*#?\s*$/;
/**
 * A quote (`> a`), a definition (`: a`) or a footnote (`[^1]: a`) takes the
 * lines after it up to the next blank line, a mark among them.
 */
const FENCE_SWALLOWER = /^\s*(?:>|:|\[\^)/;

/** Insert a backslash before the characters at `at`, drop those at `drop`. */
const applyEdits = (line: string, at: Set<number>, drop: Set<number>) => {
  if (!at.size && !drop.size) return line;
  let out = '';
  for (let i = 0; i < line.length; i++) {
    if (drop.has(i)) continue;
    if (at.has(i)) out += '\\';
    out += line[i];
  }
  return out;
};

/** The end of the code span that opens at `start`, or -1 when it has none. */
const codeSpanEnd = (line: string, start: number) => {
  let run = 1;
  while (line[start + run] === '`') run++;
  let i = start + run;
  while (i < line.length) {
    if (line[i] !== '`') {
      i++;
      continue;
    }
    let close = 1;
    while (line[i + close] === '`') close++;
    if (close === run) return i + close;
    i += close;
  }
  return -1;
};

/**
 * The link `[label](dest)` that opens at `start`: where the label ends (the
 * `]`) and where the link ends (after the `)`), or undefined.
 */
const linkAt = (line: string, start: number) => {
  let depth = 0;
  let i = start;
  for (; i < line.length; i++) {
    const ch = line[i];
    if (ch === '\\') i++;
    else if (ch === '`') {
      const end = codeSpanEnd(line, i);
      if (end > 0) i = end - 1;
    } else if (ch === '[') depth++;
    else if (ch === ']' && --depth === 0) break;
  }
  if (i >= line.length || line[i + 1] !== '(') return undefined;
  let parens = 0;
  for (let j = i + 1; j < line.length; j++) {
    const ch = line[j];
    if (ch === '\\') j++;
    else if (ch === '(') parens++;
    else if (ch === ')' && --parens === 0) return { labelEnd: i, end: j + 1 };
  }
  return undefined;
};

/** Characters that end or break a link destination in Logseq's parser. */
const DEST_BREAKERS = /[\s<>`\u0000-\u001f\u007f-\u009f\u2028\u2029]/;

/**
 * Escape the inline syntax in `line[from, to)`; `at` and `drop` collect the
 * edits. `bare`: the line has a literal backslash in front of a bracket.
 */
const scanInline = (
  line: string,
  from: number,
  to: number,
  at: Set<number>,
  drop: Set<number>,
  inLabel: boolean,
  bare: boolean,
) => {
  const run = (ch: string, i: number) => {
    let n = 1;
    while (line[i + n] === ch) n++;
    return n;
  };
  // The second `\[` of an escaped `[[` keeps its backslash in a bare line.
  let keepAt = -1;
  let i = from;
  while (i < to) {
    const ch = line[i];
    if (ch === '\\') {
      // turndown writes `[1]` as `\[1\]`. Logseq reads `\[ ... \]` as a LaTeX
      // formula, so keep the escaped `[` (it also keeps `[a](b)`, `[^1]` and
      // `[:b]` from being a link, a footnote or nothing) and unescape the `]`.
      // In a label `\[x\]` is plain text and `[x \[1]]` would break the link.
      if (!inLabel && line[i + 1] === '[') {
        // `\[\[x\]\]`: the closing pair goes too, else `\]\]` would be read
        // as the end of a formula that the opening pair makes.
        if (line.startsWith('\\[\\[', i)) {
          const close = line.indexOf('\\]\\]', i + 4);
          if (close >= 0 && close + 4 <= to) {
            drop.add(close);
            drop.add(close + 2);
          }
          if (bare) keepAt = i + 2;
        }
        // A literal backslash in the line makes `\\]` read as a formula end
        // after any `\[`, so a bare line has no `\[` at all. Dropping it must
        // not make `[[` (a page link), so it stays after a `[`, and a `[`
        // after it gets a backslash.
        if (bare && i !== keepAt && !(i > from && line[i - 1] === '[')) {
          drop.add(i);
          if (line[i + 2] === '[') at.add(i + 2);
        }
      } else if (!inLabel && line[i + 1] === ']') {
        drop.add(i);
        // Without the `\[` that guards it, `[a](b)` is a link.
        if (bare && line[i + 2] === '(') at.add(i + 2);
      }
      i += 2;
    } else if (ch === ']' && bare && !inLabel && line[i + 1] === '(') {
      // The `[` of this `]` may have lost its `\` above: `[a](b)` is a link.
      at.add(i + 1);
      i++;
    } else if (ch === '`') {
      const end = codeSpanEnd(line, i);
      i = end > 0 && end <= to ? end : i + run('`', i);
    } else if (ch === '[' || ch === '{' || ch === '(') {
      const n = run(ch, i);
      if (n >= 2) {
        for (let k = 0; k < n - 1; k++) at.add(i + k);
        i += n;
      } else if (ch === '[') {
        const link = linkAt(line, i);
        if (link && link.end <= to) {
          // Only a destination that Logseq reads as one piece is left alone.
          if (!DEST_BREAKERS.test(line.slice(link.labelEnd + 2, link.end - 1))) {
            scanInline(line, i + 1, link.labelEnd, at, drop, true, bare);
            i = link.end;
          } else {
            // `[a](x {{y}})` is no link: all of it, the label too, is text.
            at.add(i);
            i++;
          }
        } else i++;
      } else i++;
    } else if (ch === '#') {
      if (i + 1 < to && !/\s/.test(line[i + 1])) at.add(i);
      i++;
    } else if (ch === '<') {
      if (/[A-Za-z/!?]/.test(line[i + 1] ?? '')) at.add(i);
      i++;
    } else if (ch === '@' && line.startsWith('@@', i)) {
      if (/^@@\w+:/.test(line.slice(i, to))) at.add(i);
      i += 2;
    } else {
      if (
        /[SDC]/.test(ch) &&
        (i === 0 || /\s/.test(line[i - 1])) &&
        PLANNING.test(line.slice(i, to))
      ) {
        at.add(i);
      }
      i++;
    }
  }
};

/**
 * Escape one line of a block. `first`: the line can start the block.
 * `lineStart`: nothing is in front of the line, else the rules that need a line
 * start (`- `, `# `, task marker, drawer, property) do not apply to it.
 */
const escapeLine = (
  line: string,
  first: boolean,
  label = false,
  lineStart = true,
) => {
  const at = new Set<number>();
  const drop = new Set<number>();
  const indent = /^[ \t]*/.exec(line)![0].length;
  const rest = line.slice(indent);

  // A label sits behind `[`: it never starts a line, and a backslash before a
  // letter shows in a label.
  if (!label && lineStart) {
    if (/^-(?:[ \t]|$)/.test(rest)) at.add(indent);
    else if (/^#{1,6}[ \t]/.test(rest)) at.add(indent);
    else if (first && TASK_MARKER.test(rest)) at.add(indent);
    else if (DRAWER.test(rest)) at.add(indent);
    const property = PROPERTY.exec(rest);
    if (property) at.add(indent + property[0].length - 1);
  }

  // `\\\[` is a literal backslash and an escaped bracket.
  const bare = !label && /(?<!\\)\\(?:\\\\)+[[\]]/.test(line);
  scanInline(line, 0, line.length, at, drop, label, bare);
  return applyEdits(line, at, drop);
};

/** Whether Logseq counts `line` as a fence mark (see `FENCE_MARK`). */
export const isFenceMark = (line: string) => FENCE_MARK.test(line);

/**
 * The line that closes the fence opened at `lines[open]`: the next mark, in
 * whatever char, length or indent. -1 when none follows: the mark is then text.
 */
export const fenceClose = (lines: readonly string[], open: number) => {
  for (let j = open + 1; j < lines.length; j++) {
    if (FENCE_MARK.test(lines[j])) return j;
  }
  return -1;
};

/**
 * Where the text of `escapeForLogseq` sits on its first line. `false`: at the
 * start of the line (and of the block). `text`: behind other text, so that line
 * is no line start: Logseq reads no fence mark, task marker, `- `, `# ` or
 * `key::` in it. `quote`: behind a quote, definition or footnote mark (`> `),
 * which also takes in the lines after it up to a blank line. `maybe`: behind
 * template output that can be empty (`{{title}} `), so the line may or may not
 * be a line start: no line is code, and the line start rules still apply.
 */
export type MidLine = 'text' | 'quote' | 'maybe';

/** A pair of marks, `lines[open]` to `lines[close]`, as `fenceRegions` reads them. */
export interface FenceRegion {
  open: number;
  close: number;
  /** The lines between the marks are code in both graphs: leave them alone. */
  code: boolean;
}

/**
 * The fences of a block, the one place that pairs marks: the escaper, the
 * content splitter and the outline parser all read fences from here, so a line
 * is never code for one and text for another.
 *
 * Marks pair in order (`fenceClose`). A pair is a region only while every mark
 * before it is plain and none is swallowed (see `FENCE_PLAIN`, `FENCE_SWALLOWER`);
 * after the first pair that is not, nobody knows how the graphs pair the rest,
 * so there are no more regions and no later line is code.
 */
export const fenceRegions = (
  lines: readonly string[],
  /** The text sits behind other text on its first line: that line has no mark. */
  midLine: MidLine | false = false,
): FenceRegion[] => {
  const regions: FenceRegion[] = [];
  // Whether the first line is a line start is open: nobody knows the pairs.
  if (midLine === 'maybe') return regions;
  // Behind a quote (`> Quote: `) the lines after it are swallowed too.
  let swallowed = midLine === 'quote';
  for (let i = midLine ? 1 : 0; i < lines.length; i++) {
    if (FENCE_MARK.test(lines[i])) {
      const close = fenceClose(lines, i);
      if (close > 0) {
        if (
          swallowed ||
          !FENCE_PLAIN.test(lines[i]) ||
          !FENCE_PLAIN.test(lines[close])
        ) {
          break;
        }
        regions.push({ open: i, close, code: FENCE_OPEN.test(lines[i]) });
        i = close;
        swallowed = false;
        continue;
      }
    }
    if (!lines[i].trim()) swallowed = false;
    else if (FENCE_SWALLOWER.test(lines[i])) swallowed = true;
  }
  return regions;
};

const escapeBlock = (text: string, midLine: MidLine | false) => {
  const lines = text.split('\n');
  const regions = fenceRegions(lines, midLine);
  const out: string[] = [];
  // Behind text (`text`, `quote`) the first line is no line start.
  const behind = midLine === 'text' || midLine === 'quote';
  let first = true;
  let region = 0;
  for (let i = 0; i < lines.length; i++) {
    const current = regions[region];
    if (current && i > current.open && i < current.close) {
      // Between two marks: code stays as it is, text is escaped line by line.
      out.push(current.code ? lines[i] : escapeLine(lines[i], first));
    } else {
      out.push(escapeLine(lines[i], first, false, !(behind && i === 0)));
    }
    first = false;
    if (current && i === current.close) region++;
  }
  return out.join('\n');
};

/**
 * A URL for `(url)` of a Markdown link: what Logseq needs to read it as one
 * destination, and nothing more, so `URL.host + URL.pathname` stays in the text.
 */
const encodeLinkDest = (text: string) => {
  const chars = [
    ...text
      .trim()
      .replace(new RegExp(DEST_BREAKERS, 'g'), (c) => encodeURIComponent(c)),
  ];
  // `(` that has no `)` ends the link early, `)` that has no `(` closes it.
  const open: number[] = [];
  chars.forEach((c, i) => {
    if (c === '(') open.push(i);
    else if (c === ')') {
      if (open.length) open.pop();
      else chars[i] = '\\)';
    } else if (c === '\\') chars[i] = '%5C';
  });
  open.forEach((i) => (chars[i] = '%28'));
  return chars.join('');
};

/**
 * A URL as the value of a `key:: value` line. There is no link to close, so a
 * parenthesis or bracket stays (`Foo_(bar)` is the same text as in the link,
 * and recall finds it), and so does `#fragment`: a backslash in front of it
 * would be part of the value. Only what ends the value or starts syntax is
 * encoded: white space, control characters, backtick, `<`, `>`, `{`, `}`, `\`.
 */
const encodePropertyUrl = (text: string) =>
  text
    .trim()
    .replace(new RegExp(`${DEST_BREAKERS.source}|[{}\\\\]`, 'g'), (c) =>
      encodeURIComponent(c),
    );

/**
 * Make text from the web page literal text in Logseq: it must not turn into a
 * tag, page link, block reference, macro, embed, property, task marker,
 * scheduled date, drawer or a new block. Logseq reads a backslash before the
 * special character as plain text and draws no backslash, in file graphs
 * (0.10) and in DB graphs (2.x) alike, so the same escapes serve both.
 *
 * - `block`: Markdown from turndown. Links, images, code spans and fenced code
 *   keep working: link URLs and code are left alone, link labels are escaped.
 *   Backslash escapes that are already there stay as they are.
 * - `linkText`: a plain string for the label of `[label](url)`, e.g. a title.
 *   Use `block` for a title that is not in a label: it can start a block.
 * - `linkDest`: a URL for `(url)` of that link. The URL stays readable and
 *   keeps the text `URL.host + URL.pathname` gives, so recall finds the block
 *   (an unpaired parenthesis of the path is the one change, see below). Use
 *   `block` for a URL that is not in a link.
 * - `propertyUrl`: a URL that is the value of a `key:: value` line. Probed on
 *   0.10.15 (a property) and 2.0.2 (plain text there): `block` writes
 *   `\#frag` and `\[[x]]` into the value, which is no longer the URL, while
 *   the URL as it is makes no tag and no page. So only a character that ends the
 *   value or starts syntax is encoded, and `#`, `&`, `(`, `)`, `[`, `]` stay.
 * - `propertyText`: a title as the value of a `key:: value` line: one line,
 *   escaped like `linkText`.
 *
 * Square brackets: turndown writes `[1]` as `\[1\]`, and both graphs read
 * `\[ ... \]` as a LaTeX formula. Probed on 0.10.15 and 2.0.2 (same result):
 * - `\[1\]`: formula (the bug).
 * - `\[1]`: plain `[1]`, no formula, link, page or tag. Chosen. It also keeps
 *   `[a](b)`, `[^1]`, `[:b]`, `[ ]`, `[x]` inert.
 * - `[1\]`: plain, but `[#A\]` makes a tag.
 * - `[1]`: plain, but `[a](b)` is a link, `[^1]` a footnote, `[:b]` vanishes.
 * - In a link label `[x \[1\]](u)` is plain and `[x \[1]](u)` is no link, so
 *   labels keep turndown's escapes.
 * - A literal backslash before a bracket (`\\\[x\\\]`) with `\[` kept swallows
 *   the brackets, so such a line has bare brackets (`\\[x\\]`) and `(` after `]`
 *   is escaped (`\\[a]\(b)`). A bare bracket must not make `[[` or a link
 *   either. Probed on both graphs, each of these made a page before:
 *   `\\\[[x]]` and `\\\] \[[x]]` (`[[x]]`), `a\\\[b]([[x]])` (a link with a
 *   page link in its URL).
 *   Now the `\[` stays after a `[` and the `[` after it gets a `\`
 *   (`\\] [\[x]]`), and a `]` that the dropped `\[` leaves open gets `\(`.
 *
 * Fenced code: the lines in a fence are left alone, so a fence must be one
 * that Logseq reads as code. Probed on 0.10.15 and 2.0.2 with page links, tags,
 * macros, properties and tasks in the lines (same result unless noted):
 * - Code, as ``` or ~~~ with up to three spaces in front, with an info string
 *   such as `js`, `c++` or `c#`, and as four or more marks. Also after text.
 * - Not code: a fence that never closes (both read its links, tags and macros,
 *   a file graph its properties too); a fence right after a quote (`> a`), a
 *   definition (`: a`) or a footnote (`[^1]: a`) line, with no blank line
 *   between, which the quote takes in; and in a file graph a fence with a
 *   `key::` info string (a DB graph reads it as code).
 * - The close is the first later line that starts with three backticks or
 *   three tildes. Any of the two, any length, any indent (a tab, four spaces),
 *   any text after the mark: `~~~` in a ``` fence, ``` in a ```` fence, `` ```x ``.
 *   The lines after it are text, so they are escaped. CommonMark would close
 *   differently, and turndown writes fences by CommonMark: it picks ```, or
 *   more backticks when a line of the code starts with them, and does not
 *   count `~~~`, a tab or four spaces. The text on the closing line (`` ``` [[x]] ``)
 *   was inert, it is escaped anyway.
 * - So the marks pair up in order: the first with the second, the third with
 *   the fourth. The lines between a pair are left alone only when both marks
 *   are plain (a word as info string, nothing else), the opening mark has at
 *   most three spaces of indent and no quote, definition or footnote line is
 *   open. With any other opening mark (a bad info string, four spaces, a tab,
 *   inside a quote) the two graphs, or one graph and CommonMark, pair the
 *   marks differently (probed with 40 pairs), so from there no line is code:
 *   every later line is escaped. The marks themselves are escaped as lines.
 * - Not closes: two marks, a mark after text (`x```), `> ```` and `~~`.
 * - A fence in a list item or a quote is indented or has `>`: it is not a
 *   fence here, its lines are escaped like any other text.
 * - A `<pre>` without `<code>` is no fence for turndown: it is text.
 *
 * Image alt text: turndown writes `![alt](src)` from the `alt` of the page. It
 * is the label of a link: `]` ends it, `](y)` then makes a second image or
 * link, and a new line can start a block. No page, tag, property or marker
 * was made on either graph, but the label broke out. So it is written like
 * `linkText`: one line, and every bracket and backslash escaped. The title of
 * an image or a link is not written.
 *
 * Text behind other text on its line (`midLine`, `> {{content}}`,
 * `Quote: {{content}}`): its first line is not a line start. A fence mark there
 * is no mark in Logseq, so the lines after it are text, not code (they were
 * left raw, as `[[p]]`, `#tag`, `{{embed}}` and `key:: v`, which went live), and
 * the first line has no task marker, bullet, heading, drawer or property.
 * Probed on 0.10.15 and 2.0.2 (same result): `Quote: ```js` then `[[p]]`
 * made a page, a tag, a ref and (file graph) a property; behind `> ` the same
 * text was inert, the lines of the quote are text. Behind a quote the marks
 * that follow in the same quote do not pair up, see `FENCE_SWALLOWER`.
 *
 * Text with none of these characters comes back unchanged.
 */
export function escapeForLogseq(
  text: string,
  {
    context,
    midLine = false,
  }: {
    context: EscapeContext;
    /**
     * Block context: the text goes behind other text of the template on its
     * first line (`- Note: {{content}}`), so a fence mark on that line is no
     * mark. `quote`: the template's text makes a quote, a definition or a
     * footnote of the line, which takes the lines after it. `maybe`: the text
     * before it can be empty. See `MidLine`.
     */
    midLine?: MidLine | false;
  },
): string {
  if (!text) return text;
  if (context === 'block') return escapeBlock(text, midLine);

  if (context === 'linkDest') return encodeLinkDest(text);
  if (context === 'propertyUrl') return encodePropertyUrl(text);

  // linkText and propertyText: a plain string, so every backslash is its own.
  const escaped = text
    .replace(/\s*[\r\n]+\s*/g, ' ')
    .replace(/[\\[\]`]/g, '\\$&');
  return escapeLine(escaped, true, true);
}

// ---- rendering a template with page values -----------------------------------

/** The page values of a template: untrusted, never part of its source. */
export type PageValueKind = 'content' | 'title' | 'url';

const VALUE_KINDS: PageValueKind[] = ['content', 'title', 'url'];
/** Pair 4 (marks 7 and 8) wraps text that lost its own marks: always strict. */
const STRICT_PAIR = 4;
/**
 * Pair 5 (marks 9 and 10) wraps template output that is not page text (`date`,
 * `time`, a `date` filter): written as it is, but it counts as an output of the
 * template that can be empty when `{{content}}` follows it on its line.
 */
const PLAIN_PAIR = 5;

/**
 * One output of a page value in the rendered text, and what stands around it
 * on its output line. Where a value goes is read from the rendered text, never
 * from the template source: whitespace control (`{{-`), `{% assign %}`,
 * `{% capture %}`, filters and `{% if %}` all move text around.
 */
export interface ValueSite {
  kind: PageValueKind;
  /** The value after the filters of the template, not escaped. */
  raw: string;
  /**
   * The marks around the value did not survive the filters of the template
   * (cut off, nested in another value, or text a filter made from it): its
   * place is not known, so it is written with the strictest escapes.
   */
  strict: boolean;
  /** The text of the output line in front of the value, other values left out. */
  literal: string;
  /** Another value is in front of this one on its line. */
  hasValue: boolean;
  /** White space in front of the value may be what an empty value left. */
  maybeEmpty: boolean;
  /** The line in front of the value, other values as `\uFFFC`. */
  linePrefix: string;
  /** Template text right in front of and right behind the value. */
  before: string;
  after: string;
  /** The rest of the output line behind the value, other values as `\uFFFC`. */
  lineAfter: string;
}

export const engine = new Liquid();

interface Marks {
  nonce: string;
  /** Any mark. */
  any: RegExp;
  /** A text that is one value: opening mark, text, closing mark. */
  whole: RegExp;
  open: (pair: number) => string;
  close: (pair: number) => string;
}

/** The marks of the render in progress, for the filters below. */
let activeMarks: Marks | undefined;

/** The texts of the page values: no property of the value holds them. */
const pageValueTexts = new WeakMap<object, { marked: string; text: string }>();

/**
 * A page value as the template sees it: it prints and filters as the marked
 * text, `size` is the length of the page text, and nothing else of it can be
 * read, so the template cannot take the text apart character by character.
 */
class PageValue extends Drop {
  constructor(marked: string, text: string) {
    super();
    pageValueTexts.set(this, { marked, text });
  }
  valueOf() {
    return pageValueTexts.get(this)!.marked;
  }
  get size() {
    return pageValueTexts.get(this)!.text.length;
  }
  /** Any other property (`content.text`, `content.marked`) is nothing. */
  liquidMethodMissing() {
    return undefined;
  }
}

const unwrap = (value: unknown) =>
  value instanceof PageValue ? value.valueOf() : value;

const hasMarks = (value: unknown, marks: Marks): boolean => {
  value = unwrap(value);
  if (typeof value === 'string') return value.includes(`~${marks.nonce}.`);
  if (Array.isArray(value)) return value.some((item) => hasMarks(item, marks));
  return false;
};

/** Every mark of `text` has its partner, in order. */
const isBalanced = (text: string, marks: Marks) => {
  const stack: number[] = [];
  let seen = false;
  for (const m of text.matchAll(marks.any)) {
    seen = true;
    const n = Number(m[1]);
    if (n % 2 === 1) stack.push((n + 1) / 2);
    else if (stack.pop() !== n / 2) return false;
  }
  return seen && stack.length === 0;
};

const plainWrap = (text: string, marks: Marks) =>
  marks.open(PLAIN_PAIR) + text + marks.close(PLAIN_PAIR);

const strictWrap = (text: string, marks: Marks) =>
  marks.open(STRICT_PAIR) + text.replace(marks.any, '') + marks.close(STRICT_PAIR);

/**
 * What a filter made from a value that had marks. Text keeps its marks when
 * they still pair up; anything else (cut off, made by `split`, `slice`,
 * `base64_encode`, ...) is the page text under another shape, so it is wrapped
 * as strict. Arrays are wrapped per element: a later `join`, `first` or
 * `for` loop gets elements that are marked.
 */
const secure = (result: unknown, marks: Marks): unknown => {
  if (typeof result === 'string') {
    return isBalanced(result, marks) ? result : strictWrap(result, marks);
  }
  if (Array.isArray(result)) {
    return result.map((item) =>
      typeof item === 'string' ? strictWrap(item, marks) : secure(item, marks),
    );
  }
  return result;
};

/**
 * Filters that work on the text of a value, run on the text inside the marks:
 * `upcase`, `strip`, `truncate: 20` and `capitalize` do what they do on the
 * page text itself.
 */
const TEXT_FILTERS = new Set([
  'upcase',
  'downcase',
  'capitalize',
  'strip',
  'lstrip',
  'rstrip',
  'squish',
  'normalize_whitespace',
  'strip_newlines',
  'truncate',
  'truncatewords',
  'slice',
  'size',
]);

// Every filter of the engine is wrapped: a filter that gets a value with marks
// must give the marks back or give strict text, never plain page text.
for (const [name, original] of Object.entries(
  engine.filters as Record<string, any>,
)) {
  if (typeof original !== 'function') continue;
  engine.registerFilter(name, function (this: unknown, input: unknown, ...rest: unknown[]) {
    const value = unwrap(input);
    const args = rest.map(unwrap);
    const marks = activeMarks;
    if (marks && value instanceof Date) {
      const result = original.call(this, value, ...args);
      return typeof result === 'string' ? plainWrap(result, marks) : result;
    }
    if (!marks || ![value, ...args].some((v) => hasMarks(v, marks))) {
      return original.call(this, value, ...args);
    }
    if (TEXT_FILTERS.has(name) && typeof value === 'string') {
      const whole = marks.whole.exec(value);
      if (whole && !hasMarks(whole[2], marks)) {
        const result = original.call(this, whole[2], ...args);
        return typeof result === 'string'
          ? whole[1] + result + whole[3]
          : result;
      }
    }
    return secure(original.call(this, value, ...args), marks);
  });
}

const randomDigits = (length: number) => {
  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b % 10).join('');
};

interface Region {
  kind: PageValueKind | 'plain';
  start: number;
  end: number;
  raw: string;
  strict: boolean;
}

/** The regions between a mark that opens a value and the mark that closes it. */
const findRegions = (out: string, marks: Marks): Region[] => {
  const mark = new RegExp(marks.any.source, 'g');
  // Marks that a filter cut in two: the head of one at the end of the text.
  const full = `~${marks.nonce}.10~`;
  const strip = (text: string) => {
    const clean = text.replace(marks.any, '');
    for (let k = Math.min(clean.length, full.length - 1); k >= 6; k--) {
      if (full.startsWith(clean.slice(-k))) return clean.slice(0, -k);
    }
    return clean;
  };
  const regions: Region[] = [];
  const stack: {
    pair: number;
    start: number;
    inner: number;
    strict: boolean;
  }[] = [];
  const kindOf = (pair: number): PageValueKind | 'plain' =>
    pair === PLAIN_PAIR ? 'plain' : (VALUE_KINDS[pair - 1] ?? 'content');
  // Where the last region ended: an orphan closing mark takes everything from
  // there, since its value lost its opening mark.
  let boundary = 0;
  for (let m = mark.exec(out); m; m = mark.exec(out)) {
    const n = Number(m[1]);
    const pair = Math.ceil(n / 2);
    const end = m.index + m[0].length;
    if (n % 2 === 1) {
      // Another value inside this one: the outer value is not what it was.
      stack.forEach((entry) => (entry.strict = true));
      stack.push({ pair, start: m.index, inner: end, strict: false });
      continue;
    }
    const index = stack.map((entry) => entry.pair).lastIndexOf(pair);
    if (index < 0) {
      if (stack.length) stack.forEach((entry) => (entry.strict = true));
      else {
        regions.push({
          kind: kindOf(pair),
          start: boundary,
          end,
          raw: strip(out.slice(boundary, m.index)),
          strict: true,
        });
        boundary = end;
      }
      continue;
    }
    const entry = stack[index];
    const strict =
      entry.strict || index < stack.length - 1 || entry.pair === STRICT_PAIR;
    stack.length = index;
    if (stack.length) {
      stack.forEach((outer) => (outer.strict = true));
    } else {
      regions.push({
        kind: kindOf(entry.pair),
        start: entry.start,
        end,
        raw: strip(out.slice(entry.inner, m.index)),
        strict,
      });
      boundary = end;
    }
  }
  if (stack.length) {
    // A value that nothing closed: it runs to the end of the text.
    const entry = stack[0];
    regions.push({
      kind: kindOf(entry.pair),
      start: entry.start,
      end: out.length,
      raw: strip(out.slice(entry.inner)),
      strict: true,
    });
  }
  // Values that touch are one text: `{% for %}{{ content | slice: i, 1 }}{% endfor %}`
  // puts the page text back together, and `[` next to `[` must be seen as `[[`.
  const merged: Region[] = [];
  for (const region of regions) {
    const last = merged[merged.length - 1];
    if (
      last &&
      last.end === region.start &&
      last.kind !== 'plain' &&
      region.kind !== 'plain'
    ) {
      last.strict = last.strict || region.strict || last.kind !== region.kind;
      last.raw += region.raw;
      last.end = region.end;
      if (last.kind !== region.kind) last.kind = 'content';
    } else merged.push({ ...region });
  }
  return merged;
};

/**
 * Renders `template` with the page values in place, and writes each one by
 * `write`, which is told where it ended up (`ValueSite`).
 *
 * Every value is wrapped in marks made of random digits (new for each render,
 * checked not to be in the template or the values) while the template renders.
 * Filters then run on the real text, and the marks tell where each output of a
 * value is, whatever the template did with it. The text in front of the value
 * on its output line decides the context, and `write` makes the value literal
 * text for that context. This is the last step: nothing of the template runs
 * on a value after it is escaped. A value that is printed twice is written
 * twice, each for its own place.
 *
 * It fails closed. A filter that gets a value with marks gives marks back or
 * strict text (`secure`). When a mark is found outside a value, or text of the
 * page shows up outside the values, the template renders again with every
 * value in the strict marks and each output of it is escaped with the
 * strictest escapes, after the filters, as always. When the marks are lost on
 * that pass too, the template renders with empty page values: no content is
 * better than content that is not escaped.
 *
 * A falsy value (`undefined`, `''`) is passed as it is, so `{% if title %}` and
 * `default` still see it as empty.
 */
export function renderWithPageValues(
  template: string,
  context: Record<string, unknown>,
  values: Partial<Record<PageValueKind, string>>,
  write: (site: ValueSite) => string,
): string {
  const pageValues = Object.values(values).filter((v): v is string => !!v);
  // A template that prints a page value that is empty (a page without a title)
  // can leave white space in front of `{{content}}`.
  const maybeEmpty = VALUE_KINDS.some(
    (kind) => !values[kind] && new RegExp(`\\b${kind}\\b`).test(template),
  );

  /**
   * One render. `strict`: every value is wrapped in the strict pair, so each
   * output of it is written with the strictest escapes, whatever the template
   * did with it.
   */
  const pass = (strict: boolean) => {
    let nonce = randomDigits(24);
    while (
      template.includes(nonce) ||
      pageValues.some((v) => v.includes(nonce))
    ) {
      nonce = randomDigits(24);
    }
    const marks: Marks = {
      nonce,
      any: new RegExp(`~${nonce}\\.(\\d{1,2})~`, 'g'),
      whole: new RegExp(
        `^(~${nonce}\\.(?:[1357]|9)~)([\\s\\S]*)(~${nonce}\\.(?:[2468]|10)~)$`,
      ),
      open: (n) => `~${nonce}.${n * 2 - 1}~`,
      close: (n) => `~${nonce}.${n * 2}~`,
    };
    const variables: Record<string, unknown> = { ...context };
    for (const name of ['date', 'time']) {
      if (typeof context[name] === 'string') {
        variables[name] = plainWrap(context[name] as string, marks);
      }
    }
    VALUE_KINDS.forEach((kind, index) => {
      const value = values[kind];
      const n = strict ? STRICT_PAIR : index + 1;
      variables[kind] = value
        ? new PageValue(marks.open(n) + value + marks.close(n), value)
        : value;
    });

    const previous = activeMarks;
    activeMarks = marks;
    let out: string;
    try {
      out = engine.parseAndRenderSync(template, variables);
    } finally {
      activeMarks = previous;
    }

    const regions = findRegions(out, marks);
    const outside: string[] = [];
    let at = 0;
    for (const region of regions) {
      outside.push(out.slice(at, region.start));
      at = region.end;
    }
    outside.push(out.slice(at));

    // A mark that is left outside a value: a filter cut it.
    let ok = !outside.some((text) => text.includes(nonce.slice(0, 8)));
    // Page text outside the values: a piece of a value (eight characters, or
    // all of a shorter one of three or more) that the text of the template does
    // not have. The marks were lost without a trace.
    for (const value of ok ? pageValues : []) {
      if (value.length < 3) continue;
      const width = Math.min(8, value.length);
      for (const text of outside) {
        for (let i = 0; ok && i + width <= text.length; i++) {
          const piece = text.slice(i, i + width);
          if (value.includes(piece) && !template.includes(piece)) ok = false;
        }
      }
    }
    return { regions, outside, ok };
  };

  // A filter can fail on text that has marks in it (`base64_decode` of
  // `base64_encode`): try again the strict way, then without the page values.
  const withoutValues = () =>
    engine.parseAndRenderSync(template, {
      ...context,
      content: '',
      title: '',
      url: '',
    }) as string;
  let strict = false;
  let done: ReturnType<typeof pass>;
  try {
    done = pass(false);
  } catch (error) {
    log.warn('the template failed with the page values marked', error);
    try {
      strict = true;
      done = pass(true);
    } catch {
      log.warn(
        'the template renders without the page values',
      );
      return withoutValues();
    }
  }
  if (!done.ok) {
    // Escape last, always: the template renders again with each value in the
    // strict marks and every output of a value is escaped after the filters.
    log.warn(
      'a template filter took the marks off a page value; writing it with the strictest escapes',
    );
    strict = true;
    done = pass(true);
    if (!done.ok) {
      log.warn(
        'the marks of the page values were lost again; the template renders without them',
      );
      return withoutValues();
    }
  }

  const { regions, outside } = done;
  const lineAfterOf = (index: number) => {
    let text = '';
    for (let j = index + 1; j < outside.length; j++) {
      const newline = outside[j].indexOf('\n');
      if (newline >= 0) return text + outside[j].slice(0, newline);
      text += outside[j];
      if (j < regions.length) text += '\uFFFC';
    }
    return text;
  };
  let result = '';
  let linePrefix = '';
  regions.forEach((region, index) => {
    const before = outside[index];
    result += before;
    const newline = before.lastIndexOf('\n');
    linePrefix = newline >= 0 ? before.slice(newline + 1) : linePrefix + before;
    if (region.kind === 'plain' && !region.strict) {
      result += region.raw;
      linePrefix += '￼';
      return;
    }
    result += write({
      kind: region.kind === 'plain' ? 'content' : region.kind,
      raw: region.raw,
      strict: region.strict || strict,
      linePrefix,
      literal: linePrefix.replace(/￼/g, ''),
      hasValue: linePrefix.includes('￼'),
      maybeEmpty,
      before,
      after: outside[index + 1],
      lineAfter: lineAfterOf(index),
    });
    linePrefix += '￼';
  });
  return result + outside[outside.length - 1];
}

/**
 * The `MidLine` of page text from what its output line has in front of it:
 * nothing (a line start), a value or white space that may be nothing, text, or
 * a quote mark.
 */
export const midLineAt = (
  site: ValueSite,
  /** A tree template: the `- ` that starts the block is not text in front. */
  bullet = false,
): MidLine | false => {
  if (site.strict) return 'maybe';
  const prefix = bullet
    ? site.linePrefix.replace(/^[ \t]*(?:- +)?/, '')
    : site.linePrefix;
  const literal = prefix.replace(/\uFFFC/g, '');
  if (literal.trim() === '') {
    // `{{title}} ` is a line start only if the title is empty.
    return prefix.includes('\uFFFC') || (literal !== '' && site.maybeEmpty)
      ? 'maybe'
      : false;
  }
  return /^\s*(?:>|:|\[\^)/.test(literal) ? 'quote' : 'text';
};

/** `key:: ` or `- key:: `, then the value. */
const PROPERTY_VALUE_BEFORE = /^[ \t]*(?:-[ \t]+)?[^\s{%]\S*?::[ \t]+$/;
/** `[{{title}}](`: the whole label of a link. */
const LINK_LABEL_BEFORE = /(?<![\\[])\[\s*$/;
/** `[label](`, then the destination. */
const LINK_DEST_BEFORE = /(?<![\\[])\[(?:[^[\]\\]|\\[\s\S])*\]\(\s*$/;

/**
 * Where a value ends up decides how it is escaped: page text by the text in
 * front of it, the title as a link label and the URL as a link destination
 * only where the rendered text has exactly that, everything else as text with
 * the strictest escapes for a block.
 */
export const escapeValueSite = (site: ValueSite): string => {
  if (site.kind === 'content') {
    return escapeForLogseq(site.raw, {
      context: 'block',
      midLine: midLineAt(site),
    });
  }
  if (!site.strict) {
    // `key:: {{url}}`: the whole value of a property line.
    if (
      !site.hasValue &&
      PROPERTY_VALUE_BEFORE.test(site.linePrefix) &&
      site.lineAfter.trim() === ''
    ) {
      return escapeForLogseq(site.raw, {
        context: site.kind === 'url' ? 'propertyUrl' : 'propertyText',
      });
    }
    if (
      site.kind === 'title' &&
      LINK_LABEL_BEFORE.test(site.linePrefix) &&
      /^\s*\]\(/.test(site.after)
    ) {
      return escapeForLogseq(site.raw, { context: 'linkText' });
    }
    if (
      site.kind === 'url' &&
      LINK_DEST_BEFORE.test(site.linePrefix) &&
      /^\s*\)/.test(site.after)
    ) {
      return escapeForLogseq(site.raw, { context: 'linkDest' });
    }
  }
  return escapeForLogseq(site.raw, { context: 'block', midLine: 'maybe' });
};
