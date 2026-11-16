/**
 * CodeMirror extensions of the template editor. The document is the template
 * text; Outline mode is decorations and keymaps over it (see `outline-doc.ts`
 * for the text model and the editing commands), Text mode only highlights.
 */
import {
  Annotation,
  EditorSelection,
  EditorState,
  Prec,
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
  type CompletionContext,
  type CompletionResult,
} from '@codemirror/autocomplete';
import { format } from 'date-fns';
import { logseqTimeFormat } from '@/utils/logseq-format';
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
} from '@/utils/outline-doc';

// ---- variables ----------------------------------------------------------------

export const VARIABLE_NAMES = [
  'title',
  'url',
  'content',
  'date',
  'time',
  'dt',
] as const;

/** What each variable shows in the completion list. */
export const variableSamples = (now = new Date()): Record<string, string> => ({
  title: 'Sample page',
  url: 'example.com/article',
  content: 'selection',
  date: format(now, 'MMM do, yyyy'),
  time: logseqTimeFormat(now),
  dt: format(now, 'yyyy-MM-dd HH:mm'),
});

/** Marks a transaction that replaces the document from outside the user. */
export const External = Annotation.define<boolean>();

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

// ---- decorations ------------------------------------------------------------------

const VARIABLE = /\{\{(-?)([^{}\n]*?)(-?)\}\}/g;
const LINK = /\[([^\]\n]*)\]\(([^)\n]*)\)/g;
const TASK = /^(TODO|LATER|NOW|DOING|DONE)(?= |$)/;
const PROPERTY = /^[A-Za-z_][\w-]*::(?= |$)/;
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
  return {
    from: open + typed,
    validFor: /^[\w.]*$/,
    options: VARIABLE_NAMES.map((name, index) => ({
      label: name,
      // Keeps the list in the order of VARIABLE_NAMES, not alphabetical.
      boost: VARIABLE_NAMES.length - index,
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

const shared = (): Extension[] => [
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
    override: [variableSource],
    icons: false,
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

export const outlineExtensions = (): Extension[] => {
  return [
    ...shared(),
    decorationField(true),
    snapSelection,
    keepCanonical,
    placeholderPlugin,
    outlinePaste,
    Prec.high(outlineKeymap),
  ];
};

export const textExtensions = (): Extension[] => [
  ...shared(),
  decorationField(false),
  Prec.high(textKeymap),
];

export { diffChange };
