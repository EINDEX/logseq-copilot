import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
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

const editor = () =>
  EditorView.findFromDOM(document.querySelector('.cm-editor') as HTMLElement)!;

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
    ['custom page', () => screen.getByLabelText('Custom Page Name'), 'Inbox'],
  ] as const)(
    'keeps the caret where the user typed in the %s field after the save lands',
    async (_, getField, initial) => {
      renderAt('/template/a');
      await screen.findByDisplayValue('Alpha');
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
    renderAt('/template/a');
    await screen.findByDisplayValue('Alpha');
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
    renderAt('/template/a');
    await screen.findByDisplayValue('Alpha');

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
    renderAt('/template/a');
    await screen.findByDisplayValue('Alpha');
    typeInEditor(2, 'x');
    await waitFor(async () => {
      expect((await stored('a'))?.content).toBe('x' + CONTENT);
    });

    act(() => {
      navigate('/template/b');
    });

    expect(await screen.findByDisplayValue('Beta')).toBeTruthy();
    expect(editor().state.doc.toString()).toBe('- beta content');
  });

  it('previews the blocks of the template as it is typed', async () => {
    renderAt('/template/b');
    await screen.findByDisplayValue('Beta');
    const bullets = () => document.querySelectorAll('[data-clip-block]');
    expect(bullets()).toHaveLength(1);

    typeInEditor(2, '{{title}}\n  - ');
    await waitFor(() => expect(bullets()).toHaveLength(2));
    expect(bullets()[0].querySelectorAll('[data-clip-block]')).toHaveLength(1);
    expect(screen.getByText(/Sample page/)).toBeTruthy();
  });

  it('inserts a variable chip at the caret when it is clicked', async () => {
    renderAt('/template/b');
    await screen.findByDisplayValue('Beta');
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

    renderAt('/template/a');
    await screen.findByDisplayValue('Alpha');
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
    renderAt('/template/c');
    await screen.findByDisplayValue('Gamma');

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
    renderAt('/template/a');
    await screen.findByDisplayValue('Alpha');
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
    renderAt('/template/c');
    await screen.findByDisplayValue('Gamma');
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

  describe('Tag', () => {
    beforeAll(() => {
      globalThis.ResizeObserver ??= class {
        observe() {}
        unobserve() {}
        disconnect() {}
      } as never;
      Element.prototype.scrollIntoView ??= () => {};
    });

    it('saves a typed tag on the template and clears it again', async () => {
      renderAt('/template/b');
      await screen.findByDisplayValue('Beta');
      const field = () => screen.getByRole('combobox', { name: 'Tag' });
      expect(field().textContent).toBe('No tag');

      fireEvent.click(field());
      // Logseq is not reachable in a unit test: the field takes free text.
      fireEvent.change(await screen.findByPlaceholderText('Search or type a tag'), {
        target: { value: 'Reading' },
      });
      fireEvent.click(await screen.findByRole('option', { name: 'Reading' }));
      await waitFor(async () =>
        expect((await stored('b'))?.tag).toEqual({ name: 'Reading' }),
      );
      expect(field().textContent).toBe('#Reading');

      fireEvent.click(field());
      fireEvent.click(await screen.findByRole('option', { name: 'No tag' }));
      await waitFor(async () => expect((await stored('b'))?.tag).toBeUndefined());
      expect(field().textContent).toBe('No tag');
    });
  });
});
