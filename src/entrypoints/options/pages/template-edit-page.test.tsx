import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { fakeBrowser } from 'wxt/testing';
import { templates } from '@/utils/storage';
import TemplateEditPage from './template-edit-page';

const CONTENT = '#Clip [{{title}}]({{url}})\n{{content}}';

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

const stored = async (id: string) =>
  (await templates.getValue()).find((t) => t.id === id);

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
    ]);
  });

  afterEach(() => {
    cleanup();
  });

  it.each([
    ['content', () => screen.getByLabelText('Content'), CONTENT],
    ['name', () => screen.getByLabelText('Name'), 'Alpha'],
    ['custom page', () => screen.getByLabelText('Custom Page Name'), 'Inbox'],
  ] as const)(
    'keeps the caret where the user typed in the %s field after the save lands',
    async (_, getField, initial) => {
      renderAt('/template/a');
      await screen.findByDisplayValue('Alpha');
      const field = getField() as HTMLInputElement | HTMLTextAreaElement;
      expect(field.value).toBe(initial);

      typeAt(field, 3, 'x');
      const expected = initial.slice(0, 3) + 'x' + initial.slice(3);
      expect(field.value).toBe(expected);

      await waitFor(async () => {
        const saved = await stored('a');
        expect([
          saved?.content,
          saved?.name,
          saved?.clipNoteCustomPage,
        ]).toContain(expected);
      });
      // Let the storage watcher and the save's own state update settle.
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      expect(field.value).toBe(expected);
      expect(field.selectionStart).toBe(4);
      expect(field.selectionEnd).toBe(4);
    },
  );

  it('keeps every keystroke when typing faster than storage answers', async () => {
    renderAt('/template/a');
    await screen.findByDisplayValue('Alpha');
    const textarea = screen.getByLabelText('Content') as HTMLTextAreaElement;

    typeAt(textarea, 1, 'a');
    typeAt(textarea, 2, 'b');
    typeAt(textarea, 3, 'c');
    const expected = '#abcClip [{{title}}]({{url}})\n{{content}}';
    expect(textarea.value).toBe(expected);

    await waitFor(async () => {
      expect((await stored('a'))?.content).toBe(expected);
    });
    expect(textarea.value).toBe(expected);
    expect(textarea.selectionStart).toBe(4);
  });

  it('shows the stored values of the template that is opened next', async () => {
    renderAt('/template/a');
    await screen.findByDisplayValue('Alpha');
    typeAt(screen.getByLabelText('Content') as HTMLTextAreaElement, 0, 'x');
    await waitFor(async () => {
      expect((await stored('a'))?.content).toBe('x' + CONTENT);
    });

    act(() => {
      navigate('/template/b');
    });

    expect(await screen.findByDisplayValue('Beta')).toBeTruthy();
    expect(
      (screen.getByLabelText('Content') as HTMLTextAreaElement).value,
    ).toBe('beta content');
  });
});
