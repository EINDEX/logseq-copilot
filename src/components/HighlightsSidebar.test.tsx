/**
 * The in-page sidebar keeps its look and its behavior while its list is shared
 * with the browser sidebar: this pins what it does with that list.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';

const sendMessage = vi.fn();
vi.mock('@/types/messaging', () => ({
  sendMessage: (...args: unknown[]) => sendMessage(...args),
}));

import { HighlightsSidebar } from './HighlightsSidebar';
import { HighlightService } from '@/utils/highlight-service';
import { HighlightManager } from '@/utils/highlight-manager';
import type { HighlightData } from '@/types/highlight';

const highlight = (
  id: string,
  overrides: Partial<HighlightData> = {},
): HighlightData => ({
  id,
  url: window.location.href,
  title: `Page ${id}`,
  hostname: window.location.hostname,
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

const text = (value: string) => screen.queryByText(`"${value}"`);

describe('HighlightsSidebar', () => {
  let removeHighlight: ReturnType<typeof vi.fn>;
  let scrollToHighlight: ReturnType<typeof vi.fn>;
  let displayHighlight: ReturnType<typeof vi.fn>;
  let updateLastAccessed: ReturnType<typeof vi.fn>;

  const open = async (highlights: HighlightData[]) => {
    vi.spyOn(HighlightService, 'getCurrentPageHighlights').mockResolvedValue(
      highlights,
    );
    const rendered = render(<HighlightsSidebar isOpen onClose={vi.fn()} />);
    await waitFor(() =>
      expect(screen.queryByText('Loading highlights...')).toBeNull(),
    );
    return rendered;
  };

  beforeEach(() => {
    sendMessage.mockReset();
    (globalThis as any).CSS = { highlights: new Map() };
    (globalThis as any).Highlight = class {
      add() {}
      clear() {}
    };
    removeHighlight = vi
      .spyOn(HighlightManager.prototype, 'removeHighlight')
      .mockResolvedValue(true) as never;
    scrollToHighlight = vi
      .spyOn(HighlightManager.prototype, 'scrollToHighlight')
      .mockResolvedValue(true) as never;
    displayHighlight = vi
      .spyOn(HighlightManager.prototype, 'displayHighlight')
      .mockResolvedValue(true) as never;
    updateLastAccessed = vi
      .spyOn(HighlightService, 'updateLastAccessed')
      .mockResolvedValue() as never;
    vi.spyOn(window, 'open').mockImplementation(() => null);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('lists the highlights of the page and counts them', async () => {
    await open([highlight('a'), highlight('b', { note: 'a note' })]);

    expect(text('text of a')).not.toBeNull();
    expect(text('text of b')).not.toBeNull();
    expect(screen.getByText('a note')).not.toBeNull();
    expect(screen.getByText('2 highlights on this page')).not.toBeNull();
  });

  it('is read-only for notes', async () => {
    await open([highlight('a', { note: 'a note' })]);

    expect(screen.queryByRole('button', { name: 'Edit note' })).toBeNull();
  });

  it('says so when there are no highlights', async () => {
    await open([]);

    expect(screen.getByText('No highlights yet')).not.toBeNull();
  });

  it('filters by text, note and title, and says so when none match', async () => {
    await open([
      highlight('a'),
      highlight('b', { note: 'remember the milk' }),
      highlight('c', { title: 'Cooking' }),
    ]);
    const search = screen.getByPlaceholderText('Search highlights...');

    fireEvent.change(search, { target: { value: 'MILK' } });
    await waitFor(() => expect(text('text of a')).toBeNull());
    expect(text('text of b')).not.toBeNull();
    expect(text('text of c')).toBeNull();

    fireEvent.change(search, { target: { value: 'cooking' } });
    await waitFor(() => expect(text('text of c')).not.toBeNull());
    expect(text('text of b')).toBeNull();

    fireEvent.change(search, { target: { value: 'nothing like it' } });
    expect(
      await screen.findByText('No highlights match your search'),
    ).not.toBeNull();
  });

  describe('clicking a highlight', () => {
    it('scrolls to it on this page and marks it as accessed', async () => {
      await open([highlight('a'), highlight('b')]);

      fireEvent.click(screen.getByText('"text of b"'));

      await waitFor(() => expect(scrollToHighlight).toHaveBeenCalledWith('b'));
      expect(updateLastAccessed).toHaveBeenCalledWith('b');
      expect(window.open).not.toHaveBeenCalled();
    });

    it('opens the page of a highlight that is on another page', async () => {
      await open([highlight('a', { url: 'https://other.example/page' })]);

      fireEvent.click(screen.getByText('"text of a"'));

      await waitFor(() =>
        expect(window.open).toHaveBeenCalledWith(
          'https://other.example/page',
          '_blank',
        ),
      );
      expect(scrollToHighlight).not.toHaveBeenCalled();
    });
  });

  describe('deleting a highlight', () => {
    it('removes it through the manager once the user confirms', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      await open([highlight('a'), highlight('b')]);

      fireEvent.click(
        screen.getAllByRole('button', { name: 'Delete highlight' })[0],
      );

      await waitFor(() => expect(text('text of a')).toBeNull());
      expect(removeHighlight).toHaveBeenCalledWith('a');
      expect(text('text of b')).not.toBeNull();
      expect(screen.getByText('1 highlights on this page')).not.toBeNull();
      expect(scrollToHighlight).not.toHaveBeenCalled();
    });

    it('keeps it when the user does not confirm', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(false);
      await open([highlight('a')]);

      fireEvent.click(screen.getByRole('button', { name: 'Delete highlight' }));

      expect(removeHighlight).not.toHaveBeenCalled();
      expect(text('text of a')).not.toBeNull();
    });

    it('keeps it when it could not be removed', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      removeHighlight.mockResolvedValue(false);
      await open([highlight('a')]);

      fireEvent.click(screen.getByRole('button', { name: 'Delete highlight' }));

      await waitFor(() => expect(removeHighlight).toHaveBeenCalled());
      expect(text('text of a')).not.toBeNull();
    });
  });

  describe('the visibility button', () => {
    // It comes right before the delete button. Its icon is the only sign of
    // the state: an eye, or a crossed out one.
    const toggle = () =>
      screen.getByRole('button', { name: 'Delete highlight' })
        .previousElementSibling as HTMLButtonElement;
    const crossedOut = () => !!toggle().querySelector('path[d="M3 3l18 18"]');

    it('shows the highlight again after hiding it, without selecting it', async () => {
      await open([highlight('a')]);
      expect(crossedOut()).toBe(false);

      fireEvent.click(toggle());
      expect(crossedOut()).toBe(true);
      expect(displayHighlight).not.toHaveBeenCalled();

      fireEvent.click(toggle());
      await waitFor(() =>
        expect(displayHighlight).toHaveBeenCalledWith(
          expect.objectContaining({ id: 'a' }),
        ),
      );
      expect(crossedOut()).toBe(false);
      expect(scrollToHighlight).not.toHaveBeenCalled();
    });
  });
});
