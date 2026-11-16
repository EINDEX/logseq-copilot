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
} from '@codemirror/autocomplete';
import { TemplateEditor } from './template-editor';
import { VARIABLE_NAMES, variableSamples } from './template-editor-extensions';

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

const mount = (value: string, onChange = vi.fn()) => {
  render(<TemplateEditor value={value} onChange={onChange} />);
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
