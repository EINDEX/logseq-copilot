import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { EditorView } from '@codemirror/view';
import { fakeBrowser } from 'wxt/testing';
import { templates } from '@/utils/storage';

const sendMessage = vi.hoisted(() => vi.fn());
vi.mock('@/types/messaging', () => ({ sendMessage }));

import TemplateEditPage from './template-edit-page';

const CONTENT = '#Clip [{{title}}]({{url}})\n{{content}}';
// How the outline editor shows CONTENT: one block of two lines.
const CONTENT_DOC = '- #Clip [{{title}}]({{url}})\n  {{content}}';

let navigate: ReturnType<typeof useNavigate>;
const NavigateProbe = () => {
  navigate = useNavigate();
  return null;
};

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <NavigateProbe />
      <Routes>
        <Route path="/template/:id" element={<TemplateEditPage />} />
        <Route path="/templates" element={<div>templates</div>} />
      </Routes>
    </MemoryRouter>,
  );

const mountedEditor = () => {
  const dom = document.querySelector<HTMLElement>('.cm-editor');
  return dom ? EditorView.findFromDOM(dom) : null;
};

const editor = () => {
  const view = mountedEditor();
  if (!view) throw new Error('The editor is not mounted');
  return view;
};

// TemplateEditor creates its EditorView in an effect, which can run after
// the fields of the page are already on screen. Waits for that view; given
// the view of the template opened before, waits for the one replacing it.
const findEditor = (previous?: EditorView) =>
  waitFor(() => {
    const view = mountedEditor();
    expect(view).toBeTruthy();
    expect(view).not.toBe(previous);
    return view!;
  });

const openTemplate = async (id: string, name: string) => {
  renderAt(`/template/${id}`);
  await screen.findByDisplayValue(name);
  await findEditor();
};

// Types one character at the caret the way a browser does: the value
// changes, the caret lands after the new character, then `input` fires.
const typeAt = (
  field: HTMLInputElement | HTMLTextAreaElement,
  position: number,
  text: string,
) => {
  const proto = Object.getPrototypeOf(field);
  const setValue = Object.getOwnPropertyDescriptor(proto, 'value')!.set!;
  const next =
    field.value.slice(0, position) + text + field.value.slice(position);
  act(() => {
    setValue.call(field, next);
    field.setSelectionRange(position + text.length, position + text.length);
    field.dispatchEvent(new Event('input', { bubbles: true }));
  });
};

/** Types `text` at `position` of the editor document, caret behind it. */
const typeInEditor = (position: number, text: string) => {
  act(() => {
    editor().dispatch({
      changes: { from: position, insert: text },
      selection: { anchor: position + text.length },
      userEvent: 'input.type',
    });
  });
};

const stored = async (id: string) =>
  (await templates.getValue()).find((t) => t.id === id);

const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

describe('TemplateEditPage', () => {
  beforeEach(async () => {
    fakeBrowser.reset();
    sendMessage.mockReset();
    // Logseq is not reachable: what the background answers then.
    sendMessage.mockImplementation(async (type: string) => {
      if (type === 'logseq:listTags') throw new Error('Cannot connect to Logseq');
      if (type === 'logseq:graphKind') return null;
      return [];
    });
    await templates.setValue([
      {
        id: 'a',
        name: 'Alpha',
        content: CONTENT,
        clipNoteLocation: 'customPage',
        clipNoteCustomPage: 'Inbox',
      },
      { id: 'b', name: 'Beta', content: 'beta content' },
      { id: 'c', name: 'Gamma', content: 'intro\n- one\n- two' },
    ]);
  });

  afterEach(() => {
    cleanup();
  });

  it.each([
    ['name', () => screen.getByLabelText('Name'), 'Alpha'],
    ['page', () => screen.getByLabelText('Page name'), 'Inbox'],
  ] as const)(
    'keeps the caret where the user typed in the %s field after the save lands',
    async (_, getField, initial) => {
      await openTemplate('a', 'Alpha');
      const field = getField() as HTMLInputElement;
      expect(field.value).toBe(initial);

      typeAt(field, 3, 'x');
      const expected = initial.slice(0, 3) + 'x' + initial.slice(3);
      expect(field.value).toBe(expected);

      await waitFor(async () => {
        const saved = await stored('a');
        expect([saved?.name, saved?.clipNoteCustomPage]).toContain(expected);
      });
      await settle();

      expect(field.value).toBe(expected);
      expect(field.selectionStart).toBe(4);
      expect(field.selectionEnd).toBe(4);
    },
  );

  it('keeps the caret in the content after the save lands', async () => {
    await openTemplate('a', 'Alpha');
    expect(editor().state.doc.toString()).toBe(CONTENT_DOC);

    typeInEditor(5, 'x');
    expect(editor().state.doc.toString()).toContain('- #Clxip');

    await waitFor(async () => {
      expect((await stored('a'))?.content).toBe(
        '#Clxip [{{title}}]({{url}})\n{{content}}',
      );
    });
    await settle();

    expect(editor().state.doc.toString()).toBe(
      '- #Clxip [{{title}}]({{url}})\n  {{content}}',
    );
    expect(editor().state.selection.main.head).toBe(6);
  });

  it('keeps every keystroke when typing faster than storage answers', async () => {
    await openTemplate('a', 'Alpha');

    typeInEditor(2, 'a');
    typeInEditor(3, 'b');
    typeInEditor(4, 'c');
    expect(editor().state.doc.toString()).toBe(
      '- abc#Clip [{{title}}]({{url}})\n  {{content}}',
    );

    await waitFor(async () => {
      expect((await stored('a'))?.content).toBe(
        'abc#Clip [{{title}}]({{url}})\n{{content}}',
      );
    });
    await settle();
    expect(editor().state.doc.toString()).toBe(
      '- abc#Clip [{{title}}]({{url}})\n  {{content}}',
    );
    expect(editor().state.selection.main.head).toBe(5);
  });

  it('shows the stored values of the template that is opened next', async () => {
    await openTemplate('a', 'Alpha');
    typeInEditor(2, 'x');
    await waitFor(async () => {
      expect((await stored('a'))?.content).toBe('x' + CONTENT);
    });

    const previous = editor();
    act(() => {
      navigate('/template/b');
    });

    expect(await screen.findByDisplayValue('Beta')).toBeTruthy();
    const next = await findEditor(previous);
    expect(next.state.doc.toString()).toBe('- beta content');
  });

  it('previews the blocks of the template as it is typed', async () => {
    await openTemplate('b', 'Beta');
    const bullets = () => document.querySelectorAll('[data-clip-block]');
    expect(bullets()).toHaveLength(1);

    typeInEditor(2, '{{title}}\n  - ');
    await waitFor(() => expect(bullets()).toHaveLength(2));
    expect(bullets()[0].querySelectorAll('[data-clip-block]')).toHaveLength(1);
    expect(screen.getByText(/Sample page/)).toBeTruthy();
  });

  it('inserts a variable chip at the caret when it is clicked', async () => {
    await openTemplate('b', 'Beta');
    act(() => {
      editor().dispatch({ selection: { anchor: 7 } });
    });

    act(() => {
      screen.getByRole('button', { name: '{{url}}' }).click();
    });

    expect(editor().state.doc.toString()).toBe('- beta {{url}}content');
    expect(editor().state.selection.main.head).toBe(7 + '{{url}}'.length);
    expect(
      document.querySelector('.cm-tpl-chip[data-variable="url"]'),
    ).toBeTruthy();
    await waitFor(async () => {
      expect((await stored('b'))?.content).toBe('beta {{url}}content');
    });
    expect(editor().state.selection.main.head).toBe(7 + '{{url}}'.length);
  });

  it('writes nothing when a template is opened, and when the mode is switched', async () => {
    const write = vi.spyOn(fakeBrowser.storage.local, 'set');
    const before = await templates.getValue();

    await openTemplate('a', 'Alpha');
    await settle();
    expect(write).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Text' }));
    await settle();
    fireEvent.click(screen.getByRole('button', { name: 'Outline' }));
    await settle();

    expect(write).not.toHaveBeenCalled();
    expect(await templates.getValue()).toEqual(before);
    write.mockRestore();
  });

  it('opens a template the outline would change in Text, with Outline disabled', async () => {
    await openTemplate('c', 'Gamma');

    expect(
      document
        .querySelector('[data-testid="template-editor"]')
        ?.getAttribute('data-mode'),
    ).toBe('text');
    expect(editor().state.doc.toString()).toBe('intro\n- one\n- two');
    expect(
      (screen.getByRole('button', { name: 'Outline' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(document.querySelector('.cm-tpl-bullet')).toBeNull();
  });

  it('switches between Outline and the stored text', async () => {
    await openTemplate('a', 'Alpha');
    const mode = () =>
      document
        .querySelector('[data-testid="template-editor"]')
        ?.getAttribute('data-mode');
    expect(mode()).toBe('outline');
    expect(document.querySelectorAll('.cm-tpl-bullet')).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'Text' }));
    expect(mode()).toBe('text');
    expect(editor().state.doc.toString()).toBe(CONTENT);
    expect(document.querySelector('.cm-tpl-bullet')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Outline' }));
    expect(mode()).toBe('outline');
    expect(editor().state.doc.toString()).toBe(CONTENT_DOC);
  });

  it('enables Outline in Text once the text is a plain outline', async () => {
    await openTemplate('c', 'Gamma');
    const outline = () =>
      screen.getByRole('button', { name: 'Outline' }) as HTMLButtonElement;
    expect(outline().disabled).toBe(true);

    act(() => {
      editor().dispatch({
        changes: {
          from: 0,
          to: editor().state.doc.length,
          insert: '- intro\n  - one\n  - two',
        },
        userEvent: 'input.type',
      });
    });
    await waitFor(() => expect(outline().disabled).toBe(false));
  });

  describe('graph', () => {
    it('asks Logseq once for the properties, the graph kind and the tags', async () => {
      await openTemplate('a', 'Alpha');
      await settle();
      const asked = sendMessage.mock.calls.map(([type]) => type).sort();
      expect(asked).toEqual([
        'logseq:graphKind',
        'logseq:listProperties',
        'logseq:listTags',
      ]);
    });

    it('shows the type badges of a DB graph', async () => {
      await templates.setValue([
        { id: 'p', name: 'Props', content: '- a\n  source:: {{url}}' },
      ]);
      sendMessage.mockImplementation(async (type: string) => {
        if (type === 'logseq:graphKind') return 'db';
        if (type === 'logseq:listProperties') return [{ title: 'source', type: 'url' }];
        return [{ name: 'Reading', uuid: 'u' }];
      });
      await openTemplate('p', 'Props');
      await waitFor(() =>
        expect(document.querySelector('.cm-tpl-type')?.textContent).toBe('url'),
      );
    });

    it('keeps working when every request fails', async () => {
      sendMessage.mockRejectedValue(new Error('Cannot connect to Logseq'));
      await openTemplate('b', 'Beta');
      await settle();
      typeInEditor(2, 'x');
      await waitFor(async () =>
        expect((await stored('b'))?.content).toBe('xbeta content'),
      );
      expect(document.querySelector('.cm-tpl-type')).toBeNull();
    });

    it('has no Tag section, and a stored `tag` key does not get in the way', async () => {
      await templates.setValue([
        { id: 't', name: 'Tagged', content: 'x', tag: { name: 'Old' } } as never,
      ]);
      await openTemplate('t', 'Tagged');
      expect(screen.queryByRole('combobox', { name: 'Tag' })).toBeNull();
      expect(screen.queryByRole('heading', { name: 'Tag' })).toBeNull();
      typeAt(screen.getByLabelText('Name') as HTMLInputElement, 6, '!');
      await waitFor(async () => expect((await stored('t'))?.name).toBe('Tagged!'));
    });
  });

  describe('Save to', () => {
    const segment = (name: string) => screen.getByRole('button', { name });
    const pageField = () => screen.queryByLabelText('Page name');

    it('is a segmented control; the page field shows for Page… only', async () => {
      await openTemplate('a', 'Alpha');
      expect(screen.getByRole('group', { name: 'Save to' })).toBeTruthy();
      expect(segment('Page…').getAttribute('aria-pressed')).toBe('true');
      expect(segment('Journal').getAttribute('aria-pressed')).toBe('false');
      expect((pageField() as HTMLInputElement).value).toBe('Inbox');

      fireEvent.click(segment('Current page'));
      await waitFor(async () =>
        expect((await stored('a'))?.clipNoteLocation).toBe('currentPage'),
      );
      expect(segment('Current page').getAttribute('aria-pressed')).toBe('true');
      expect(pageField()).toBeNull();

      fireEvent.click(segment('Journal'));
      await waitFor(async () =>
        expect((await stored('a'))?.clipNoteLocation).toBe('journal'),
      );
      expect(pageField()).toBeNull();

      fireEvent.click(segment('Page…'));
      await waitFor(async () =>
        expect((await stored('a'))?.clipNoteLocation).toBe('customPage'),
      );
      expect((pageField() as HTMLInputElement).value).toBe('Inbox');
      const saved = await stored('a');
      expect(saved?.clipNoteCustomPage).toBe('Inbox');
      expect(saved?.content).toBe(CONTENT);
    });

    it('defaults to Journal for a template without a location', async () => {
      await openTemplate('b', 'Beta');
      expect(segment('Journal').getAttribute('aria-pressed')).toBe('true');
      expect(pageField()).toBeNull();
    });
  });

  it('has no explanatory text', async () => {
    await openTemplate('a', 'Alpha');
    const text = document.body.textContent ?? '';
    expect(text).not.toMatch(/Only used when/);
    expect(text).not.toMatch(/Configure your template/);
    expect(text).not.toMatch(/Choose where clips/);
    expect(text).not.toMatch(/Define the content structure/);
    expect(screen.queryByRole('heading', { name: 'Template Name' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Template Content' })).toBeNull();
  });

  describe('page rules', () => {
    const field = () => screen.getByPlaceholderText(/github\.com/) as HTMLInputElement;
    const add = () => screen.getByRole('button', { name: 'Add pattern' });

    it('stores a pattern with Enter or Add, and removes it again', async () => {
      await openTemplate('b', 'Beta');
      expect((await stored('b'))?.rules).toBeUndefined();

      fireEvent.change(field(), { target: { value: 'github.com/*/issues/*' } });
      fireEvent.keyDown(field(), { key: 'Enter' });
      await waitFor(async () =>
        expect((await stored('b'))?.rules).toEqual(['github.com/*/issues/*']),
      );
      expect(field().value).toBe('');

      fireEvent.change(field(), { target: { value: '*.example.com' } });
      fireEvent.click(add());
      await waitFor(async () =>
        expect((await stored('b'))?.rules).toEqual(['github.com/*/issues/*', '*.example.com']),
      );

      fireEvent.click(screen.getByRole('button', { name: 'Remove github.com/*/issues/*' }));
      await waitFor(async () => expect((await stored('b'))?.rules).toEqual(['*.example.com']));
      fireEvent.click(screen.getByRole('button', { name: 'Remove *.example.com' }));
      await waitFor(async () => expect((await stored('b'))?.rules).toBeUndefined());
    });

    it('does not store an invalid pattern and says why', async () => {
      await openTemplate('b', 'Beta');

      fireEvent.change(field(), { target: { value: 'a.com/**/b' } });
      expect(screen.getByRole('alert').textContent).toBeTruthy();
      expect((add() as HTMLButtonElement).disabled).toBe(true);
      fireEvent.keyDown(field(), { key: 'Enter' });
      await settle();
      expect((await stored('b'))?.rules).toBeUndefined();
      expect(field().value).toBe('a.com/**/b');
    });

    it('keeps the patterns of each template apart and a template without rules shows none', async () => {
      await templates.setValue([
        { id: 'a', name: 'Alpha', content: 'x', rules: ['a.com'] },
        { id: 'b', name: 'Beta', content: 'y' },
      ]);
      await openTemplate('a', 'Alpha');
      expect(screen.getByLabelText('Patterns').textContent).toBe('a.com');
      cleanup();
      await openTemplate('b', 'Beta');
      expect(screen.queryByLabelText('Patterns')).toBeNull();
    });
  });
});
