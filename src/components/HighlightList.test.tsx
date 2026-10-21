import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { HighlightList } from './HighlightList';
import type { HighlightData } from '@/types/highlight';
import log from '@/utils/logger';

const highlight = (
  id: string,
  overrides: Partial<HighlightData> = {},
): HighlightData => ({
  id,
  url: `https://example.com/${id}`,
  title: `Page ${id}`,
  hostname: 'example.com',
  range: {
    startContainerXPath: '/html/body[1]/p[1]',
    endContainerXPath: '/html/body[1]/p[1]',
    startOffset: 0,
    endOffset: 5,
    textContent: `text of ${id}`,
  },
  createdAt: Date.now(),
  lastAccessedAt: Date.now(),
  ...overrides,
});

const noop = () => {};

const noteField = () => screen.queryByLabelText('Note') as HTMLTextAreaElement;
const button = (name: string) =>
  screen.getByRole('button', { name }) as HTMLButtonElement;

describe('HighlightList', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  describe('what it shows', () => {
    it('shows the text, note, site and age of every highlight', () => {
      render(
        <HighlightList
          highlights={[
            highlight('a', { note: 'my note' }),
            highlight('b', {
              hostname: 'other.example',
              createdAt: Date.now() - 2 * 24 * 60 * 60 * 1000 - 1000,
            }),
          ]}
          onSelect={noop}
          onDelete={noop}
        />,
      );

      expect(screen.getByText('text of a')).not.toBeNull();
      expect(screen.getByText('text of b')).not.toBeNull();
      expect(screen.getByText('my note')).not.toBeNull();
      expect(screen.getByText('example.com')).not.toBeNull();
      expect(screen.getByText('other.example')).not.toBeNull();
      expect(screen.getByText('Just now')).not.toBeNull();
      expect(screen.getByText('2d ago')).not.toBeNull();
    });

    it('cuts long text and notes short', () => {
      render(
        <HighlightList
          highlights={[
            highlight('a', {
              range: { ...highlight('a').range, textContent: 'x'.repeat(200) },
              note: 'n'.repeat(200),
            }),
          ]}
          onSelect={noop}
          onDelete={noop}
        />,
      );

      expect(screen.getByText(`${'x'.repeat(120)}...`)).not.toBeNull();
      expect(screen.getByText(`${'n'.repeat(80)}...`)).not.toBeNull();
    });

    it('shows up to three tags and counts the rest', () => {
      render(
        <HighlightList
          highlights={[
            highlight('a', { tags: ['t1', 't2', 't3', 't4', 't5'] }),
          ]}
          onSelect={noop}
          onDelete={noop}
        />,
      );

      for (const tag of ['t1', 't2', 't3']) {
        expect(screen.getByText(tag)).not.toBeNull();
      }
      expect(screen.queryByText('t4')).toBeNull();
      expect(screen.getByText('+2')).not.toBeNull();
    });

    it('shows the empty state instead of the list', () => {
      const { container } = render(
        <HighlightList
          highlights={[]}
          onSelect={noop}
          onDelete={noop}
          empty={<p>Nothing here</p>}
        />,
      );

      expect(screen.getByText('Nothing here')).not.toBeNull();
      expect(container.textContent).toBe('Nothing here');
    });

    it('shows nothing for no highlights when there is no empty state', () => {
      const { container } = render(
        <HighlightList highlights={[]} onSelect={noop} onDelete={noop} />,
      );

      expect(container.innerHTML).toBe('');
    });

    it('does not show the empty state next to highlights', () => {
      render(
        <HighlightList
          highlights={[highlight('a')]}
          onSelect={noop}
          onDelete={noop}
          empty={<p>Nothing here</p>}
        />,
      );

      expect(screen.queryByText('Nothing here')).toBeNull();
    });
  });

  describe('selecting and deleting', () => {
    it('selects a highlight by its id when its row is clicked', () => {
      const onSelect = vi.fn();
      render(
        <HighlightList
          highlights={[highlight('a'), highlight('b')]}
          onSelect={onSelect}
          onDelete={noop}
        />,
      );

      fireEvent.click(screen.getByText('text of b'));

      expect(onSelect).toHaveBeenCalledTimes(1);
      expect(onSelect).toHaveBeenCalledWith('b');
    });

    it('deletes a highlight without selecting it', () => {
      const onSelect = vi.fn();
      const onDelete = vi.fn();
      render(
        <HighlightList
          highlights={[highlight('a'), highlight('b')]}
          onSelect={onSelect}
          onDelete={onDelete}
        />,
      );

      fireEvent.click(
        screen.getAllByRole('button', { name: 'Delete highlight' })[1],
      );

      expect(onDelete).toHaveBeenCalledTimes(1);
      expect(onDelete).toHaveBeenCalledWith('b');
      expect(onSelect).not.toHaveBeenCalled();
    });

    it('reveals the actions with the keyboard, not just the pointer', () => {
      render(
        <HighlightList
          highlights={[highlight('a')]}
          onSelect={noop}
          onDelete={noop}
        />,
      );

      const actions = button('Delete highlight').parentElement!;
      expect(actions.className).toContain('group-hover:opacity-100');
      expect(actions.className).toContain(
        'group-has-[:focus-visible]:opacity-100',
      );
    });
  });

  describe('editing a note', () => {
    const renderEditable = (
      onUpdateNote: (id: string, note: string) => void | Promise<void>,
      onSelect: (id: string) => void = noop,
    ) =>
      render(
        <HighlightList
          highlights={[
            highlight('a', { note: 'first' }),
            highlight('b', { note: 'second' }),
          ]}
          onSelect={onSelect}
          onDelete={noop}
          onUpdateNote={onUpdateNote}
        />,
      );

    const edit = (index = 0) =>
      fireEvent.click(
        screen.getAllByRole('button', { name: 'Edit note' })[index],
      );

    it('has no way to edit notes unless it is given what saves them', () => {
      render(
        <HighlightList
          highlights={[highlight('a', { note: 'first' })]}
          onSelect={noop}
          onDelete={noop}
        />,
      );

      expect(screen.queryByRole('button', { name: 'Edit note' })).toBeNull();
    });

    it('opens an editor with the note of that highlight, in place of the note', () => {
      const onSelect = vi.fn();
      renderEditable(vi.fn(), onSelect);

      edit(1);

      expect(noteField().value).toBe('second');
      // `first` is still only shown as a note, and the other one is not shown
      // twice.
      expect(screen.getAllByLabelText('Note')).toHaveLength(1);
      expect(screen.getByText('first')).not.toBeNull();
      expect(screen.queryByText('second', { selector: 'p' })).toBeNull();
      expect(onSelect).not.toHaveBeenCalled();
    });

    it('starts empty for a highlight with no note', () => {
      render(
        <HighlightList
          highlights={[highlight('a')]}
          onSelect={noop}
          onDelete={noop}
          onUpdateNote={vi.fn()}
        />,
      );

      edit();

      expect(noteField().value).toBe('');
    });

    it('saves the new note for that highlight and closes the editor', async () => {
      const onUpdateNote = vi.fn().mockResolvedValue(undefined);
      renderEditable(onUpdateNote);

      edit(1);
      fireEvent.change(noteField(), { target: { value: 'changed' } });
      fireEvent.click(button('Save'));

      await waitFor(() => expect(noteField()).toBeNull());
      expect(onUpdateNote).toHaveBeenCalledTimes(1);
      expect(onUpdateNote).toHaveBeenCalledWith('b', 'changed');
    });

    it('saves with Cmd or Ctrl and Enter', async () => {
      const onUpdateNote = vi.fn().mockResolvedValue(undefined);
      renderEditable(onUpdateNote);

      edit();
      fireEvent.change(noteField(), { target: { value: 'one' } });
      fireEvent.keyDown(noteField(), { key: 'Enter', metaKey: true });
      await waitFor(() => expect(noteField()).toBeNull());

      edit();
      fireEvent.change(noteField(), { target: { value: 'two' } });
      fireEvent.keyDown(noteField(), { key: 'Enter', ctrlKey: true });
      await waitFor(() => expect(noteField()).toBeNull());

      expect(onUpdateNote.mock.calls).toEqual([
        ['a', 'one'],
        ['a', 'two'],
      ]);
    });

    it('keeps a plain Enter for a new line', () => {
      const onUpdateNote = vi.fn();
      renderEditable(onUpdateNote);

      edit();
      fireEvent.keyDown(noteField(), { key: 'Enter' });

      expect(onUpdateNote).not.toHaveBeenCalled();
      expect(noteField()).not.toBeNull();
    });

    it('drops the edit with Cancel', () => {
      const onUpdateNote = vi.fn();
      renderEditable(onUpdateNote);

      edit();
      fireEvent.change(noteField(), { target: { value: 'changed' } });
      fireEvent.click(button('Cancel'));

      expect(noteField()).toBeNull();
      expect(screen.getByText('first')).not.toBeNull();
      expect(onUpdateNote).not.toHaveBeenCalled();
    });

    it('drops the edit with Escape', () => {
      const onUpdateNote = vi.fn();
      renderEditable(onUpdateNote);

      edit();
      fireEvent.change(noteField(), { target: { value: 'changed' } });
      fireEvent.keyDown(noteField(), { key: 'Escape' });

      expect(noteField()).toBeNull();
      expect(onUpdateNote).not.toHaveBeenCalled();
    });

    it('does not select the highlight while it is edited', () => {
      const onSelect = vi.fn();
      renderEditable(vi.fn(), onSelect);

      edit();
      fireEvent.click(noteField());
      fireEvent.click(button('Cancel'));

      expect(onSelect).not.toHaveBeenCalled();
    });

    it('does not save a note that did not change', async () => {
      const onUpdateNote = vi.fn();
      renderEditable(onUpdateNote);

      edit();
      fireEvent.click(button('Save'));
      await waitFor(() => expect(noteField()).toBeNull());

      edit();
      fireEvent.change(noteField(), { target: { value: '  first  ' } });
      fireEvent.click(button('Save'));
      await waitFor(() => expect(noteField()).toBeNull());

      expect(onUpdateNote).not.toHaveBeenCalled();
    });

    it('can clear a note', async () => {
      const onUpdateNote = vi.fn().mockResolvedValue(undefined);
      renderEditable(onUpdateNote);

      edit();
      fireEvent.change(noteField(), { target: { value: '' } });
      fireEvent.click(button('Save'));

      await waitFor(() => expect(noteField()).toBeNull());
      expect(onUpdateNote).toHaveBeenCalledWith('a', '');
    });

    it('waits for the save, and saves once', async () => {
      let finish!: () => void;
      const onUpdateNote = vi.fn(
        () => new Promise<void>((resolve) => (finish = resolve)),
      );
      renderEditable(onUpdateNote);

      edit();
      fireEvent.change(noteField(), { target: { value: 'changed' } });
      fireEvent.click(button('Save'));
      fireEvent.keyDown(noteField(), { key: 'Enter', metaKey: true });

      // Still open, but busy.
      expect(noteField()).not.toBeNull();
      expect(screen.getByText('Saving...')).not.toBeNull();
      expect(button('Saving...').disabled).toBe(true);
      expect(button('Cancel').disabled).toBe(true);
      expect(onUpdateNote).toHaveBeenCalledTimes(1);

      finish();
      await waitFor(() => expect(noteField()).toBeNull());
    });

    it('stays open with the draft when the save fails, and can be tried again', async () => {
      vi.spyOn(log, 'error').mockImplementation(() => {});
      const onUpdateNote = vi
        .fn()
        .mockRejectedValueOnce(new Error('storage is full'))
        .mockResolvedValueOnce(undefined);
      renderEditable(onUpdateNote);

      edit();
      fireEvent.change(noteField(), { target: { value: 'changed' } });
      fireEvent.click(button('Save'));

      await waitFor(() => expect(log.error).toHaveBeenCalled());
      await waitFor(() => expect(button('Save').disabled).toBe(false));
      expect(noteField().value).toBe('changed');

      fireEvent.click(button('Save'));
      await waitFor(() => expect(noteField()).toBeNull());
      expect(onUpdateNote).toHaveBeenCalledTimes(2);
    });
  });
});
