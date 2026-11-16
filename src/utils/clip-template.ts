/**
 * Renders a clip template into the blocks to write to Logseq.
 *
 * Two kinds of template:
 *
 * - flat: renders to one block, as every template did before outline
 *   templates. `renderFlatClip`.
 * - tree: the first line that is not blank (or only Liquid tags) starts with
 *   `- `. The template is Logseq's own outline markdown: `- ` bullets, two
 *   spaces of indentation per level (a tab counts as two), and a line without
 *   a bullet continues the block above it. `renderClip` returns the block tree.
 *
 * One root per clip: a clip writes exactly one top-level block, everything else
 * goes under it, so `renderClip` returns at most one root. A template should
 * have one top-level bullet (the editor allows no more). When the rendered text
 * still has several roots (Liquid output, an old template), the first root is
 * the parent and the others are its children, after its own, in order; when the
 * first root is empty (`- {{content}}` without a selection) its first child
 * becomes the root and the remaining children go under it (`singleRoot`).
 *
 * `{{note}}` is the text the user typed before saving. It is their own text:
 * `[[links]]`, `#tags` and refs stay live. Only what would change the clip's
 * block tree is neutralised (`neutraliseNote`). With no note, a line that has
 * only `{{note}}` is dropped, and in a tree template so is a bullet that has
 * only `{{note}}`, with its subtree (`dropEmptyNote`). A bullet that has only
 * `{{note}}` is the note block of the clip (`ClipBlock.note`). A template
 * without `{{note}}` gets a non-empty note as the last child of the clip's root.
 *
 * This module must not import turndown: the options page uses it for the
 * template preview.
 *
 * Where `{{content}}` goes in a tree template, whatever filters follow it
 * (see `placeContentTags`):
 *
 * a. First thing after a bullet below the top level, nothing after it on the
 *    line (`  - {{content}}`): the content is split at that level. Every paragraph
 *    and every list item becomes its own block, nested list items child blocks.
 *    `*`, `-` and `+` markers are dropped; `1.` markers of ordered lists stay as
 *    text. A fenced code block, a table, or a run of `>` quote lines stays whole
 *    in one block. Blank lines separate paragraphs, except inside a fence.
 * b. Anywhere else (`  - Quote: {{content}}`, a top-level `- {{content}}`, or a
 *    line without a bullet): the content stays in that one block. Its lines are indented to the block's
 *    continuation column, and a line starting with `- ` is escaped so it does not
 *    become a bullet.
 * c. Empty content (a page clip without a selection) leaves `- {{content}}`
 *    an empty bullet, and empty bullets are skipped, their children moving up a
 *    level.
 *
 * Text from the page is escaped on every path (`escapeForLogseq`), so it is
 * literal text in Logseq and not a tag, task marker, property or new block:
 * the title and URL as a link label or target when the template has them in
 * `[{{title}}]({{url}})`, else as block text. Template text, `{{date}}`,
 * `{{time}}` and `{{dt}}` are never escaped. A flat template escapes the whole
 * content. A tree template escapes it where it places it: for rule a after the
 * split, each block on its own, since each is the start of a block and the
 * escapes for a block start (`TODO`, `- `, `# `, `key::`) belong to its first
 * line; for rule b the content as a whole, as in a flat template.
 */
import {
  escapeForLogseq,
  escapeValueSite,
  fenceClose,
  fenceRegions,
  formatLogseqDate,
  isFenceMark,
  logseqTimeFormat,
  midLineAt,
  engine,
  renderWithPageValues,
  type MidLine,
  type ValueSite,
} from './logseq-format';

export interface ClipBlock {
  content: string;
  children: ClipBlock[];
  /** This block holds the note of the clip, and nothing else (see `{{note}}`). */
  note?: true;
}

export interface ClipVars {
  url?: string;
  title?: string;
  data: string;
  preferredDateFormat: string;
  time: Date;
  /** What the user typed before saving: their own text, see `{{note}}`. */
  note?: string;
}

const stripLiquidTags = (text: string) => text.replace(/\{%[\s\S]*?%\}/g, '');

// ---- {{note}} ---------------------------------------------------------------

/** The template variable that holds the note before it is placed. */
const NOTE_RAW = '__clip_raw_note';
/** Marks the note on a bullet of its own through rendering (a private-use char). */
const NOTE_MARK = '\uE000';

/** The note as typed: line breaks as `\n`, trimmed, `NOTE_MARK` removed. */
const cleanNote = (note: string | undefined): string =>
  (note ?? '').replace(/\r\n?/g, '\n').replaceAll(NOTE_MARK, '').trim();

/** A list marker at the start of a line: `- `, `* `, `+ `, or the marker alone. */
const NOTE_BULLET = /^([ \t]*)([-*+])(?=[ \t]|$)/;

/**
 * The note as text inside a block. The user's own Logseq syntax stays live
 * (`[[links]]`, `#tags`, `((refs))`, `key:: value`, a task marker): what is
 * neutralised is what would change the tree of blocks the clip writes.
 *
 * - A line that starts with `- `, `* ` or `+ ` (or is only the marker): Logseq
 *   reads it as a new block. A backslash in front of the marker makes it text.
 *   Not inside a code block the note closes itself: there the backslash would
 *   show, and the line is code.
 * - A fence mark that has no mate in the note: it would pair with the next mark
 *   of the template (or hide it) and turn the template's lines into code, or
 *   its code into text. The odd mark, the last one, gets a backslash. A mark
 *   with a mate stays: the fence is the note's own.
 *
 * Lines after the first are indented by `column`, where the block's lines
 * continue. Blank lines are kept without indent.
 */
export const neutraliseNote = (note: string, column = 0): string => {
  const lines = cleanNote(note).split('\n');
  const marks = lines.flatMap((line, index) =>
    isFenceMark(line) ? [index] : [],
  );
  if (marks.length % 2 === 1) {
    const last = marks[marks.length - 1];
    lines[last] = lines[last].replace(/^(\s*)([`~])/, '$1\\$2');
  }
  // Escaped inside a closed fence too: a file graph splits a block at a raw
  // `- ` line there (probed), so the code shows a backslash instead.
  const pad = ' '.repeat(column);
  return lines
    .map((line, index) => {
      const text = line.replace(NOTE_BULLET, '$1\\$2');
      return index === 0 || text.trim() === '' ? text : pad + text;
    })
    .join('\n');
};

/** `{{note}}` in an output tag, or a tag that reads `note`. */
const NOTE_USED = /\{\{-?\s*note\b|\{%[^%]*\bnote\b[^%]*%\}/;

/** The template has `{{note}}` (or reads `note` in a tag). */
export const usesNote = (template: string): boolean => NOTE_USED.test(template);

const NOTE_LINE = /^[ \t]*\{\{-?\s*note\s*-?\}\}[ \t]*$/;
const NOTE_BULLET_LINE = /^([ \t]*)- +\{\{-?\s*note\s*-?\}\}[ \t]*$/;

/**
 * The template for an empty note: a line that has only `{{note}}` is gone, no
 * blank line left, and in a tree template a bullet that has only `{{note}}` is
 * gone with its subtree (the lines below it that are indented deeper).
 */
export const dropEmptyNote = (template: string): string => {
  const tree = isTreeTemplate(template);
  const lines = template.split('\n');
  const kept: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const bullet = tree ? NOTE_BULLET_LINE.exec(lines[i]) : null;
    if (bullet) {
      const indent = indentWidth(bullet[1]);
      let end = i + 1;
      while (
        end < lines.length &&
        (lines[end].trim() === '' ||
          indentWidth(/^[ \t]*/.exec(lines[end])![0]) > indent)
      ) {
        end++;
      }
      // Blank lines at the end of the subtree belong to what follows.
      while (end > i + 1 && lines[end - 1].trim() === '') end--;
      i = end - 1;
    } else if (!NOTE_LINE.test(lines[i])) {
      kept.push(lines[i]);
    }
  }
  return kept.join('\n');
};

/**
 * Appends the note placement filter to every `{{note ...}}` output (after the
 * user's own filters), with the column its line continues at. A bullet that has
 * only `{{note}}` gets the mark that makes it the note block of the clip.
 */
export const placeNoteTags = (template: string): string =>
  template.replace(
    /\{\{(-?)([\s\S]*?)(-?)\}\}/g,
    (
      match,
      lead: string,
      expression: string,
      trail: string,
      offset: number,
    ) => {
      if (!/^\s*note\s*(\||$)/.test(expression)) return match;
      const raw = expression.replace(/^(\s*)note/, `$1${NOTE_RAW}`);
      const lineStart = template.lastIndexOf('\n', offset - 1) + 1;
      const end = offset + match.length;
      const lineEnd = template.indexOf('\n', end);
      const before = stripLiquidTags(template.slice(lineStart, offset));
      const after = stripLiquidTags(
        template.slice(end, lineEnd === -1 ? template.length : lineEnd),
      );
      const startsBullet = /^([ \t]*)- /.exec(before);
      const column = startsBullet
        ? indentWidth(startsBullet[1]) + 2
        : indentWidth(/^[ \t]*/.exec(before)![0]);
      const alone =
        /^[ \t]*- +$/.test(before) &&
        after.trim() === '' &&
        expression.trim() === 'note';
      return `{{${lead}${raw}| ${NOTE_PLACE}: ${column}, ${alone} ${trail}}}`;
    },
  );

const NOTE_PLACE = '__clip_note';
// Registered on first use: the engine lives in a module that imports this one.
let notePlaceRegistered = false;
const registerNotePlace = () => {
  if (notePlaceRegistered) return;
  notePlaceRegistered = true;
  engine.registerFilter(
    NOTE_PLACE,
    (value: unknown, column: number, alone: boolean) => {
      const text = neutraliseNote(
        value === undefined || value === null ? '' : String(value),
        Number(column),
      );
      return alone && text !== '' ? NOTE_MARK + text : text;
    },
  );
};

/** The blocks with the mark of the note block read into `note`, the mark gone. */
const readNoteMarks = (blocks: ClipBlock[]): ClipBlock[] =>
  blocks.map((block) => {
    const marked = block.content.startsWith(NOTE_MARK);
    const { note: _drop, ...rest } = block;
    return {
      ...rest,
      content: block.content.replaceAll(NOTE_MARK, ''),
      children: readNoteMarks(block.children),
      ...(marked && { note: true as const }),
    };
  });

/**
 * The page values are rendered by `renderWithPageValues`, one implementation
 * for flat and tree templates: it reads where each value ended up from the
 * rendered text and escapes it for that place, after the filters of the
 * template. Template text, `{{date}}`, `{{time}}` and `{{dt}}` are never
 * escaped.
 */
const render = (
  template: string,
  vars: ClipVars,
  write: (site: ValueSite) => string,
) => {
  registerNotePlace();
  const note = cleanNote(vars.note);
  return renderWithPageValues(
    placeNoteTags(note === '' ? dropEmptyNote(template) : template),
    {
      // `{{note}}` is placed by `placeNoteTags`; `note` is for a tag that
      // reads it (`{% if note %}`). The note is the user's own text.
      note,
      [NOTE_RAW]: note,
      date: formatLogseqDate(vars.time, vars.preferredDateFormat),
      time: logseqTimeFormat(vars.time),
      dt: vars.time,
    },
    { content: vars.data, title: vars.title, url: vars.url },
    write,
    [note],
  );
};

/** A template rendered into a single block, trimmed. */
export const renderFlatClip = (template: string, vars: ClipVars): string =>
  render(template, vars, escapeValueSite).trim();

/**
 * A tree template: its first line that has something other than whitespace and
 * Liquid `{% %}` tags starts with `- `.
 */
export const isTreeTemplate = (template: string): boolean => {
  for (const line of template.split('\n')) {
    const text = stripLiquidTags(line);
    if (text.trim() === '') continue;
    return /^\s*- /.test(text);
  }
  return false;
};

const indentWidth = (whitespace: string) =>
  whitespace.replace(/\t/g, '  ').length;

// ---- fences ---------------------------------------------------------------

/**
 * Fences are the ones the escaper reads (`fenceRegions` in logseq-format): a
 * mark is three backticks or tildes at any indent, the next mark closes it
 * whatever its char or length, and a mark with no later mark is text. The
 * content splitter, `parseOutline` and `indentContent` pair marks that way, so
 * a line the escaper leaves as code is never split off as a block, and a
 * hostile fence cannot pair up differently here than it does in Logseq.
 * `openFence` and `closesFence` below are the template editor's own, CommonMark
 * way, for text the user wrote (see outline-doc).
 */

/** The fence character when `text` opens a fenced code block. */
export const openFence = (text: string): '`' | '~' | null => {
  const match = /^(`{3,}|~{3,})(.*)$/.exec(text.trimStart());
  if (!match) return null;
  // A backtick fence's info string has no backtick: "```x```" is inline code.
  if (match[1][0] === '`' && match[2].includes('`')) return null;
  return match[1][0] as '`' | '~';
};

export const closesFence = (text: string, fence: '`' | '~') =>
  text.trimStart().startsWith(fence.repeat(3));

// ---- outline parser ---------------------------------------------------------

interface Draft {
  block: ClipBlock;
  depth: number;
  lines: string[];
}

const pruneEmpty = (blocks: ClipBlock[]): ClipBlock[] =>
  blocks.flatMap((block) => {
    block.children = pruneEmpty(block.children);
    return block.content === '' ? block.children : [block];
  });

/**
 * Parses outline markdown into a block tree.
 *
 * - A line `- text` starts a block. Its depth is its indent / 2 (tabs count as
 *   2 spaces), at most one deeper than the block before it.
 * - Any other line continues the current block, with the block's indent
 *   stripped. Blank lines are kept inside a block, trimmed at its end.
 * - Inside a fence (from one ``` or ~~~ mark to the next) nothing starts a
 *   block.
 * - Empty blocks are skipped, their children move up a level.
 */
export const parseOutline = (text: string): ClipBlock[] => {
  const roots: ClipBlock[] = [];
  const drafts: Draft[] = [];
  const stack: Draft[] = [];
  let current: Draft | undefined;
  const rows = text.split(/\r?\n/);
  // A mark opens a fence only when a mark follows, else it is text.
  const lastMark = rows.findLastIndex(
    (row) => isFenceMark(row) || isFenceMark(row.replace(/^[ \t]*- /, '')),
  );
  let fence = false;

  const start = (depth: number, first: string, row: number) => {
    while (stack.length && stack[stack.length - 1].depth >= depth) stack.pop();
    const draft: Draft = {
      block: { content: '', children: [] },
      depth,
      lines: [first],
    };
    (stack.length ? stack[stack.length - 1].block.children : roots).push(
      draft.block,
    );
    stack.push(draft);
    drafts.push(draft);
    current = draft;
    fence = row < lastMark && isFenceMark(first);
  };

  for (const [row, raw] of rows.entries()) {
    const whitespace = /^[ \t]*/.exec(raw)![0];
    const indent = indentWidth(whitespace);
    const body = raw.slice(whitespace.length);

    if (!fence && (body.startsWith('- ') || body === '-')) {
      start(
        Math.min(Math.floor(indent / 2), current ? current.depth + 1 : 0),
        body.slice(2),
        row,
      );
      continue;
    }

    if (body === '') {
      current?.lines.push('');
      continue;
    }
    if (!current) {
      start(0, '', row);
    }
    const draft = current!;
    const strip = Math.min(indent, draft.depth * 2 + 2);
    const line = ' '.repeat(indent - strip) + body;
    draft.lines.push(line);
    if (fence) fence = !isFenceMark(line);
    else fence = row < lastMark && isFenceMark(line);
  }

  for (const draft of drafts)
    draft.block.content = draft.lines.join('\n').trim();
  return pruneEmpty(roots);
};

// ---- content to blocks (rule a) ---------------------------------------------

const LIST_ITEM = /^(\s*)([*+-]|\d{1,9}[.)])\s+(.*)$/;
const HORIZONTAL_RULE = /^\s*([*_-])(?:\s*\1){2,}\s*$/;

type LineKind =
  | 'blank'
  | 'fence'
  | 'rule'
  | 'item'
  | 'quote'
  | 'table'
  | 'text';

const kindOf = (line: string): LineKind => {
  if (line.trim() === '') return 'blank';
  if (isFenceMark(line)) return 'fence';
  if (HORIZONTAL_RULE.test(line)) return 'rule';
  if (LIST_ITEM.test(line)) return 'item';
  const trimmed = line.trimStart();
  if (trimmed.startsWith('>')) return 'quote';
  if (trimmed.startsWith('|')) return 'table';
  return 'text';
};

const lineIndent = (line: string) => /^ */.exec(line)![0].length;
const dedent = (line: string, by: number) =>
  line.slice(Math.min(by, lineIndent(line)));

/**
 * Splits clipped content (markdown, e.g. turndown's) into blocks: each
 * paragraph and list item a block, nested list items children, and a fenced
 * code block, a table or a run of quote lines kept whole.
 */
export const contentToBlocks = (content: string): ClipBlock[] => {
  const lines = content.split(/\r?\n/);
  const roots: ClipBlock[] = [];
  // The list items still open, innermost last.
  const open: { indent: number; block: ClipBlock }[] = [];

  const place = (indent: number, block: ClipBlock) => {
    while (open.length && open[open.length - 1].indent >= indent) open.pop();
    (open.length ? open[open.length - 1].block.children : roots).push(block);
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const kind = kindOf(line);
    const indent = lineIndent(line);

    if (kind === 'blank') {
      i++;
    } else if (kind === 'fence') {
      // From the mark to the next mark, as the escaper pairs them; a mark that
      // nothing closes is a line of text.
      const close = fenceClose(lines, i);
      const end = close < 0 ? i : close;
      const taken = lines.slice(i, end + 1).map((l) => dedent(l, indent));
      i = end + 1;
      place(indent, { content: taken.join('\n'), children: [] });
    } else if (kind === 'item') {
      const match = LIST_ITEM.exec(line)!;
      const marker = /^\d/.test(match[2]) ? `${match[2]} ` : '';
      const taken = [marker + match[3]];
      i++;
      // Lines right below that belong to the item (a wrapped line).
      while (
        i < lines.length &&
        kindOf(lines[i]) === 'text' &&
        lineIndent(lines[i]) > indent
      ) {
        taken.push(lines[i].trim());
        i++;
      }
      const block: ClipBlock = { content: taken.join('\n'), children: [] };
      place(indent, block);
      open.push({ indent, block });
    } else if (kind === 'quote' || kind === 'table') {
      const taken: string[] = [];
      while (i < lines.length && kindOf(lines[i]) === kind) {
        taken.push(dedent(lines[i], indent));
        i++;
      }
      place(indent, { content: taken.join('\n'), children: [] });
    } else if (kind === 'rule') {
      place(indent, { content: line.trim(), children: [] });
      i++;
    } else {
      const taken: string[] = [];
      while (i < lines.length && kindOf(lines[i]) === 'text') {
        taken.push(lines[i].trim());
        i++;
      }
      place(indent, { content: taken.join('\n'), children: [] });
    }
  }
  return roots;
};

/**
 * Outline text for `blocks` below a bullet at `indent`: the first block follows
 * the `- ` already in the template, the others are bullets at `indent`.
 */
const outlineAfterBullet = (blocks: ClipBlock[], indent: number): string => {
  const out: string[] = [];
  let first = true;
  const walk = (list: ClipBlock[], depth: number) => {
    for (const block of list) {
      const pad = ' '.repeat(indent + depth * 2);
      const [head, ...rest] = block.content.split('\n');
      out.push(first ? head : `${pad}- ${head}`);
      first = false;
      for (const line of rest) {
        out.push(line.trim() === '' ? '' : `${pad}  ${line}`);
      }
      walk(block.children, depth + 1);
    }
  };
  walk(blocks, 0);
  return out.join('\n');
};

/**
 * Rule b: the content inside one block; `column` is where its lines continue.
 * The lines of a fence keep their `- `, the escaper left them as code.
 */
const indentContent = (
  content: string,
  column: number,
  midLine: MidLine | false,
): string => {
  const pad = ' '.repeat(column);
  const lines = content.split('\n');
  const regions = fenceRegions(lines, midLine);
  return lines
    .map((line, index) => {
      let text = line;
      const inFence = regions.some((r) => index >= r.open && index <= r.close);
      if (!inFence && /^\s*- /.test(text))
        text = text.replace(/^(\s*)- /, '$1\\- ');
      return index === 0 || text.trim() === '' ? text : pad + text;
    })
    .join('\n');
};

// ---- {{content}} placement --------------------------------------------------

/**
 * Escapes the text of every block. Each block starts a Logseq block, so its
 * first line gets the escapes for a block start (task marker, `- `, `key::`).
 */
const escapeBlocks = (blocks: ClipBlock[]): ClipBlock[] =>
  blocks.map((block) => ({
    content: escapeForLogseq(block.content, { context: 'block' }),
    children: escapeBlocks(block.children),
  }));

/**
 * Writes one page value of a tree template, by the line of the rendered text it
 * is on: `{{content}}` alone after a bullet below the top level is split into
 * blocks (rule a), anywhere else it stays in its block (rule b). The values
 * are the ones the filters of the template made, escaped last.
 */
const writeTreeValue = (site: ValueSite): string => {
  if (site.kind !== 'content') return escapeValueSite(site);
  // Split first, escape after: turndown's `*   ` and `1.  ` markers and the
  // blocks' first lines must be seen as they are, and a list item's text is
  // the start of its block only once its marker is gone.
  const bullet = /^([ \t]*)- +$/.exec(site.linePrefix);
  // A top-level bullet is the clip's one root: its content stays inside it.
  if (
    !site.strict &&
    bullet &&
    site.lineAfter.trim() === '' &&
    indentWidth(bullet[1]) > 0
  ) {
    return outlineAfterBullet(
      escapeBlocks(contentToBlocks(site.raw)),
      indentWidth(bullet[1]),
    );
  }
  const startsBullet = /^([ \t]*)- /.exec(site.linePrefix);
  const column = startsBullet
    ? indentWidth(startsBullet[1]) + 2
    : indentWidth(/^[ \t]*/.exec(site.linePrefix)![0]);
  // Text of the template stands before the content on its line (`- Note: `):
  // the first line of the content is then the middle of a line, and a fence
  // mark there is no mark. The escaper is told, so it pairs the marks as
  // Logseq reads them in the block.
  const midLine = midLineAt(site, true);
  return indentContent(
    escapeForLogseq(site.raw, { context: 'block', midLine }),
    column,
    midLine,
  );
};

/**
 * The blocks with one root: the first root takes the others as children, after
 * its own. An empty list stays empty.
 */
export const singleRoot = (blocks: ClipBlock[]): ClipBlock[] => {
  if (blocks.length <= 1) return blocks;
  const [root, ...others] = blocks;
  return [{ ...root, children: [...root.children, ...others] }];
};

/**
 * How many top-level blocks the template's text has, as the outline editor
 * reads it: a flat template is one, a tree template has its top-level bullets
 * that are not empty. More than one is allowed to render (see `singleRoot`) but
 * not to save in the editor.
 */
export const countRoots = (template: string): number =>
  isTreeTemplate(template) ? parseOutline(template).length : 1;

/**
 * Renders a template into the blocks to write: at most one root (see the module
 * header). A flat template is one block, the same text `blockRending` made; a
 * tree template is parsed into its tree. A tree template of only empty bullets
 * renders to no block at all.
 */
export const renderClip = (template: string, vars: ClipVars): ClipBlock[] => {
  const note = cleanNote(vars.note);
  let blocks: ClipBlock[];
  if (!isTreeTemplate(template)) {
    blocks = [{ content: renderFlatClip(template, vars), children: [] }];
  } else {
    const text = render(template, vars, writeTreeValue);
    blocks = readNoteMarks(singleRoot(parseOutline(text)));
  }
  // A template without `{{note}}` keeps the note anyway: the last child of the
  // clip's root, a block of its own.
  if (note !== '' && !usesNote(template) && blocks.length > 0) {
    const [root] = blocks;
    blocks = [
      {
        ...root,
        children: [
          ...root.children,
          { content: neutraliseNote(note), children: [], note: true },
        ],
      },
    ];
  }
  return blocks;
};
