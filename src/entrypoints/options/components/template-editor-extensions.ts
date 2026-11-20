/**
 * CodeMirror extensions of the template editor. The document is the template
 * text; Outline mode is decorations and keymaps over it (see `outline-doc.ts`
 * for the text model and the editing commands), Text mode only highlights.
 *
 * Tags (`#Tag`, `#[[Tag]]`) and properties (`key:: value` lines after a
 * block's first line) are written in the text as in Logseq; the graph the
 * editor knows (`setGraph`) completes their names and shows the type of a DB
 * graph's properties. Without a graph everything is typed by hand.
 */
import {
  Annotation,
  EditorSelection,
  EditorState,
  Prec,
  StateEffect,
  StateField,
  type Extension,
  type Range,
} from '@codemirror/state';
import {
  Decoration,
  EditorView,
  ViewPlugin,
  WidgetType,
  keymap,
  type Command,
  type DecorationSet,
  type ViewUpdate,
} from '@codemirror/view';
import {
  defaultKeymap,
  history,
  historyKeymap,
  insertNewline,
  isolateHistory,
  temporarilySetTabFocusMode,
} from '@codemirror/commands';
import {
  acceptCompletion,
  autocompletion,
  startCompletion,
  type Completion,
  type CompletionContext,
  type CompletionResult,
} from '@codemirror/autocomplete';
import { format } from 'date-fns';
import { logseqTimeFormat } from '@/utils/logseq-format';
import type { GraphKind, GraphProperty, GraphTag } from '@/utils/storage';
import {
  backspace,
  deleteForward,
  enter,
  indent,
  lineStart,
  normalize,
  outdent,
  paste,
  scan,
  shiftEnter,
  type DocState,
  type Row,
} from '@/utils/outline-doc';

// ---- variables ----------------------------------------------------------------

export const VARIABLE_NAMES = [
  'title',
  'url',
  'content',
  'note',
  'date',
  'time',
  'dt',
] as const;

/** What each variable shows in the completion list. */
export const variableSamples = (now = new Date()): Record<string, string> => ({
  title: 'Sample page',
  url: 'example.com/article',
  content: 'selection',
  note: 'my note',
  date: format(now, 'MMM do, yyyy'),
  time: logseqTimeFormat(now),
  dt: format(now, 'yyyy-MM-dd HH:mm'),
});

/** Marks a transaction that replaces the document from outside the user. */
export const External = Annotation.define<boolean>();

// ---- graph ----------------------------------------------------------------------

/** What the editor knows of the Logseq graph; empty when it is not reachable. */
export interface EditorGraph {
  kind: GraphKind;
  properties: GraphProperty[];
  tags: GraphTag[];
}

export const NO_GRAPH: EditorGraph = { kind: null, properties: [], tags: [] };

/** Replaces the graph the editor completes from. */
export const setGraph = StateEffect.define<EditorGraph>();

const graphField = StateField.define<EditorGraph>({
  create: () => NO_GRAPH,
  update: (value, tr) => {
    for (const effect of tr.effects) if (effect.is(setGraph)) value = effect.value;
    return value;
  },
});

/** The graph's property of title `key`, in any case (as the clip matches it). */
const propertyOf = (graph: EditorGraph, key: string) => {
  const lower = key.toLowerCase();
  return graph.properties.find(
    (property) => property.title.toLowerCase() === lower,
  );
};

/** The type a badge and the value completion go by: DB graphs only. */
const typeOf = (graph: EditorGraph, key: string) =>
  graph.kind === 'db' ? propertyOf(graph, key)?.type : undefined;

/** The variables a value of a property of `type` can take. */
export const variablesFor = (type: string | undefined): readonly string[] => {
  if (type === 'date') return ['date', 'time'];
  if (type === 'url') return ['url'];
  return VARIABLE_NAMES;
};

// ---- widgets --------------------------------------------------------------------

const svgNs = 'http://www.w3.org/2000/svg';

/** Three stacked blocks: the content is split into blocks here. */
const stackIcon = () => {
  const svg = document.createElementNS(svgNs, 'svg');
  svg.setAttribute('viewBox', '0 0 12 12');
  svg.setAttribute('class', 'cm-tpl-chip-icon');
  svg.setAttribute('aria-hidden', 'true');
  for (const y of [0.75, 4.75, 8.75]) {
    const rect = document.createElementNS(svgNs, 'rect');
    rect.setAttribute('x', '1');
    rect.setAttribute('y', String(y));
    rect.setAttribute('width', '10');
    rect.setAttribute('height', '2.5');
    rect.setAttribute('rx', '0.8');
    rect.setAttribute('fill', 'currentColor');
    svg.append(rect);
  }
  return svg;
};

class ChipWidget extends WidgetType {
  constructor(
    readonly name: string,
    readonly filters: string,
    readonly known: boolean,
    readonly stacked: boolean,
  ) {
    super();
  }

  eq(other: ChipWidget) {
    return (
      other.name === this.name &&
      other.filters === this.filters &&
      other.known === this.known &&
      other.stacked === this.stacked
    );
  }

  toDOM() {
    const chip = document.createElement('span');
    chip.className = `cm-tpl-chip${this.known ? '' : ' cm-tpl-chip-unknown'}`;
    chip.dataset.variable = this.name;
    if (this.stacked) {
      chip.dataset.split = 'true';
      chip.append(stackIcon());
    }
    const name = document.createElement('span');
    name.textContent = this.name;
    chip.append(name);
    if (this.filters) {
      const filters = document.createElement('span');
      filters.className = 'cm-tpl-chip-filters';
      filters.textContent = ` | ${this.filters}`;
      chip.append(filters);
    }
    return chip;
  }

  ignoreEvent() {
    return false;
  }
}

class BulletWidget extends WidgetType {
  eq(other: WidgetType) {
    return other instanceof BulletWidget;
  }

  toDOM() {
    const bullet = document.createElement('span');
    bullet.className = 'cm-tpl-bullet';
    bullet.setAttribute('aria-hidden', 'true');
    const dot = document.createElement('span');
    dot.className = 'cm-tpl-dot';
    bullet.append(dot);
    return bullet;
  }

  ignoreEvent() {
    return false;
  }
}

class SpacerWidget extends WidgetType {
  eq(other: WidgetType) {
    return other instanceof SpacerWidget;
  }

  toDOM() {
    const spacer = document.createElement('span');
    spacer.className = 'cm-tpl-spacer';
    spacer.setAttribute('aria-hidden', 'true');
    return spacer;
  }

  ignoreEvent() {
    return false;
  }
}

class PlaceholderWidget extends WidgetType {
  eq(other: WidgetType) {
    return other instanceof PlaceholderWidget;
  }

  toDOM() {
    const hint = document.createElement('span');
    hint.className = 'cm-tpl-placeholder';
    hint.setAttribute('aria-hidden', 'true');
    hint.textContent = 'Type {{ to add a variable';
    return hint;
  }
}

/** The type of a DB graph's property, after its `key::`. */
class TypeWidget extends WidgetType {
  constructor(readonly type: string) {
    super();
  }

  eq(other: TypeWidget) {
    return other.type === this.type;
  }

  toDOM() {
    const badge = document.createElement('span');
    badge.className = 'cm-tpl-type';
    badge.textContent = this.type;
    return badge;
  }
}

/** "+ Property" at the end of a block's first line, shown on hover. */
class AddPropertyWidget extends WidgetType {
  eq(other: WidgetType) {
    return other instanceof AddPropertyWidget;
  }

  toDOM(view: EditorView) {
    const button = document.createElement('span');
    button.className = 'cm-tpl-add-prop';
    button.setAttribute('role', 'button');
    button.setAttribute('aria-label', 'Add property');
    button.textContent = '+ Property';
    // Keeps the focus and the caret where they are until the click.
    button.addEventListener('mousedown', (event) => event.preventDefault());
    button.addEventListener('click', (event) => {
      event.preventDefault();
      addProperty(view, view.posAtDOM(button));
    });
    return button;
  }

  ignoreEvent() {
    return true;
  }
}

// ---- decorations ------------------------------------------------------------------

const VARIABLE = /\{\{(-?)([^{}\n]*?)(-?)\}\}/g;
const LINK = /\[([^\]\n]*)\]\(([^)\n]*)\)/g;
const TASK = /^(TODO|LATER|NOW|DOING|DONE)(?= |$)/;
const PROPERTY = /^[A-Za-z_][\w-]*::(?= |$)/;
/** A property line's key, as the clip reads it (`block-meta.ts`). */
const PROPERTY_KEY = /^(\S+?)::(?=[ \t]|$)/;
const CONTENT_ALONE = /^\s*\{\{-?\s*content\s*(?:\|[^{}]*)?-?\}\}\s*$/;

const parseVariable = (inner: string) => {
  const match = /^\s*([A-Za-z_][\w.]*)\s*(?:\|([\s\S]*))?$/.exec(inner);
  if (!match) return { name: inner.trim() || '?', filters: '' };
  return { name: match[1], filters: (match[2] ?? '').trim() };
};

interface Built {
  decorations: DecorationSet;
  /** Ranges the caret cannot enter. */
  atomic: DecorationSet;
}

const markerDecoration = Decoration.replace({ widget: new BulletWidget() });
const spacerDecoration = Decoration.replace({ widget: new SpacerWidget() });
const addPropertyDecoration = Decoration.widget({
  widget: new AddPropertyWidget(),
  side: 2,
});

/** Decorations of the whole document; it is small. */
const build = (text: string, outline: boolean): Built => {
  const all: Range<Decoration>[] = [];
  const atomic: Range<Decoration>[] = [];
  const known = new Set<string>(VARIABLE_NAMES);

  const decorateText = (
    line: string,
    offset: number,
    from: number,
    stackedChip: boolean,
  ) => {
    const body = line.slice(from);
    const base = offset + from;
    for (const match of body.matchAll(VARIABLE)) {
      const { name, filters } = parseVariable(match[2]);
      const start = base + match.index!;
      const end = start + match[0].length;
      if (outline) {
        const chip = Decoration.replace({
          widget: new ChipWidget(
            name,
            filters,
            known.has(name),
            stackedChip && name === 'content',
          ),
        }).range(start, end);
        all.push(chip);
        atomic.push(chip);
      } else {
        all.push(
          Decoration.mark({
            class: `cm-tpl-chip-text${
              known.has(name) ? '' : ' cm-tpl-chip-unknown'
            }`,
          }).range(start, end),
        );
      }
    }
    if (!outline) return;
    for (const match of body.matchAll(LINK)) {
      const start = base + match.index!;
      const mark = Decoration.mark({ class: 'cm-tpl-punct' });
      all.push(mark.range(start, start + 1));
      const close = start + 1 + match[1].length;
      all.push(mark.range(close, close + 2));
      all.push(
        mark.range(start + match[0].length - 1, start + match[0].length),
      );
    }
  };

  if (!outline) {
    let offset = 0;
    for (const line of text.split('\n')) {
      decorateText(line, offset, 0, false);
      offset += line.length + 1;
    }
    return { decorations: Decoration.set(all, true), atomic: Decoration.none };
  }

  const { rows, blocks } = scan(text);
  for (const row of rows) {
    const block = blocks[row.block];
    const textStart = row.textFrom - row.start;
    const content = row.line.slice(textStart);
    const empty = row.kind === 'block' && content.trim() === '';
    all.push(
      Decoration.line({
        attributes: {
          class: `cm-tpl-row${empty ? ' cm-tpl-empty' : ''}`,
          style: `--d:${block.depth}`,
        },
      }).range(row.start),
    );
    if (textStart > 0) {
      const marker = (
        row.kind === 'block' ? markerDecoration : spacerDecoration
      ).range(row.start, row.textFrom);
      all.push(marker);
      atomic.push(marker);
    }
    decorateText(
      row.line,
      row.start,
      textStart,
      row.kind === 'block' && CONTENT_ALONE.test(content),
    );
    if (row.kind === 'block') {
      const task = TASK.exec(content);
      if (task) {
        all.push(
          Decoration.mark({ class: 'cm-tpl-task' }).range(
            row.textFrom,
            row.textFrom + task[0].length,
          ),
        );
      }
      all.push(addPropertyDecoration.range(row.end));
    } else {
      const property = PROPERTY.exec(content);
      if (property) {
        all.push(
          Decoration.mark({ class: 'cm-tpl-punct' }).range(
            row.textFrom,
            row.textFrom + property[0].length,
          ),
        );
      }
    }
  }
  return {
    decorations: Decoration.set(all, true),
    atomic: Decoration.set(atomic, true),
  };
};

const decorationField = (outline: boolean) =>
  StateField.define<Built>({
    create: (state) => build(state.doc.toString(), outline),
    update: (value, tr) =>
      tr.docChanged ? build(tr.newDoc.toString(), outline) : value,
    provide: (field) => [
      EditorView.decorations.from(field, (built) => built.decorations),
      EditorView.atomicRanges.of((view) => view.state.field(field).atomic),
    ],
  });

// ---- properties -------------------------------------------------------------------

/** The row (line) of the outline at `pos`, read the way the clip reads it. */
const rowAt = (state: EditorState, pos: number) => {
  const layout = scan(state.doc.toString());
  const row = layout.rows[state.doc.lineAt(pos).number - 1];
  return { layout, row };
};

/** Where a row's text starts behind any further indentation. */
const textStart = (state: EditorState, row: Row) =>
  row.textFrom + /^[ \t]*/.exec(state.sliceDoc(row.textFrom, row.end))![0].length;

/** The key of a property line, and where its `::` ends. */
const propertyKey = (state: EditorState, row: Row) => {
  if (row.kind !== 'cont') return null;
  const from = textStart(state, row);
  const match = PROPERTY_KEY.exec(state.sliceDoc(from, row.end));
  return match ? { key: match[1], end: from + match[0].length } : null;
};

const buildBadges = (state: EditorState): DecorationSet => {
  const graph = state.field(graphField);
  if (graph.kind !== 'db' || graph.properties.length === 0) {
    return Decoration.none;
  }
  const badges: Range<Decoration>[] = [];
  for (const row of scan(state.doc.toString()).rows) {
    const property = propertyKey(state, row);
    const type = property && typeOf(graph, property.key);
    if (!property || !type) continue;
    badges.push(
      Decoration.widget({ widget: new TypeWidget(type), side: 1 }).range(
        property.end,
      ),
    );
  }
  return Decoration.set(badges);
};

/** The type badges of a DB graph's properties: decorations, never text. */
const badgeField = StateField.define<DecorationSet>({
  create: buildBadges,
  update: (value, tr) =>
    tr.docChanged || tr.effects.some((effect) => effect.is(setGraph))
      ? buildBadges(tr.state)
      : value,
  provide: (field) => EditorView.decorations.from(field),
});

/**
 * Where a new property line of the block at `pos` goes: behind the block's
 * first line and the property lines right under it. Returns the position and
 * the line's indentation.
 */
const propertySlot = (state: EditorState, pos: number) => {
  const { layout, row } = rowAt(state, pos);
  const block = layout.blocks[row.block];
  const first = layout.rows[block.firstRow];
  let last = block.firstRow;
  while (
    last < block.lastRow &&
    propertyKey(state, layout.rows[last + 1]) !== null
  ) {
    last++;
  }
  // The block's text column: behind `- `, or the first line's indent.
  const indent = first.textFrom - first.start;
  return { at: layout.rows[last].end, indent: ' '.repeat(indent) };
};

/**
 * Adds an empty property line under the block at `pos` (see `propertySlot`)
 * and opens the property names there.
 */
export const addProperty = (view: EditorView, pos: number) => {
  const { at, indent } = propertySlot(view.state, pos);
  const insert = `\n${indent}`;
  view.dispatch({
    changes: { from: at, insert },
    selection: { anchor: at + insert.length },
    userEvent: 'input',
    scrollIntoView: true,
  });
  startCompletion(view);
  view.focus();
};

/** A caret or selection end inside a marker or chip moves out of it. */
const snapSelection = EditorState.transactionFilter.of((tr) => {
  if (!tr.selection && !tr.docChanged) return tr;
  const { atomic } = build(tr.newDoc.toString(), true);
  const snap = (pos: number) => {
    let result = pos;
    atomic.between(pos, pos, (from, to) => {
      if (from < pos && pos < to) {
        result =
          pos - from <= to - pos && !isMarker(tr.newDoc, from) ? from : to;
      }
    });
    return result;
  };
  const { anchor, head } = tr.newSelection.main;
  const nextAnchor = snap(anchor);
  const nextHead = snap(head);
  if (nextAnchor === anchor && nextHead === head) return tr;
  return [
    tr,
    {
      selection: EditorSelection.single(nextAnchor, nextHead),
      sequential: true,
    },
  ];
});

/** Whether the range starting at `from` is a line's marker or indent. */
const isMarker = (doc: EditorState['doc'], from: number) =>
  doc.lineAt(from).from === from;

// ---- placeholder --------------------------------------------------------------------

const placeholderPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet = Decoration.none;

    constructor(view: EditorView) {
      this.decorations = this.build(view);
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.selectionSet || update.focusChanged) {
        this.decorations = this.build(update.view);
      }
    }

    build(view: EditorView): DecorationSet {
      const { rows, blocks } = scan(view.state.doc.toString());
      const emptyBlock = (index: number) => {
        const block = blocks[index];
        const row = rows[block.firstRow];
        return (
          block.firstRow === block.lastRow &&
          row.line.slice(row.textFrom - row.start).trim() === ''
        );
      };
      const only = blocks.length === 1 && emptyBlock(0);
      const caretLine = view.state.doc.lineAt(view.state.selection.main.head);
      const caretRow = rows[caretLine.number - 1];
      const focused =
        view.hasFocus &&
        caretRow !== undefined &&
        caretRow.kind === 'block' &&
        emptyBlock(caretRow.block);
      if (!only && !focused) return Decoration.none;
      const row = only ? rows[0] : caretRow;
      return Decoration.set([
        Decoration.widget({ widget: new PlaceholderWidget(), side: 1 }).range(
          row.end,
        ),
      ]);
    }
  },
  { decorations: (plugin) => plugin.decorations },
);

// ---- commands -----------------------------------------------------------------------

/** The smallest single change from `before` to `after`, or null if equal. */
const diffChange = (before: string, after: string) => {
  if (before === after) return null;
  const max = Math.min(before.length, after.length);
  let start = 0;
  while (start < max && before[start] === after[start]) start++;
  let end = 0;
  while (
    end < max - start &&
    before[before.length - 1 - end] === after[after.length - 1 - end]
  ) {
    end++;
  }
  return {
    from: start,
    to: before.length - end,
    insert: after.slice(start, after.length - end),
  };
};

/** Runs a pure outline command on the document, as one undo step. */
export const runOutline = (
  view: EditorView,
  command: (state: DocState) => DocState | null,
  userEvent: string,
): boolean => {
  const selection = view.state.selection.main;
  const text = view.state.doc.toString();
  const result = command({ text, from: selection.from, to: selection.to });
  if (!result) return false;
  const change = diffChange(text, result.text);
  const inverted = selection.anchor > selection.head;
  const unchanged =
    !change && result.from === selection.from && result.to === selection.to;
  if (unchanged) return true;
  view.dispatch({
    changes: change ?? undefined,
    selection: inverted
      ? EditorSelection.single(result.to, result.from)
      : EditorSelection.single(result.from, result.to),
    userEvent,
    annotations: isolateHistory.of('full'),
    scrollIntoView: true,
  });
  return true;
};

const outlineCommand =
  (command: (state: DocState) => DocState | null, userEvent: string): Command =>
  (view) =>
    // Composition is the input method's: no structural command in the middle.
    !view.composing && runOutline(view, command, userEvent);

const outlineKeymap = keymap.of([
  { key: 'Enter', run: outlineCommand(enter, 'input.enter') },
  { key: 'Shift-Enter', run: outlineCommand(shiftEnter, 'input.newline') },
  { key: 'Tab', run: outlineCommand(indent, 'input.indent') },
  { key: 'Shift-Tab', run: outlineCommand(outdent, 'input.outdent') },
  { key: 'Backspace', run: outlineCommand(backspace, 'delete.backward') },
  { key: 'Delete', run: outlineCommand(deleteForward, 'delete.forward') },
  {
    key: 'Home',
    run: (view) => {
      const target = lineStart({
        text: view.state.doc.toString(),
        from: view.state.selection.main.from,
        to: view.state.selection.main.head,
      });
      view.dispatch({ selection: { anchor: target }, scrollIntoView: true });
      return true;
    },
    shift: (view) => {
      const main = view.state.selection.main;
      const target = lineStart({
        text: view.state.doc.toString(),
        from: main.from,
        to: main.head,
      });
      view.dispatch({ selection: { anchor: main.anchor, head: target } });
      return true;
    },
  },
]);

/** Outline paste: an outline becomes blocks, other multi-line text stays in the block. */
const outlinePaste = EditorView.domEventHandlers({
  paste(event, view) {
    const clip = event.clipboardData?.getData('text/plain');
    if (!clip) return false;
    const handled = runOutline(
      view,
      (state) => paste(state, clip),
      'input.paste',
    );
    if (handled) event.preventDefault();
    return handled;
  },
});

/** Keeps the document canonical whatever edit produced it. */
const keepCanonical = EditorState.transactionFilter.of((tr) => {
  if (!tr.docChanged) return tr;
  const text = tr.newDoc.toString();
  const canonical = normalize(text);
  const change = diffChange(text, canonical);
  if (!change) return tr;
  return [tr, { changes: change, sequential: true }];
});

// ---- Text mode keys -------------------------------------------------------------------

const textKeymap = keymap.of([
  { key: 'Enter', run: insertNewline },
  {
    key: 'Tab',
    run: (view) => {
      const { state } = view;
      const selection = state.selection.main;
      const doc = state.doc;
      const first = doc.lineAt(selection.from);
      const last = doc.lineAt(selection.to);
      if (first.number === last.number) {
        view.dispatch({ ...state.replaceSelection('  '), userEvent: 'input' });
        return true;
      }
      const changes = [];
      for (let n = first.number; n <= last.number; n++) {
        changes.push({ from: doc.line(n).from, insert: '  ' });
      }
      view.dispatch({ changes, userEvent: 'input.indent' });
      return true;
    },
  },
  {
    key: 'Shift-Tab',
    run: (view) => {
      const { state } = view;
      const doc = state.doc;
      const selection = state.selection.main;
      const changes = [];
      for (
        let n = doc.lineAt(selection.from).number;
        n <= doc.lineAt(selection.to).number;
        n++
      ) {
        const line = doc.line(n);
        const spaces = /^ {1,2}/.exec(line.text)?.[0].length ?? 0;
        if (spaces) changes.push({ from: line.from, to: line.from + spaces });
      }
      if (changes.length)
        view.dispatch({ changes, userEvent: 'delete.dedent' });
      return true;
    },
  },
]);

// ---- autocomplete -----------------------------------------------------------------------

const variableSource = (
  context: CompletionContext,
): CompletionResult | null => {
  const match = context.matchBefore(/\{\{-?\s*[\w.]*/);
  if (!match) return null;
  const open = match.from;
  const typed = /^\{\{-?\s*/.exec(match.text)![0].length;
  const samples = variableSamples();
  // In a property's value, only the variables that fit its type.
  const value = valueOf(context.state, open);
  const names = value
    ? variablesFor(typeOf(context.state.field(graphField), value.key))
    : VARIABLE_NAMES;
  return {
    from: open + typed,
    validFor: /^[\w.]*$/,
    options: names.map((name, index) => ({
      label: name,
      // Keeps the list in the order of VARIABLE_NAMES, not alphabetical.
      boost: names.length - index,
      detail: samples[name],
      type: 'variable',
      apply: (view, _completion, _from, to) => {
        const closing = view.state.sliceDoc(to, to + 2) === '}}' ? 2 : 0;
        const insert = `{{${name}}}`;
        view.dispatch({
          changes: { from: open, to: to + closing, insert },
          selection: { anchor: open + insert.length },
          userEvent: 'input.complete',
        });
      },
    })),
  };
};

/** The property whose value `pos` is in, if any. */
const valueOf = (state: EditorState, pos: number) => {
  const { row } = rowAt(state, pos);
  const property = propertyKey(state, row);
  return property && pos >= property.end ? property : null;
};

/** The variables for an empty value behind `key:: `, filtered by its type. */
const valueSource = (context: CompletionContext): CompletionResult | null => {
  const { state, pos } = context;
  const value = valueOf(state, pos);
  if (!value || state.sliceDoc(value.end, pos).trim() !== '') return null;
  // `key::` just typed opens nothing: Enter there is a new line.
  if (pos === value.end && !context.explicit) return null;
  // Right behind `key::`, the value still needs its space.
  const space = pos === value.end ? ' ' : '';
  const samples = variableSamples();
  const names = variablesFor(typeOf(state.field(graphField), value.key));
  return {
    from: pos,
    filter: false,
    options: names.map((name) => ({
      label: `{{${name}}}`,
      detail: samples[name],
      type: 'variable',
      apply: `${space}{{${name}}}`,
    })),
  };
};

/** Items whose name starts with `typed` (any case), then those containing it. */
const matching = <T>(
  items: readonly T[],
  name: (item: T) => string,
  typed: string,
): T[] => {
  const lower = typed.toLowerCase();
  const starts: T[] = [];
  const contains: T[] = [];
  for (const item of items) {
    const text = name(item).toLowerCase();
    if (text.startsWith(lower)) starts.push(item);
    else if (text.includes(lower)) contains.push(item);
  }
  return [...starts, ...contains];
};

/** What can be typed as a property name. */
const NAME = /^[^\s:#{}[\]]*$/;

/**
 * Property names: on a line inside a block (not its first line) while its
 * first word is typed, or after `::` typed on its own. `::` on the first line
 * of a block, or behind other text, adds the property line under the block.
 * Accepting a name writes `name:: ` and opens the values.
 */
const propertySource = (
  context: CompletionContext,
): CompletionResult | null => {
  const { state, pos, explicit } = context;
  const { layout, row } = rowAt(state, pos);
  const start = row.kind === 'cont' ? textStart(state, row) : row.textFrom;
  if (pos < start) return null;
  const before = state.sliceDoc(start, pos);
  const graph = state.field(graphField);
  // The block's other properties are not offered again.
  const block = layout.blocks[row.block];
  const taken = new Set<string>();
  for (let index = block.firstRow; index <= block.lastRow; index++) {
    const other = layout.rows[index];
    const property = other === row ? null : propertyKey(state, other);
    if (property) taken.add(property.key.toLowerCase());
  }
  // A title with white space cannot be the `key::` of a line.
  const usable = graph.properties.filter(
    (property) =>
      !/\s/.test(property.title) && !taken.has(property.title.toLowerCase()),
  );
  const option = (property: GraphProperty): Completion => ({
    label: property.title,
    detail: graph.kind === 'db' ? property.type : undefined,
    type: 'property',
  });

  if (/(^|\s)::$/.test(before)) {
    if (usable.length === 0) return null;
    const ownLine = row.kind === 'cont' && before === '::';
    const apply = (name: string) => (view: EditorView) => {
      if (ownLine) {
        view.dispatch({
          changes: { from: pos - 2, to: pos, insert: `${name}:: ` },
          selection: { anchor: pos - 2 + name.length + 3 },
          userEvent: 'input.complete',
        });
      } else {
        // The `::` goes, with the space before it.
        const from = pos - /\s*::$/.exec(before)![0].length;
        const { at, indent } = propertySlot(view.state, pos);
        const changes = view.state.changes([
          { from, to: pos, insert: '' },
          { from: at, insert: `\n${indent}${name}:: ` },
        ]);
        view.dispatch({
          changes,
          selection: { anchor: changes.mapPos(at, 1) },
          userEvent: 'input.complete',
          scrollIntoView: true,
        });
      }
      startCompletion(view);
    };
    return {
      from: pos,
      filter: false,
      options: usable.map((property) => ({
        ...option(property),
        apply: apply(property.title),
      })),
    };
  }

  if (row.kind !== 'cont' || !NAME.test(before)) return null;
  if (!before && !explicit) return null;
  const rest = state.sliceDoc(pos, row.end);
  const tail = /^[^\s:#{}[\]]*/.exec(rest)![0];
  // A key that has its `::` already: only the name changes.
  const keyed = rest.slice(tail.length).startsWith('::');
  const apply = (name: string) => (view: EditorView) => {
    const insert = keyed ? name : `${name}:: `;
    view.dispatch({
      changes: { from: start, to: pos + tail.length, insert },
      selection: { anchor: start + insert.length },
      userEvent: 'input.complete',
    });
    if (!keyed) startCompletion(view);
  };
  const found = matching(usable, (property) => property.title, before);
  // Text in a block opens nothing unless it starts a property's name.
  const lower = before.toLowerCase();
  if (
    !explicit &&
    !found.some((p) => p.title.toLowerCase().startsWith(lower))
  ) {
    return null;
  }
  const options: Completion[] = found.map((property) => ({
    ...option(property),
    apply: apply(property.title),
  }));
  if (before && !found.some((p) => p.title.toLowerCase() === lower)) {
    options.push({ label: `New ${before}`, type: 'new', apply: apply(before) });
  }
  if (options.length === 0) return null;
  return { from: start, filter: false, options };
};

/** `#Name`, or `#[[Name]]` when the name is not a single word. */
const tagText = (name: string) =>
  /^[^\s#,.!?;:"'()[\]{}`]+$/.test(name) ? `#${name}` : `#[[${name}]]`;

/** Tags after a `#` at the start of a line or behind white space. */
const tagSource = (context: CompletionContext): CompletionResult | null => {
  const match = context.matchBefore(
    /(?<=^|\s)#(?:\[\[[^\]\n]*|[^\s#,[\]{}]*)/,
  );
  if (!match) return null;
  const bracket = match.text.startsWith('#[[');
  const typed = match.text.slice(bracket ? 3 : 1).trim();
  const apply =
    (name: string) =>
    (view: EditorView, _completion: Completion, _from: number, to: number) => {
      const closing =
        bracket && view.state.sliceDoc(to, to + 2) === ']]' ? 2 : 0;
      const insert = tagText(name);
      view.dispatch({
        changes: { from: match.from, to: to + closing, insert },
        selection: { anchor: match.from + insert.length },
        userEvent: 'input.complete',
      });
    };
  const found = matching(
    context.state.field(graphField).tags,
    (tag) => tag.name,
    typed,
  );
  const options: Completion[] = found.map((tag) => ({
    label: tag.name,
    type: 'tag',
    apply: apply(tag.name),
  }));
  const lower = typed.toLowerCase();
  if (typed && !found.some((tag) => tag.name.toLowerCase() === lower)) {
    options.push({ label: `New #${typed}`, type: 'new', apply: apply(typed) });
  }
  if (options.length === 0) return null;
  return { from: match.from, filter: false, options };
};

// ---- theme ------------------------------------------------------------------------------

const mono =
  "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace";
const tint = (color: string, percent: number) =>
  `color-mix(in oklab, var(${color}) ${percent}%, transparent)`;

const theme = EditorView.theme({
  '&': {
    backgroundColor: 'transparent',
    color: 'var(--foreground)',
    minHeight: '12rem',
  },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': {
    fontFamily: 'inherit',
    fontSize: 'inherit',
    lineHeight: '1.65',
  },
  '.cm-content': {
    padding: '0.5rem 0.25rem',
    caretColor: 'var(--foreground)',
  },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--foreground)' },
  '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground':
    { backgroundColor: tint('--primary', 28) },
  '.cm-activeLine': { backgroundColor: 'transparent' },
  '.cm-line': { padding: '0 0.5rem' },

  // Outline rows: the bullet column hangs left of the text, a guide line runs
  // under every ancestor's bullet.
  '.cm-tpl-row': {
    paddingLeft: 'calc(var(--d) * 24px + 18px + 0.5rem)',
    textIndent: '-18px',
    paddingTop: '1px',
    paddingBottom: '1px',
    backgroundImage:
      'repeating-linear-gradient(to right, transparent 0, transparent 8px, var(--border) 8px, var(--border) 9px, transparent 9px, transparent 24px)',
    backgroundSize: 'calc(var(--d) * 24px) 100%',
    backgroundRepeat: 'no-repeat',
    backgroundPositionX: '0.5rem',
  },
  '.cm-tpl-bullet, .cm-tpl-spacer': {
    display: 'inline-block',
    width: '18px',
    textIndent: '0',
    verticalAlign: 'baseline',
    textAlign: 'center',
  },
  '.cm-tpl-dot': {
    display: 'inline-block',
    width: '6px',
    height: '6px',
    borderRadius: '9999px',
    backgroundColor: 'var(--muted-foreground)',
    verticalAlign: 'middle',
    opacity: '0.75',
  },

  // Variables.
  '.cm-tpl-chip, .cm-tpl-chip-text': {
    fontFamily: mono,
    fontSize: '0.85em',
    textIndent: '0',
    color: 'var(--primary)',
    backgroundColor: tint('--primary', 14),
    boxShadow: `inset 0 0 0 1px ${tint('--primary', 26)}`,
    borderRadius: '0.25rem',
    padding: '0.05em 0.4em',
  },
  '.cm-tpl-chip': {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.3em',
    verticalAlign: 'baseline',
    margin: '0 0.05em',
  },
  '.cm-tpl-chip-icon': { width: '0.95em', height: '0.95em', flex: 'none' },
  '.cm-tpl-chip-filters': { color: 'var(--muted-foreground)' },
  '.cm-tpl-chip-unknown': {
    color: 'var(--destructive)',
    backgroundColor: tint('--destructive', 12),
    boxShadow: `inset 0 0 0 1px ${tint('--destructive', 30)}`,
  },
  '.cm-tpl-chip-text': { padding: '0.05em 0.1em' },

  // Markdown, task markers and properties.
  '.cm-tpl-punct': { color: 'var(--muted-foreground)' },
  '.cm-tpl-task': {
    fontSize: '0.75em',
    fontWeight: '600',
    letterSpacing: '0.04em',
    padding: '0.1em 0.5em',
    borderRadius: '9999px',
    color: 'var(--muted-foreground)',
    backgroundColor: 'var(--muted)',
    boxShadow: 'inset 0 0 0 1px var(--border)',
  },
  '.cm-tpl-placeholder': {
    display: 'inline-block',
    width: '0',
    whiteSpace: 'nowrap',
    pointerEvents: 'none',
    textIndent: '0',
    color: 'var(--muted-foreground)',
    opacity: '0.7',
  },
  '.cm-tpl-type': {
    display: 'inline-block',
    marginLeft: '0.35em',
    padding: '0 0.4em',
    fontFamily: mono,
    fontSize: '0.7em',
    lineHeight: '1.5',
    textIndent: '0',
    verticalAlign: 'middle',
    borderRadius: '0.25rem',
    color: 'var(--muted-foreground)',
    backgroundColor: tint('--muted-foreground', 10),
    boxShadow: `inset 0 0 0 1px ${tint('--muted-foreground', 18)}`,
    userSelect: 'none',
  },
  '.cm-tpl-add-prop': {
    display: 'inline-block',
    marginLeft: '0.75rem',
    padding: '0 0.45em',
    fontSize: '0.75em',
    lineHeight: '1.6',
    textIndent: '0',
    verticalAlign: 'middle',
    borderRadius: '0.25rem',
    color: 'var(--muted-foreground)',
    cursor: 'pointer',
    userSelect: 'none',
    opacity: '0',
    transition: 'opacity 120ms',
  },
  '.cm-line:hover .cm-tpl-add-prop': { opacity: '1' },
  '.cm-tpl-add-prop:hover': {
    color: 'var(--primary)',
    backgroundColor: tint('--primary', 14),
  },
  '.cm-tpl-empty .cm-tpl-add-prop': { display: 'none' },

  // Autocomplete.
  '.cm-tooltip': {
    backgroundColor: 'var(--popover)',
    color: 'var(--popover-foreground)',
    border: '1px solid var(--border)',
    borderRadius: '0.5rem',
    boxShadow: '0 6px 20px rgb(0 0 0 / 0.12)',
    overflow: 'hidden',
  },
  '.cm-tooltip.cm-tooltip-autocomplete > ul': {
    fontFamily: mono,
    fontSize: '0.8125rem',
    minWidth: '15rem',
    padding: '0.25rem',
    maxHeight: '14rem',
  },
  '.cm-tooltip.cm-tooltip-autocomplete > ul > li': {
    display: 'flex',
    alignItems: 'baseline',
    gap: '1.5rem',
    padding: '0.25rem 0.5rem',
    borderRadius: '0.25rem',
    lineHeight: '1.4',
  },
  '.cm-tooltip.cm-tooltip-autocomplete > ul > li[aria-selected]': {
    backgroundColor: 'var(--accent)',
    color: 'var(--accent-foreground)',
  },
  '.cm-tooltip-autocomplete .cm-completionLabel': { flex: 'none' },
  '.cm-tooltip-autocomplete .cm-tpl-new': { color: 'var(--muted-foreground)' },
  '.cm-tooltip-autocomplete .cm-completionMatchedText': {
    textDecoration: 'none',
    fontWeight: '600',
    color: 'var(--primary)',
  },
  '.cm-tooltip-autocomplete .cm-completionDetail': {
    marginLeft: 'auto',
    fontStyle: 'normal',
    color: 'var(--muted-foreground)',
    fontFamily: 'inherit',
    maxWidth: '12rem',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
});

// ---- assembly -----------------------------------------------------------------------------

const shared = (graph: EditorGraph): Extension[] => [
  graphField.init(() => graph),
  badgeField,
  theme,
  history(),
  EditorView.lineWrapping,
  EditorView.contentAttributes.of({
    id: 'template-content',
    'aria-labelledby': 'template-content-label',
    spellcheck: 'false',
    autocapitalize: 'off',
    autocorrect: 'off',
  }),
  autocompletion({
    override: [variableSource, valueSource, propertySource, tagSource],
    icons: false,
    optionClass: (completion) => (completion.type === 'new' ? 'cm-tpl-new' : ''),
    closeOnBlur: true,
    maxRenderedOptions: 8,
  }),
  Prec.highest(keymap.of([{ key: 'Tab', run: acceptCompletion }])),
  keymap.of([
    ...historyKeymap,
    ...defaultKeymap.filter((binding) => binding.key !== 'Escape'),
    // Escape, then Tab, moves focus on.
    { key: 'Escape', run: temporarilySetTabFocusMode },
  ]),
];

export const outlineExtensions = (graph = NO_GRAPH): Extension[] => {
  return [
    ...shared(graph),
    decorationField(true),
    snapSelection,
    keepCanonical,
    placeholderPlugin,
    outlinePaste,
    Prec.high(outlineKeymap),
  ];
};

export const textExtensions = (graph = NO_GRAPH): Extension[] => [
  ...shared(graph),
  decorationField(false),
  Prec.high(textKeymap),
];

export { diffChange };
