/**
 * The outline editor's document model, as pure text functions (no React, no
 * CodeMirror), so every edit can be tested on a string and a selection.
 *
 * A template is stored as plain text (see `clip-template.ts`). The outline
 * editor shows it in a canonical outline form:
 *
 * - a block line is `<2 * depth spaces>- text`; an empty block is `- `
 * - a continuation line (the block's later lines) is indented to the block's
 *   text column, `2 * depth + 2` spaces; a blank one is empty
 *
 * One root: a clip writes exactly one top-level block (see `clip-template.ts`),
 * so the first block is the only one at depth 0. `scan` reads every later block
 * at depth 1 or deeper, Enter on the root adds a child, Shift+Tab stops at depth
 * 1, and a paste goes under the current block. A stored template with more roots
 * is not canonical: the editor opens it as text.
 *
 * `toCanonical` / `toStored` convert between the two. A flat template is one
 * block in the canonical form. `isLossless` tells whether a stored template
 * survives the round trip byte for byte; if not, the editor opens it as text.
 *
 * The commands (`enter`, `indent`, `backspace`, ...) take a `DocState` (text
 * and selection) and return the next one, or null when they do not apply and
 * the editor should do its default. A command that applies but changes
 * nothing returns the state as it was (a Tab at the deepest level must not
 * move focus).
 */
import {
  closesFence,
  isTreeTemplate,
  openFence,
  parseOutline,
  type ClipBlock,
} from './clip-template';

export interface DocState {
  text: string;
  /** Selection start; equal to `to` for a caret. */
  from: number;
  to: number;
}

// ---- layout -------------------------------------------------------------------

export interface Row {
  kind: 'block' | 'cont';
  /** Index into `Layout.blocks`. */
  block: number;
  /** Offset of the line start, and of its end (before the newline). */
  start: number;
  end: number;
  /** Where the line's editable text starts: behind the marker or the indent. */
  textFrom: number;
  line: string;
  /** A first line without a `- ` marker: `normalize` adds one. */
  virtual: boolean;
}

export interface Block {
  depth: number;
  firstRow: number;
  /** Last row of the block itself. */
  lastRow: number;
  /** Last row of the block and its descendants. */
  subLast: number;
}

export interface Layout {
  rows: Row[];
  blocks: Block[];
}

const pad = (width: number) => ' '.repeat(width);
const column = (depth: number) => depth * 2 + 2;
const widthOf = (whitespace: string) => whitespace.replace(/\t/g, '  ').length;

/**
 * Reads the lines of `text` as an outline, as `parseOutline` does: `- ` starts
 * a block at depth indent / 2 (at most one deeper than the block before),
 * anything else continues the block above, and inside a code fence nothing
 * starts a block. A text that does not start with a block gets an implied one.
 */
export const scan = (text: string): Layout => {
  const rows: Row[] = [];
  const blocks: Block[] = [];
  let fence: '`' | '~' | null = null;
  let offset = 0;
  /** The depth the current block is written at, and the lift of later roots. */
  let currentWritten = 0;
  let lift = 0;

  for (const line of text.split('\n')) {
    const start = offset;
    offset += line.length + 1;
    const whitespace = /^[ \t]*/.exec(line)![0];
    const indent = widthOf(whitespace);
    const body = line.slice(whitespace.length);
    const current = blocks[blocks.length - 1];

    if (!fence && (body.startsWith('- ') || body === '-')) {
      // Only the first block is at depth 0: a later block written at depth 0
      // is read one level deeper, with everything after it.
      const written = Math.min(
        Math.floor(indent / 2),
        current ? currentWritten + 1 : 0,
      );
      if (current && written === 0) lift = 1;
      currentWritten = written;
      const depth = written + lift;
      blocks.push({
        depth,
        firstRow: rows.length,
        lastRow: rows.length,
        subLast: rows.length,
      });
      rows.push({
        kind: 'block',
        block: blocks.length - 1,
        start,
        end: start + line.length,
        textFrom: start + whitespace.length + Math.min(2, body.length),
        line,
        virtual: false,
      });
      fence = openFence(body.slice(2));
      continue;
    }

    if (!current) {
      blocks.push({ depth: 0, firstRow: 0, lastRow: 0, subLast: 0 });
      rows.push({
        kind: 'block',
        block: 0,
        start,
        end: start + line.length,
        textFrom: start + whitespace.length,
        line,
        virtual: true,
      });
      fence = openFence(body);
      continue;
    }

    const col = column(current.depth);
    const stripped = pad(indent - Math.min(indent, col)) + body;
    current.lastRow = rows.length;
    rows.push({
      kind: 'cont',
      block: blocks.length - 1,
      start,
      end: start + line.length,
      textFrom: start + Math.min(whitespace.length, col),
      line,
      virtual: false,
    });
    if (body !== '') {
      if (fence) {
        if (closesFence(stripped, fence)) fence = null;
      } else {
        fence = openFence(stripped);
      }
    }
  }

  blocks.forEach((block, index) => {
    const next = blocks.slice(index + 1).find((b) => b.depth <= block.depth);
    block.subLast = next ? next.firstRow - 1 : rows.length - 1;
  });
  return { rows, blocks };
};

/** The row that holds `offset` (a newline belongs to the line it ends). */
const rowAt = (layout: Layout, offset: number): number => {
  const { rows } = layout;
  for (let i = rows.length - 1; i >= 0; i--) {
    if (rows[i].start <= offset) return i;
  }
  return 0;
};

/** The text of a row without its marker or indentation. */
const textOf = (row: Row) => row.line.slice(row.textFrom - row.start);

/** A continuation row's line with the block's indentation removed. */
const strippedCont = (row: Row, depth: number) => {
  const whitespace = /^[ \t]*/.exec(row.line)![0];
  const indent = widthOf(whitespace);
  const body = row.line.slice(whitespace.length);
  return body === ''
    ? ''
    : pad(indent - Math.min(indent, column(depth))) + body;
};

// ---- canonical form -----------------------------------------------------------

/**
 * `text` as canonical outline text: every block line `<pad>- text`, every
 * continuation line indented to its block's column, depth jumps clamped, tabs
 * and odd indentation fixed. Canonical text is its own result.
 */
export const normalize = (text: string): string => {
  const { rows, blocks } = scan(text);
  return rows
    .map((row) => {
      const depth = blocks[row.block].depth;
      if (row.kind === 'block') {
        const content = row.virtual ? row.line.trimStart() : textOf(row);
        return `${pad(depth * 2)}- ${content}`;
      }
      const stripped = strippedCont(row, depth);
      if (stripped === '') {
        // A blank line is empty, or just the indentation a new line starts with.
        return row.line === pad(column(depth)) ? row.line : '';
      }
      return pad(column(depth)) + stripped;
    })
    .join('\n');
};

export const isCanonical = (text: string): boolean => normalize(text) === text;

/** A flat template as one block: `- ` before it, later lines indented by 2. */
const flatToCanonical = (flat: string): string =>
  flat
    .split('\n')
    .map((line, index) => {
      if (index === 0) return `- ${line}`;
      return line === '' ? '' : `  ${line}`;
    })
    .join('\n');

/** The stored template text as the editor's document. */
export const toCanonical = (stored: string): string => {
  if (isTreeTemplate(stored)) {
    // Tabs in the indentation become 2 spaces; `isLossless` is false then,
    // since the stored text would change.
    return stored.replace(/^[ \t]+/gm, (ws) => ' '.repeat(widthOf(ws)));
  }
  return flatToCanonical(stored);
};

/**
 * The editor's document as stored text: one root block without children goes
 * back to flat form; anything else is stored as the outline.
 */
export const toStored = (canonical: string): string => {
  const { rows, blocks } = scan(canonical);
  if (blocks.length !== 1 || !isCanonical(canonical)) return canonical;
  const flat = rows.map((row) => row.line.slice(2)).join('\n');
  // A single block whose text starts with `- ` would read as a tree template.
  return isTreeTemplate(flat) ? canonical : flat;
};

/** The block tree of an outline text, as `parseOutline` builds it. */
const treeOf = (text: string): ClipBlock[] => {
  const { rows, blocks } = scan(text);
  const contents = blocks.map((block) =>
    rows
      .slice(block.firstRow, block.lastRow + 1)
      .map((row) =>
        row.kind === 'block' ? textOf(row) : strippedCont(row, block.depth),
      )
      .join('\n')
      .trim(),
  );
  const roots: ClipBlock[] = [];
  const stack: { depth: number; block: ClipBlock }[] = [];
  blocks.forEach((block, index) => {
    const node: ClipBlock = { content: contents[index], children: [] };
    while (stack.length && stack[stack.length - 1].depth >= block.depth) {
      stack.pop();
    }
    (stack.length ? stack[stack.length - 1].block.children : roots).push(node);
    stack.push({ depth: block.depth, block: node });
  });
  const prune = (list: ClipBlock[]): ClipBlock[] =>
    list.flatMap((node) => {
      node.children = prune(node.children);
      return node.content === '' ? node.children : [node];
    });
  return prune(roots);
};

/**
 * Whether the outline editor shows `stored` without changing it: stored text
 * survives `toStored(toCanonical(...))` byte for byte, is one block when flat,
 * and the editor reads the same blocks as the renderer when it is a tree.
 */
export const isLossless = (stored: string): boolean => {
  const canonical = toCanonical(stored);
  if (!isCanonical(canonical)) return false;
  if (toStored(canonical) !== stored) return false;
  if (isTreeTemplate(stored)) {
    return (
      JSON.stringify(treeOf(canonical)) === JSON.stringify(parseOutline(stored))
    );
  }
  return scan(canonical).blocks.length === 1;
};

// ---- commands -----------------------------------------------------------------

const replaceRange = (text: string, from: number, to: number, insert: string) =>
  text.slice(0, from) + insert + text.slice(to);

/** The state with its selection removed. */
const withoutSelection = (state: DocState): DocState => ({
  text: replaceRange(state.text, state.from, state.to, ''),
  from: state.from,
  to: state.from,
});

const isEmptyBlock = (layout: Layout, block: Block) =>
  block.firstRow === block.lastRow &&
  textOf(layout.rows[block.firstRow]).trim() === '';

/**
 * Enter: a new sibling block. At the end of a block it goes behind the block's
 * subtree; elsewhere the text after the caret moves into it. An empty block
 * below depth 1 outdents instead. The root has no siblings: its new block is
 * its first child, before the children it has.
 */
export const enter = (input: DocState): DocState => {
  const state = withoutSelection(input);
  const layout = scan(state.text);
  const row = layout.rows[rowAt(layout, state.from)];
  const block = layout.blocks[row.block];
  const caret = Math.max(state.from, row.textFrom);

  if (block.depth > 0 && isEmptyBlock(layout, block)) {
    return outdent({ ...state, from: caret, to: caret });
  }
  const atEnd = caret === layout.rows[block.lastRow].end;
  if (block.depth === 0) {
    // A child of the root: at the end of its own text, before its children.
    const at = atEnd ? layout.rows[block.lastRow].end : caret;
    const text = normalize(replaceRange(state.text, at, at, '\n  - '));
    return { text, from: at + 5, to: at + 5 };
  }
  const at = atEnd ? layout.rows[block.subLast].end : caret;
  const insert = `\n${pad(block.depth * 2)}- `;
  const next = at + insert.length;
  return {
    text: replaceRange(state.text, at, at, insert),
    from: next,
    to: next,
  };
};

/** Shift+Enter: a new line inside the block, indented to its text column. */
export const shiftEnter = (input: DocState): DocState => {
  const layout = scan(input.text);
  const block = layout.blocks[layout.rows[rowAt(layout, input.from)].block];
  const insert = `\n${pad(column(block.depth))}`;
  const next = input.from + insert.length;
  return {
    text: replaceRange(input.text, input.from, input.to, insert),
    from: next,
    to: next,
  };
};

/** The selected blocks that are not inside another selected block. */
const selectedTops = (layout: Layout, from: number, to: number): number[] => {
  const first = rowAt(layout, from);
  let last = rowAt(layout, to);
  // A selection that ends at the start of a line does not include that line.
  if (to > from && last > first && layout.rows[last].start === to) last--;
  const tops: number[] = [];
  let coveredUntil = -1;
  for (
    let index = layout.rows[first].block;
    index <= layout.rows[last].block;
    index++
  ) {
    const block = layout.blocks[index];
    if (block.firstRow > coveredUntil) {
      tops.push(index);
      coveredUntil = block.subLast;
    }
  }
  return tops;
};

/** Adds (or removes) `delta` spaces at the start of the given rows. */
const shiftRows = (
  state: DocState,
  layout: Layout,
  rowIndexes: Set<number>,
  delta: number,
): DocState => {
  const lines = state.text.split('\n');
  const edited = new Set(
    [...rowIndexes].filter((index) => lines[index] !== ''),
  );
  const map = (offset: number) => {
    let result = offset;
    for (const index of edited) {
      const start = layout.rows[index].start;
      if (delta > 0 ? offset >= start : offset > start) {
        result += delta > 0 ? delta : -Math.min(-delta, offset - start);
      }
    }
    return result;
  };
  const text = lines
    .map((line, index) => {
      if (!edited.has(index)) return line;
      return delta > 0 ? pad(delta) + line : line.slice(-delta);
    })
    .join('\n');
  return { text, from: map(state.from), to: map(state.to) };
};

const subtreeRows = (layout: Layout, tops: number[]) => {
  const rows = new Set<number>();
  for (const index of tops) {
    const block = layout.blocks[index];
    for (let row = block.firstRow; row <= block.subLast; row++) rows.add(row);
  }
  return rows;
};

/**
 * Tab: indents the selected blocks with their subtrees. A block can be at most
 * one level deeper than the block before it; the first one that cannot makes
 * the whole command do nothing.
 */
export const indent = (state: DocState): DocState => {
  const layout = scan(state.text);
  const tops = selectedTops(layout, state.from, state.to);
  const depths = layout.blocks.map((block) => block.depth);
  const moved: number[] = [];
  for (const [position, index] of tops.entries()) {
    const previous = index > 0 ? depths[index - 1] : -1;
    if (depths[index] > previous) {
      if (position === 0) return state;
      continue;
    }
    const block = layout.blocks[index];
    for (
      let i = index;
      i < layout.blocks.length && layout.blocks[i].firstRow <= block.subLast;
      i++
    ) {
      depths[i]++;
    }
    moved.push(index);
  }
  return shiftRows(state, layout, subtreeRows(layout, moved), 2);
};

/**
 * Shift+Tab: outdents the selected blocks with their subtrees, down to depth 1:
 * only the first block is at depth 0.
 */
export const outdent = (state: DocState): DocState => {
  const layout = scan(state.text);
  const tops = selectedTops(layout, state.from, state.to).filter(
    (index) => layout.blocks[index].depth > 1,
  );
  if (tops.length === 0) return state;
  return shiftRows(state, layout, subtreeRows(layout, tops), -2);
};

/**
 * Backspace at the start of a block's text: an empty block is deleted, any
 * other merges into the end of the block before, its children becoming that
 * block's children. At the start of a continuation line it joins the line
 * above. Elsewhere null.
 */
export const backspace = (state: DocState): DocState | null => {
  if (state.from !== state.to) return null;
  const layout = scan(state.text);
  const index = rowAt(layout, state.from);
  const row = layout.rows[index];
  if (state.from !== row.textFrom) return null;

  if (row.kind === 'cont') {
    const above = layout.rows[index - 1];
    return {
      text: replaceRange(state.text, above.end, state.from, ''),
      from: above.end,
      to: above.end,
    };
  }

  const blockIndex = row.block;
  if (blockIndex === 0) return state;
  const block = layout.blocks[blockIndex];
  const previous = layout.blocks[blockIndex - 1];
  const lines = state.text.split('\n');
  const target = previous.lastRow;

  const merged: string[] = [
    ...lines.slice(0, target),
    lines[target] + textOf(row),
  ];
  for (let i = block.firstRow + 1; i <= block.lastRow; i++) {
    const stripped = strippedCont(layout.rows[i], block.depth);
    merged.push(stripped === '' ? '' : pad(column(previous.depth)) + stripped);
  }
  const delta = (previous.depth - block.depth) * 2;
  for (let i = block.lastRow + 1; i <= block.subLast; i++) {
    const line = lines[i];
    if (line === '') merged.push(line);
    else merged.push(delta >= 0 ? pad(delta) + line : line.slice(-delta));
  }
  merged.push(...lines.slice(block.subLast + 1));

  const caret = layout.rows[target].end;
  return { text: merged.join('\n'), from: caret, to: caret };
};

/**
 * Delete at the end of a line: the next block merges into this one (as
 * Backspace at its start does), or the next continuation line joins. Elsewhere
 * null.
 */
export const deleteForward = (state: DocState): DocState | null => {
  if (state.from !== state.to) return null;
  const layout = scan(state.text);
  const index = rowAt(layout, state.from);
  const row = layout.rows[index];
  const next = layout.rows[index + 1];
  if (state.from !== row.end || !next) return null;
  if (next.kind === 'cont') {
    return {
      text: replaceRange(state.text, row.end, next.textFrom, ''),
      from: row.end,
      to: row.end,
    };
  }
  return backspace({
    text: state.text,
    from: next.textFrom,
    to: next.textFrom,
  });
};

/** Home: the start of the line's text, behind the marker or the indentation. */
export const lineStart = (state: DocState): number => {
  const layout = scan(state.text);
  return layout.rows[rowAt(layout, state.to)].textFrom;
};

// ---- paste --------------------------------------------------------------------

const BULLET = /^[ \t]*[-*] /;

/** Multi-line text whose first line is a `- ` or `* ` bullet. */
export const looksLikeOutline = (clip: string): boolean => {
  const first = clip.split('\n').find((line) => line.trim() !== '');
  return first !== undefined && BULLET.test(first);
};

/**
 * Outline text from elsewhere (`- ` or `* ` bullets, tabs or spaces) as
 * canonical lines starting at depth 0. Indentation is read by level: a line
 * indented more than the bullet above is its child, however many spaces.
 */
export const outlineToCanonical = (clip: string): string[] => {
  const out: string[] = [];
  const levels: number[] = []; // the indent of each open level
  let depth = 0;
  let fence: '`' | '~' | null = null;
  let hasBlock = false;
  let bulletIndent = 0;

  for (const line of clip.split('\n')) {
    const whitespace = /^[ \t]*/.exec(line)![0];
    const indent = widthOf(whitespace);
    const body = line.slice(whitespace.length);
    const bullet = /^[-*](?: (.*))?$/.exec(body);

    if (!fence && bullet) {
      while (levels.length && levels[levels.length - 1] > indent) {
        levels.pop();
      }
      if (levels.length === 0 || levels[levels.length - 1] < indent) {
        levels.push(indent);
      }
      depth = levels.length - 1;
      hasBlock = true;
      bulletIndent = indent;
      const text = bullet[1] ?? '';
      out.push(`${pad(depth * 2)}- ${text}`);
      fence = openFence(text);
      continue;
    }

    if (body === '') {
      if (hasBlock) out.push('');
      continue;
    }
    if (!hasBlock) {
      out.push(`- ${body}`);
      hasBlock = true;
      levels.push(indent);
      bulletIndent = indent;
      fence = openFence(body);
      continue;
    }
    const strip = Math.min(indent, bulletIndent + 2);
    const text = pad(indent - strip) + body;
    out.push(pad(column(depth)) + text);
    if (fence) {
      if (closesFence(text, fence)) fence = null;
    } else {
      fence = openFence(text);
    }
  }
  while (out.length && out[out.length - 1] === '') out.pop();
  return out;
};

/**
 * Paste of `clip` at the selection, when it needs more than text insertion.
 * An outline becomes blocks (below the current block, or in place of an
 * empty one); other multi-line text goes into the block as continuation lines.
 * Single-line text returns null: the editor inserts it as it is.
 *
 * The pasted blocks keep the one root: below the root they are its children
 * (the first ones, before its own children), in place of an empty root the
 * first pasted root takes the place and the other pasted roots become its
 * children.
 */
export const paste = (input: DocState, raw: string): DocState | null => {
  const clip = raw.replace(/\r\n?/g, '\n').replace(/\n+$/, '');
  if (!clip.includes('\n')) {
    if (clip === raw.replace(/\r\n?/g, '\n')) return null;
    return {
      text: replaceRange(input.text, input.from, input.to, clip),
      from: input.from + clip.length,
      to: input.from + clip.length,
    };
  }
  const state = withoutSelection(input);
  const layout = scan(state.text);
  const row = layout.rows[rowAt(layout, state.from)];
  const block = layout.blocks[row.block];

  if (looksLikeOutline(clip)) {
    const pasted = outlineToCanonical(clip);
    const replaces = isEmptyBlock(layout, block);
    let lines: string[];
    if (replaces && block.depth === 0) {
      // The first root takes the empty root's place, the other pasted roots
      // (and what is below them) go under it.
      const second = pasted.findIndex((line, i) => i > 0 && line.startsWith('- '));
      lines = pasted.map((line, i) =>
        second !== -1 && i >= second && line !== '' ? `  ${line}` : line,
      );
    } else {
      const base = Math.max(block.depth, 1);
      lines = pasted.map((line) => (line === '' ? line : pad(base * 2) + line));
    }
    const insert = lines.join('\n');
    let start: number;
    let end: number;
    let text: string;
    if (replaces) {
      start = row.start;
      end = row.end;
      text = replaceRange(state.text, start, end, insert);
    } else {
      // Below the block's subtree; the root's pasted blocks come before its
      // children, as the block Enter adds.
      start = end = layout.rows[
        block.depth === 0 ? block.lastRow : block.subLast
      ].end;
      text = replaceRange(state.text, start, end, `\n${insert}`);
      start += 1;
    }
    const caret = start + insert.length;
    return { text, from: caret, to: caret };
  }

  const [first, ...rest] = clip.split('\n');
  const insert = [
    first,
    ...rest.map((line) =>
      line.trim() === ''
        ? ''
        : pad(column(block.depth)) + line.replace(/^(\s*)- /, '$1\\- '),
    ),
  ].join('\n');
  const caret = state.from + insert.length;
  return {
    text: replaceRange(state.text, state.from, state.from, insert),
    from: caret,
    to: caret,
  };
};
