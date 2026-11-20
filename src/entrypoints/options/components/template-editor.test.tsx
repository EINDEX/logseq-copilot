import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { EditorView } from '@codemirror/view';
import {
  deleteCharBackward,
  deleteCharForward,
  undo,
} from '@codemirror/commands';
import {
  acceptCompletion,
  completionStatus,
  currentCompletions,
  startCompletion,
} from '@codemirror/autocomplete';
import { TemplateEditor } from './template-editor';
import {
  VARIABLE_NAMES,
  variableSamples,
  type EditorGraph,
} from './template-editor-extensions';

afterEach(() => {
  cleanup();
});

const editor = () =>
  EditorView.findFromDOM(document.querySelector('.cm-editor') as HTMLElement)!;
const doc = () => editor().state.doc.toString();

/** Puts the caret at `|` of `marked` and returns the plain text. */
const setDoc = (marked: string) => {
  const caret = marked.indexOf('|');
  act(() => {
    editor().dispatch({
      changes: { from: 0, to: doc().length, insert: marked.replace('|', '') },
      selection: { anchor: caret },
      annotations: [],
    });
  });
};

const press = (key: string, init: KeyboardEventInit = {}) => {
  const codes: Record<string, number> = {
    Enter: 13,
    Tab: 9,
    Backspace: 8,
    Delete: 46,
    Escape: 27,
    ArrowDown: 40,
  };
  act(() => {
    fireEvent.keyDown(editor().contentDOM, {
      key,
      keyCode: codes[key],
      ...init,
    });
  });
};

const mount = (value: string, onChange = vi.fn(), graph?: EditorGraph) => {
  render(<TemplateEditor value={value} onChange={onChange} graph={graph} />);
  return onChange;
};

describe('TemplateEditor display', () => {
  it('shows each block with a bullet, its depth and guide lines', () => {
    mount('- a\n  - b\n    note\n  - c');
    const rows = [...document.querySelectorAll<HTMLElement>('.cm-tpl-row')];
    expect(rows.map((row) => row.style.getPropertyValue('--d'))).toEqual([
      '0',
      '1',
      '1',
      '1',
    ]);
    expect(document.querySelectorAll('.cm-tpl-bullet')).toHaveLength(3);
    expect(document.querySelectorAll('.cm-tpl-spacer')).toHaveLength(1);
    expect(doc()).toBe('- a\n  - b\n    note\n  - c');
  });

  it('shows variables as chips, filters inside, unknown names flagged', () => {
    mount('- {{title}} {{ date | upcase }} {{nope}} {{unclosed\n  - b');
    const chips = [...document.querySelectorAll<HTMLElement>('.cm-tpl-chip')];
    expect(chips.map((chip) => chip.dataset.variable)).toEqual([
      'title',
      'date',
      'nope',
    ]);
    expect(chips[1].querySelector('.cm-tpl-chip-filters')?.textContent).toBe(
      ' | upcase',
    );
    expect(chips[2].classList.contains('cm-tpl-chip-unknown')).toBe(true);
    expect(chips[0].classList.contains('cm-tpl-chip-unknown')).toBe(false);
    // The unclosed `{{` stays text.
    expect(document.body.textContent).toContain('{{unclosed');
  });

  it('marks {{content}} alone in its block with the split icon', () => {
    mount('- [{{title}}]({{url}})\n  - {{content}}\n  - Quote: {{content}}');
    const chips = [
      ...document.querySelectorAll<HTMLElement>('[data-variable="content"]'),
    ];
    expect(chips).toHaveLength(2);
    expect(chips[0].dataset.split).toBe('true');
    expect(chips[0].querySelector('svg')).toBeTruthy();
    expect(chips[1].dataset.split).toBeUndefined();
  });

  it('mutes the link punctuation, marks tasks and properties', () => {
    mount('- TODO [{{title}}]({{url}})\n  source:: {{url}}\n  - b');
    const punct = [...document.querySelectorAll('.cm-tpl-punct')].map(
      (node) => node.textContent,
    );
    expect(punct).toEqual(['[', '](', ')', 'source::']);
    expect(document.querySelector('.cm-tpl-task')?.textContent).toBe('TODO');
  });

  it('keeps the document text as stored plain text', () => {
    mount('- TODO [{{title}}]({{url}})\n  - {{content}}');
    expect(doc()).toBe('- TODO [{{title}}]({{url}})\n  - {{content}}');
  });

  it('shows the placeholder in an empty editor only', () => {
    mount('');
    expect(document.querySelector('.cm-tpl-placeholder')?.textContent).toBe(
      'Type {{ to add a variable',
    );
    cleanup();
    mount('- a');
    expect(document.querySelector('.cm-tpl-placeholder')).toBeNull();
  });

  it('highlights chips in Text mode without making them atomic', () => {
    mount('intro\n- a {{title}}');
    expect(document.querySelector('.cm-tpl-chip-text')?.textContent).toBe(
      '{{title}}',
    );
    expect(document.querySelector('.cm-tpl-chip')).toBeNull();
    expect(document.querySelector('.cm-tpl-bullet')).toBeNull();
  });
});

describe('TemplateEditor keys', () => {
  it('Enter on the root adds a child, never a second root', () => {
    const onChange = mount('- a\n  - b');
    setDoc('- hello|');
    press('Enter');
    expect(doc()).toBe('- hello\n  - ');
    expect(onChange).toHaveBeenLastCalledWith('- hello\n  - ');
    press('Tab');
    expect(doc()).toBe('- hello\n  - ');
  });

  it('Enter in a child adds a sibling, Tab nests it', () => {
    mount('- a\n  - b');
    setDoc('- a\n  - hello|');
    press('Enter');
    expect(doc()).toBe('- a\n  - hello\n  - ');
    press('Tab');
    expect(doc()).toBe('- a\n  - hello\n    - ');
  });

  it('keeps Tab in the editor when the block cannot go deeper', () => {
    mount('- a\n  - b');
    setDoc('- hello\n  - child|');
    const event = new KeyboardEvent('keydown', {
      key: 'Tab',
      keyCode: 9,
      bubbles: true,
      cancelable: true,
    });
    act(() => {
      editor().contentDOM.dispatchEvent(event);
    });
    expect(event.defaultPrevented).toBe(true);
    expect(doc()).toBe('- hello\n  - child');
  });

  it('Shift+Tab outdents, Shift+Enter adds a line in the block', () => {
    mount('- a\n  - b');
    setDoc('- a\n  - x\n    - b|');
    press('Tab', { shiftKey: true });
    expect(doc()).toBe('- a\n  - x\n  - b');
    press('Enter', { shiftKey: true });
    expect(doc()).toBe('- a\n  - x\n  - b\n    ');
  });

  it('Shift+Tab does not outdent a child to the top level', () => {
    mount('- a\n  - b');
    setDoc('- a\n  - b|');
    press('Tab', { shiftKey: true });
    expect(doc()).toBe('- a\n  - b');
  });

  it('Backspace at the start of a block merges it up', () => {
    mount('- a\n  - b');
    setDoc('- ab\n  - |cd');
    press('Backspace');
    expect(doc()).toBe('- abcd');
    expect(editor().state.selection.main.head).toBe(4);
  });

  it('Delete at the end of a block merges the next one in', () => {
    mount('- a\n  - b');
    setDoc('- ab|\n  - cd');
    press('Delete');
    expect(doc()).toBe('- abcd');
  });

  it('undo reverses a structural edit in one step', () => {
    mount('- a\n  - b');
    setDoc('- ab\n  - c|');
    press('Enter');
    expect(doc()).toBe('- ab\n  - c\n  - ');
    act(() => {
      undo(editor());
    });
    expect(doc()).toBe('- ab\n  - c');
  });

  it('pastes an outline as blocks and other text into the block', () => {
    mount('- a\n  - b');
    setDoc('- a|');
    const paste = (text: string) =>
      act(() => {
        const event = new Event('paste', { bubbles: true, cancelable: true });
        Object.defineProperty(event, 'clipboardData', {
          value: { getData: () => text },
        });
        editor().contentDOM.dispatchEvent(event);
      });
    paste('* x\n\t* y');
    expect(doc()).toBe('- a\n  - x\n    - y');
    setDoc('- a|');
    paste('one\ntwo');
    expect(doc()).toBe('- aone\n  two');
  });

  it('Text mode: Tab inserts two spaces', () => {
    mount('intro\n- x');
    setDoc('in|tro\n- x');
    press('Tab');
    expect(doc()).toBe('in  tro\n- x');
  });
});

describe('TemplateEditor chips', () => {
  it('Backspace and Delete next to a chip remove the whole chip', () => {
    mount('- a {{title}} b\n  - c');
    const view = editor();
    setDoc('- a {{title}}| b');
    act(() => {
      deleteCharBackward(view);
    });
    expect(doc()).toBe('- a  b');

    setDoc('- a |{{title}} b');
    act(() => {
      deleteCharForward(view);
    });
    expect(doc()).toBe('- a  b');
  });

  it('keeps the caret out of the marker and out of a chip', () => {
    mount('- a {{title}} b\n  - c');
    act(() => {
      editor().dispatch({ selection: { anchor: 1 } });
    });
    expect(editor().state.selection.main.head).toBe(2);
    act(() => {
      editor().dispatch({ selection: { anchor: 6 } });
    });
    expect([4, 13]).toContain(editor().state.selection.main.head);
  });

  it('repairs an edit that breaks the outline', () => {
    mount('- a\n  - b');
    act(() => {
      editor().dispatch({ changes: { from: 0, to: 4, insert: '' } });
    });
    expect(doc()).toBe('- b');
  });
});

describe('TemplateEditor autocomplete', () => {
  const type = (text: string) =>
    act(() => {
      const head = editor().state.selection.main.head;
      editor().dispatch({
        changes: { from: head, insert: text },
        selection: { anchor: head + text.length },
        userEvent: 'input.type',
      });
    });
  const settle = () =>
    act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 250));
    });

  it('lists the variables with sample values after {{', async () => {
    mount('');
    type('{{');
    await settle();
    expect(completionStatus(editor().state)).toBe('active');
    const options = currentCompletions(editor().state);
    expect(options.map((option) => option.label)).toEqual([...VARIABLE_NAMES]);
    const samples = variableSamples();
    expect(options.map((option) => option.detail)).toEqual(
      VARIABLE_NAMES.map((name) => samples[name]),
    );
  });

  it('narrows as you type and inserts {{name}} with the caret behind it', async () => {
    const onChange = mount('a ');
    setDoc('- a |');
    type('{{con');
    await settle();
    expect(currentCompletions(editor().state).map((o) => o.label)).toEqual([
      'content',
    ]);
    act(() => {
      acceptCompletion(editor());
    });
    expect(doc()).toBe('- a {{content}}');
    expect(editor().state.selection.main.head).toBe(doc().length);
    expect(onChange).toHaveBeenLastCalledWith('a {{content}}');
    expect(document.querySelector('[data-variable="content"]')).toBeTruthy();
  });

  it('Escape closes the list', async () => {
    mount('');
    type('{{');
    await settle();
    expect(completionStatus(editor().state)).toBe('active');
    press('Escape');
    expect(completionStatus(editor().state)).toBeNull();
  });
});

describe('TemplateEditor properties and tags', () => {
  const DB: EditorGraph = {
    kind: 'db',
    properties: [
      { title: 'source', type: 'url' },
      { title: 'read-on', type: 'date' },
      { title: 'rating', type: 'number' },
      { title: 'Has Spaces', type: 'default' },
    ],
    tags: [
      { name: 'Reading', uuid: 'u1' },
      { name: 'Read Later', uuid: 'u2' },
      { name: 'Project', uuid: 'u3' },
    ],
  };
  const FILE: EditorGraph = {
    kind: 'file',
    properties: [{ title: 'source' }, { title: 'type' }],
    tags: [{ name: 'Reading' }],
  };

  const type = (text: string) =>
    act(() => {
      const head = editor().state.selection.main.head;
      editor().dispatch({
        changes: { from: head, insert: text },
        selection: { anchor: head + text.length },
        userEvent: 'input.type',
      });
    });
  const settle = () =>
    act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 250));
    });
  const labels = () => currentCompletions(editor().state).map((o) => o.label);
  const details = () =>
    currentCompletions(editor().state).map((o) => o.detail);
  const accept = (label: string) =>
    act(() => {
      const view = editor();
      const options = currentCompletions(view.state);
      const index = options.findIndex((option) => option.label === label);
      expect(index).toBeGreaterThanOrEqual(0);
      for (let i = 0; i < index; i++) press('ArrowDown');
      acceptCompletion(view);
    });
  const explicit = () =>
    act(() => {
      startCompletion(editor());
    });
  const badges = () =>
    [...document.querySelectorAll<HTMLElement>('.cm-tpl-type')].map(
      (badge) => badge.textContent,
    );

  describe('property names', () => {
    it('lists matching properties with their type on a DB graph, New last', async () => {
      mount('- a', vi.fn(), DB);
      setDoc('- a\n  s|');
      type('o');
      await settle();
      expect(labels()).toEqual(['source', 'New so']);
      expect(details()).toEqual(['url', undefined]);
    });

    it('shows no type on a file graph', async () => {
      mount('- a', vi.fn(), FILE);
      setDoc('- a\n  |');
      type('s');
      await settle();
      expect(labels()).toEqual(['source', 'New s']);
      expect(details()).toEqual([undefined, undefined]);
    });

    it('accepting a name writes `name:: ` and opens the values', async () => {
      const onChange = mount('- a', vi.fn(), DB);
      setDoc('- a\n  re|');
      type('a');
      await settle();
      accept('read-on');
      expect(doc()).toBe('- a\n  read-on:: ');
      expect(editor().state.selection.main.head).toBe(doc().length);
      expect(onChange).toHaveBeenLastCalledWith('- a\n  read-on:: ');
      await settle();
      expect(labels()).toEqual(['{{date}}', '{{time}}']);
    });

    it('New writes the typed name as a property', async () => {
      mount('- a', vi.fn(), DB);
      setDoc('- a\n  |');
      explicit();
      type('source-page');
      await settle();
      expect(labels()).toEqual(['New source-page']);
      accept('New source-page');
      expect(doc()).toBe('- a\n  source-page:: ');
    });

    it('`::` at the start of a line lists every property', async () => {
      mount('- a', vi.fn(), DB);
      setDoc('- a\n  |');
      type('::');
      await settle();
      // A title with white space cannot be a `key::` of the text.
      expect(labels()).toEqual(['source', 'read-on', 'rating']);
      accept('rating');
      expect(doc()).toBe('- a\n  rating:: ');
    });

    it('`::` typed on the first line of a block adds the property under it', async () => {
      mount('- a', vi.fn(), DB);
      setDoc('- a |\n  source:: x\n  - b');
      type('::');
      await settle();
      accept('rating');
      expect(doc()).toBe('- a\n  source:: x\n  rating:: \n  - b');
      expect(editor().state.selection.main.head).toBe(
        '- a\n  source:: x\n  rating:: '.length,
      );
    });

    it('works in Text mode on a line inside a block', async () => {
      mount('intro\n- a', vi.fn(), DB);
      setDoc('intro\n- a\n  |');
      type('so');
      await settle();
      expect(labels()).toEqual(['source', 'New so']);
      accept('source');
      expect(doc()).toBe('intro\n- a\n  source:: ');
    });

    it('opens on typing only for the start of a property name', async () => {
      mount('- a', vi.fn(), DB);
      setDoc('- a\n  |');
      // "a" is in "read-on" and "rating", at the start of neither.
      type('a');
      await settle();
      expect(completionStatus(editor().state)).toBeNull();
      setDoc('- a\n  |');
      type('r');
      await settle();
      // Names that start with it first, then those that contain it.
      expect(labels()).toEqual(['read-on', 'rating', 'source', 'New r']);
    });

    it('stays closed for plain text that names no property', async () => {
      mount('- a', vi.fn(), DB);
      setDoc('- a\n  |');
      type('hello');
      await settle();
      expect(completionStatus(editor().state)).toBeNull();
      type(' world');
      await settle();
      expect(completionStatus(editor().state)).toBeNull();
      expect(doc()).toBe('- a\n  hello world');
    });

    it('is not offered on the first line of a block', async () => {
      mount('- a', vi.fn(), DB);
      setDoc('- |');
      type('so');
      await settle();
      expect(completionStatus(editor().state)).toBeNull();
    });
  });

  describe('property values', () => {
    const valueAfter = async (line: string) => {
      setDoc(`- a\n  ${line}|`);
      explicit();
      await settle();
      return labels();
    };

    it('offers the variables that fit the type of the property', async () => {
      mount('- a', vi.fn(), DB);
      expect(await valueAfter('read-on:: ')).toEqual(['{{date}}', '{{time}}']);
      expect(await valueAfter('Source:: ')).toEqual(['{{url}}']);
      const all = VARIABLE_NAMES.map((name) => `{{${name}}}`);
      expect(await valueAfter('rating:: ')).toEqual(all);
      expect(await valueAfter('unknown:: ')).toEqual(all);
    });

    it('opens on the space after a typed `key::`, not on the `::`', async () => {
      mount('- a', vi.fn(), DB);
      setDoc('- a\n  read-on|');
      type('::');
      await settle();
      expect(completionStatus(editor().state)).toBeNull();
      type(' ');
      await settle();
      expect(labels()).toEqual(['{{date}}', '{{time}}']);
    });

    it('offers every variable on a file graph', async () => {
      mount('- a', vi.fn(), FILE);
      expect(await valueAfter('source:: ')).toEqual(
        VARIABLE_NAMES.map((name) => `{{${name}}}`),
      );
    });

    it('filters `{{` in a value by the type too', async () => {
      mount('- a', vi.fn(), DB);
      setDoc('- a\n  read-on:: |');
      type('{{');
      await settle();
      expect(labels()).toEqual(['date', 'time']);
      accept('time');
      expect(doc()).toBe('- a\n  read-on:: {{time}}');
    });

    it('inserts the chosen variable and keeps free text', async () => {
      mount('- a', vi.fn(), DB);
      setDoc('- a\n  source:: |');
      explicit();
      await settle();
      accept('{{url}}');
      expect(doc()).toBe('- a\n  source:: {{url}}');

      setDoc('- a\n  source:: |');
      type('h');
      type('ttps://x.org');
      await settle();
      expect(completionStatus(editor().state)).toBeNull();
      expect(doc()).toBe('- a\n  source:: https://x.org');
    });
  });

  describe('tags', () => {
    it('lists the tags after #, New # last', async () => {
      mount('- a', vi.fn(), DB);
      setDoc('- a |');
      type('#');
      await settle();
      expect(labels()).toEqual(['Reading', 'Read Later', 'Project']);
      type('Rea');
      await settle();
      expect(labels()).toEqual(['Reading', 'Read Later', 'New #Rea']);
    });

    it('writes #Name, or #[[Name]] for a name with spaces', async () => {
      mount('- a', vi.fn(), DB);
      setDoc('- a |');
      type('#Rea');
      await settle();
      accept('Read Later');
      expect(doc()).toBe('- a #[[Read Later]]');

      setDoc('- a |');
      type('#Proj');
      await settle();
      accept('Project');
      expect(doc()).toBe('- a #Project');
    });

    it('New # writes the typed name', async () => {
      mount('- a', vi.fn(), DB);
      setDoc('- a |');
      type('#[[My Topic');
      await settle();
      expect(labels()).toEqual(['New #My Topic']);
      accept('New #My Topic');
      expect(doc()).toBe('- a #[[My Topic]]');

      setDoc('- a |');
      type('#Inbox');
      await settle();
      expect(labels()).toEqual(['New #Inbox']);
      accept('New #Inbox');
      expect(doc()).toBe('- a #Inbox');
    });

    it('is not offered for a # inside a word or a link', async () => {
      mount('- a', vi.fn(), DB);
      setDoc('- a{{url}}|');
      type('#Rea');
      await settle();
      expect(completionStatus(editor().state)).toBeNull();
    });
  });

  describe('+ Property', () => {
    const addButtons = () => [
      ...document.querySelectorAll<HTMLElement>('.cm-tpl-add-prop'),
    ];

    it('is on every block line in Outline mode, not in Text mode', () => {
      mount('- a\n  source:: x\n  - b', vi.fn(), DB);
      expect(addButtons()).toHaveLength(2);
      expect(addButtons()[0].textContent).toBe('+ Property');
      cleanup();
      mount('intro\n- a', vi.fn(), DB);
      expect(addButtons()).toHaveLength(0);
    });

    it('adds a property line under the block and its properties, names open', async () => {
      const onChange = mount('- a\n  source:: x\n  - b', vi.fn(), DB);
      // happy-dom fires selectionchange synchronously on a focused editor,
      // inside CodeMirror's update; the focus is checked end to end (e2e).
      const focus = vi.spyOn(editor(), 'focus').mockImplementation(() => {});
      act(() => {
        fireEvent.mouseDown(addButtons()[0]);
        fireEvent.click(addButtons()[0]);
      });
      expect(doc()).toBe('- a\n  source:: x\n  \n  - b');
      expect(editor().state.selection.main.head).toBe(
        '- a\n  source:: x\n  '.length,
      );
      await settle();
      expect(completionStatus(editor().state)).toBe('active');
      // `source` is a property of the block already.
      expect(labels()).toEqual(['read-on', 'rating']);
      accept('rating');
      expect(doc()).toBe('- a\n  source:: x\n  rating:: \n  - b');
      expect(onChange).toHaveBeenLastCalledWith('- a\n  source:: x\n  rating:: \n  - b');
      expect(focus).toHaveBeenCalled();
    });

    it('adds under a nested block at its depth', () => {
      mount('- a\n  - b\n    note\n  - c', vi.fn(), DB);
      act(() => {
        fireEvent.click(addButtons()[1]);
      });
      expect(doc()).toBe('- a\n  - b\n    \n    note\n  - c');
    });
  });

  describe('type badges', () => {
    const TEXT = '- a\n  source:: {{url}}\n  read-on:: {{date}}\n  other:: x';

    it('shows the type after `key::` on a DB graph, known properties only', () => {
      mount(TEXT, vi.fn(), DB);
      expect(badges()).toEqual(['url', 'date']);
      // Decoration only: the text is the template.
      expect(doc()).toBe(TEXT);
    });

    it('shows no badge on a file graph or without Logseq', () => {
      mount(TEXT, vi.fn(), FILE);
      expect(badges()).toEqual([]);
      cleanup();
      mount(TEXT);
      expect(badges()).toEqual([]);
    });

    it('shows the badges in Text mode, and once the graph arrives', () => {
      const onChange = vi.fn();
      const { rerender } = render(
        <TemplateEditor value={'intro\n- a\n  source:: x'} onChange={onChange} />,
      );
      expect(badges()).toEqual([]);
      rerender(
        <TemplateEditor
          value={'intro\n- a\n  source:: x'}
          onChange={onChange}
          graph={DB}
        />,
      );
      expect(badges()).toEqual(['url']);
      expect(onChange).not.toHaveBeenCalled();
    });
  });

  describe('without Logseq', () => {
    it('types plain text, `::` and # with no list and no error', async () => {
      const onChange = mount('- a');
      setDoc('- a|');
      type(' #Rea');
      await settle();
      // Only the New option: the graph has no tags.
      expect(labels()).toEqual(['New #Rea']);
      press('Escape');
      setDoc('- a #Rea\n  |');
      type('::');
      await settle();
      expect(completionStatus(editor().state)).toBeNull();
      type(' x');
      expect(doc()).toBe('- a #Rea\n  :: x');
      expect(onChange).toHaveBeenLastCalledWith('- a #Rea\n  :: x');
    });
  });
});

describe('TemplateEditor mode toggle', () => {
  it('has Outline and Text, Outline pressed for a plain outline', () => {
    mount('- a\n  - b');
    expect(
      screen
        .getByRole('button', { name: 'Outline' })
        .getAttribute('aria-pressed'),
    ).toBe('true');
    expect(
      screen.getByRole('button', { name: 'Text' }).getAttribute('aria-pressed'),
    ).toBe('false');
  });

  it('opens Text with Outline disabled for a template the outline would change', () => {
    mount('x\n- y');
    expect(
      (screen.getByRole('button', { name: 'Outline' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(
      screen.getByRole('button', { name: 'Text' }).getAttribute('aria-pressed'),
    ).toBe('true');
  });

  it('does not call onChange for the switch itself', () => {
    const onChange = mount('- a\n  - b');
    fireEvent.click(screen.getByRole('button', { name: 'Text' }));
    fireEvent.click(screen.getByRole('button', { name: 'Outline' }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('shows the error for a stored template with two roots, without a write', () => {
    const onChange = mount('- a\n- b');
    expect(screen.getByRole('alert').textContent).toBe('One top-level block only');
    expect(
      screen.getByRole('button', { name: 'Text' }).getAttribute('aria-pressed'),
    ).toBe('true');
    expect(doc()).toBe('- a\n- b');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('holds back Text with two roots until it is fixed', () => {
    const onChange = vi.fn();
    // Opens in Text: the outline would change this template.
    const { rerender } = render(
      <TemplateEditor value={'x\n- y'} onChange={onChange} />,
    );
    const type = (from: number, to: number, insert: string) =>
      act(() => {
        editor().dispatch({
          changes: { from, to, insert },
          userEvent: 'input.type',
        });
      });
    type(0, doc().length, '- a\n- b');
    expect(screen.getByRole('alert').textContent).toBe('One top-level block only');
    expect(onChange).not.toHaveBeenCalled();
    // The page re-renders with the value it still has: the text stays.
    rerender(<TemplateEditor value={'x\n- y'} onChange={onChange} />);
    expect(doc()).toBe('- a\n- b');
    expect(
      (screen.getByRole('button', { name: 'Outline' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);

    type(0, 7, '- a\n  - b');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(onChange).toHaveBeenLastCalledWith('- a\n  - b');
  });

  it('stores one block as flat text and several as the outline', () => {
    const onChange = mount('- a\n  - b');
    setDoc('- a|\n  - b');
    act(() => {
      editor().dispatch({
        changes: { from: 3, to: 9, insert: '' },
        userEvent: 'input.type',
      });
    });
    expect(doc()).toBe('- a');
    expect(onChange).toHaveBeenLastCalledWith('a');
  });
});
