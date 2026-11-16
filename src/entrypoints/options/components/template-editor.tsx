import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { Label } from '@/components/ui/label';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { countRoots } from '@/utils/clip-template';
import { isLossless, toCanonical, toStored } from '@/utils/outline-doc';
import {
  External,
  outlineExtensions,
  textExtensions,
} from './template-editor-extensions';

type Mode = 'outline' | 'text';

export interface TemplateEditorHandle {
  /** Puts `{{name}}` at the caret (over the selection), the caret behind it. */
  insertVariable: (name: string) => void;
}

interface TemplateEditorProps {
  /** The template text as stored. */
  value: string;
  /** The stored form of every change the user makes. */
  onChange: (stored: string) => void;
}

/**
 * The template's content. The CodeMirror document is the template text, so
 * nothing is migrated: Outline mode shows it as blocks (`outline-doc.ts`), Text
 * mode as it is stored. A template the outline would change opens in Text.
 *
 * A clip has one top-level block: Outline mode cannot make a second one, and
 * Text that parses to several shows an error and is not passed to `onChange`
 * until it is fixed. A stored template that already has several opens in Text
 * with the error, and is not written.
 *
 * Nothing is written on open; `onChange` only follows edits by the user.
 */
export const TemplateEditor = forwardRef<
  TemplateEditorHandle,
  TemplateEditorProps
>(({ value, onChange }, ref) => {
  const [mode, setMode] = useState<Mode>(() =>
    isLossless(value) ? 'outline' : 'text',
  );
  const canOutline = useMemo(() => isLossless(value), [value]);
  const [tooManyRoots, setTooManyRoots] = useState(() => countRoots(value) > 1);
  // Text the page has not been given because of the error, and the value the
  // page had then: that value is not an update to show.
  const heldBack = useRef<string | null>(null);
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const viewMode = useRef<Mode>(mode);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const valueRef = useRef(value);
  valueRef.current = value;

  /** The stored form of what the editor shows. */
  const storedOf = (editor: EditorView, as: Mode) => {
    const doc = editor.state.doc.toString();
    return as === 'outline' ? toStored(doc) : doc;
  };

  const createState = useCallback((as: Mode, stored: string) => {
    const doc = as === 'outline' ? toCanonical(stored) : stored;
    return EditorState.create({
      doc,
      selection: { anchor: doc.length },
      extensions: [
        as === 'outline' ? outlineExtensions() : textExtensions(),
        EditorView.updateListener.of((update) => {
          if (!update.docChanged) return;
          if (update.transactions.some((tr) => tr.annotation(External))) return;
          const stored =
            as === 'outline'
              ? toStored(update.state.doc.toString())
              : update.state.doc.toString();
          if (countRoots(stored) > 1) {
            heldBack.current = valueRef.current;
            setTooManyRoots(true);
            return;
          }
          heldBack.current = null;
          setTooManyRoots(false);
          onChangeRef.current(stored);
        }),
      ],
    });
  }, []);

  useEffect(() => {
    const editor = new EditorView({
      state: createState(viewMode.current, valueRef.current),
      parent: host.current!,
    });
    view.current = editor;
    return () => {
      editor.destroy();
      view.current = null;
    };
  }, [createState]);

  // A value that did not come from this editor (another template opened, the
  // stored one changed elsewhere) replaces the document. The echo of the
  // user's own edit equals what the editor shows and is left alone, so the
  // caret stays where it is.
  useEffect(() => {
    const editor = view.current;
    if (!editor || value === storedOf(editor, viewMode.current)) return;
    if (heldBack.current !== null && value === heldBack.current) return;
    heldBack.current = null;
    setTooManyRoots(countRoots(value) > 1);
    const next: Mode =
      viewMode.current === 'outline' && !isLossless(value)
        ? 'text'
        : viewMode.current;
    viewMode.current = next;
    setMode(next);
    editor.setState(createState(next, value));
  }, [value, createState]);

  const switchTo = (next: Mode) => {
    const editor = view.current;
    if (!editor || next === viewMode.current) return;
    const stored = storedOf(editor, viewMode.current);
    if (next === 'outline' && !isLossless(stored)) return;
    viewMode.current = next;
    setMode(next);
    editor.setState(createState(next, stored));
    editor.focus();
  };

  useImperativeHandle(ref, () => ({
    insertVariable: (name: string) => {
      const editor = view.current;
      if (!editor) return;
      const insert = `{{${name}}}`;
      const { from, to } = editor.state.selection.main;
      editor.dispatch({
        changes: { from, to, insert },
        selection: { anchor: from + insert.length },
        userEvent: 'input',
        scrollIntoView: true,
      });
      editor.focus();
    },
  }));

  const segment = (target: Mode, label: string, disabled = false) => {
    const button = (
      <button
        type="button"
        aria-pressed={mode === target}
        disabled={disabled}
        onClick={() => switchTo(target)}
        className={cn(
          'rounded px-2.5 py-1 text-xs font-medium transition-colors',
          'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
          mode === target
            ? 'bg-background text-foreground shadow-sm'
            : 'text-muted-foreground hover:text-foreground',
          disabled &&
            'cursor-not-allowed opacity-50 hover:text-muted-foreground',
        )}
      >
        {label}
      </button>
    );
    if (!disabled) return button;
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex" tabIndex={0}>
            {button}
          </span>
        </TooltipTrigger>
        <TooltipContent>Not a plain outline</TooltipContent>
      </Tooltip>
    );
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <Label id="template-content-label">Content</Label>
        <div
          role="group"
          aria-label="Editor mode"
          className="inline-flex gap-0.5 rounded-md bg-muted p-0.5"
        >
          {segment(
            'outline',
            'Outline',
            (!canOutline || tooManyRoots) && mode !== 'outline',
          )}
          {segment('text', 'Text')}
        </div>
      </div>
      <div
        ref={host}
        data-testid="template-editor"
        data-mode={mode}
        className={cn(
          'min-h-48 w-full rounded-md border border-input bg-transparent text-sm shadow-sm',
          'focus-within:ring-1 focus-within:ring-ring',
          mode === 'text' && 'font-mono',
        )}
      />
      {tooManyRoots && (
        <p role="alert" className="text-sm text-destructive">
          One top-level block only
        </p>
      )}
    </div>
  );
});
TemplateEditor.displayName = 'TemplateEditor';
