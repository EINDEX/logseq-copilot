// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

// Task checkboxes in the results, and the search, talk to the background.
const sendMessage = vi.hoisted(() => vi.fn());
vi.mock('@/types/messaging', () => ({ sendMessage }));

import { SidebarPanel, type SidebarPanelProps } from './SidebarPanel';
import { useLogseqSearch, type LogseqSearch } from '@/hooks/use-logseq-search';
import type { PageRecallState } from '@/hooks/use-page-recall';
import type { HighlightData } from '@/types/highlight';
import type { LogseqBlockType, LogseqSearchResult } from '@/types/logseqBlock';

const highlight = (id: string): HighlightData => ({
  id,
  url: 'https://one.example/page',
  title: 'Page one',
  hostname: 'one.example',
  range: {
    startContainerXPath: '/html/body[1]/p[1]',
    endContainerXPath: '/html/body[1]/p[1]',
    startOffset: 0,
    endOffset: 5,
    textContent: `text of ${id}`,
  },
  createdAt: Date.now(),
  lastAccessedAt: Date.now(),
});

const page = { id: 1, name: 'reading', originalName: 'Reading', uuid: 'p1' };

const block = (uuid: string, html: string): LogseqBlockType => ({
  uuid,
  html,
  page,
  content: html,
  format: 'markdown',
  marker: '',
  priority: '',
});

const found = (blocks: LogseqBlockType[] = [block('b1', '<p>a note on it</p>')]): LogseqSearchResult => ({
  graph: 'my notes',
  pages: [],
  blocks,
});

const recallOf = (over: Partial<PageRecallState> = {}): PageRecallState => ({
  loading: false,
  error: null,
  result: found(),
  ...over,
});

const noop = () => {};

/** No search shown. */
const idleSearch = (over: Partial<LogseqSearch> = {}): LogseqSearch => ({
  query: '',
  submitted: null,
  loading: false,
  error: null,
  result: null,
  setQuery: noop,
  submit: noop,
  clear: noop,
  retry: noop,
  ...over,
});

const renderPanel = (props: Partial<SidebarPanelProps> = {}) =>
  render(
    <SidebarPanel
      status="ready"
      highlights={[highlight('a'), highlight('b')]}
      notice={null}
      onSelect={noop}
      onDelete={noop}
      onUpdateNote={async () => {}}
      recall={recallOf()}
      onRetryRecall={noop}
      search={idleSearch()}
      onOpenSettings={noop}
      {...props}
    />,
  );

const highlightsPart = () => screen.queryByRole('region', { name: 'Highlights' });
const recallPart = () => screen.queryByRole('region', { name: 'In Logseq' });
const separator = () => screen.queryByRole('separator');
const closeButton = () => screen.queryByRole('button', { name: 'Close' });
const emptyState = () =>
  screen.queryByText('Nothing for this page yet') ??
  screen.queryByText('Not available on this page');

describe('SidebarPanel', () => {
  afterEach(() => {
    cleanup();
  });

  describe('its parts', () => {
    it('shows the highlights, a line, then what Logseq has about the page', () => {
      renderPanel();

      const parts = [highlightsPart(), separator(), recallPart()];
      expect(parts.every(Boolean)).toBe(true);
      // In this order.
      const [first, line, second] = parts as HTMLElement[];
      expect(first.compareDocumentPosition(line) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(line.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(screen.getByText('text of a')).not.toBeNull();
      expect(screen.getByText('a note on it')).not.toBeNull();
      expect(emptyState()).toBeNull();
    });

    it('has no titles or counts of its own', () => {
      renderPanel();

      expect(screen.queryByText('Highlights')).toBeNull();
      expect(screen.queryByRole('heading')).toBeNull();
      expect(screen.queryByText('2')).toBeNull();
    });

    it('leaves out the highlights, and the line, when the page has none', () => {
      renderPanel({ highlights: [] });

      expect(highlightsPart()).toBeNull();
      expect(separator()).toBeNull();
      expect(recallPart()).not.toBeNull();
      expect(emptyState()).toBeNull();
    });

    it('leaves out the Logseq part, and the line, when Logseq has nothing', () => {
      renderPanel({ recall: recallOf({ result: found([]) }) });

      expect(highlightsPart()).not.toBeNull();
      expect(separator()).toBeNull();
      expect(recallPart()).toBeNull();
      expect(emptyState()).toBeNull();
    });

    it('counts blocks without text, or no blocks, as nothing', () => {
      renderPanel({
        highlights: [],
        recall: recallOf({ result: found([block('b2', '')]) }),
      });

      expect(recallPart()).toBeNull();
      expect(screen.getByText('Nothing for this page yet')).not.toBeNull();
    });

    it('shows a page found by its title only', () => {
      renderPanel({
        highlights: [],
        recall: recallOf({ result: { ...found([]), pages: [page] } }),
      });

      expect(recallPart()).not.toBeNull();
      expect(screen.getByText('Reading')).not.toBeNull();
    });

    it('shows one empty state when both are empty', () => {
      renderPanel({ highlights: [], recall: recallOf({ result: found([]) }) });

      expect(screen.getByText('Nothing for this page yet')).not.toBeNull();
      expect(highlightsPart()).toBeNull();
      expect(recallPart()).toBeNull();
      expect(separator()).toBeNull();
    });

    it('says when there is nothing to show on a page that cannot have any', () => {
      renderPanel({
        status: 'unavailable',
        highlights: [],
        recall: recallOf({ result: null }),
      });

      expect(screen.getByText('Not available on this page')).not.toBeNull();
    });
  });

  describe('while loading', () => {
    it('shows no empty state before both are known', () => {
      const { rerender } = renderPanel({
        highlights: [],
        recall: recallOf({ loading: true, result: null }),
      });
      expect(emptyState()).toBeNull();

      rerender(
        <SidebarPanel
          status="loading"
          highlights={[]}
          notice={null}
          onSelect={noop}
          onDelete={noop}
          onUpdateNote={async () => {}}
          recall={recallOf({ result: found([]) })}
          onRetryRecall={noop}
          search={idleSearch()}
          onOpenSettings={noop}
        />,
      );
      expect(emptyState()).toBeNull();
    });

    it('shows the highlights while Logseq is being searched, with nothing under them', () => {
      renderPanel({ recall: recallOf({ loading: true, result: null }) });

      expect(highlightsPart()).not.toBeNull();
      expect(separator()).toBeNull();
      expect(recallPart()).toBeNull();
    });
  });

  describe('when Logseq cannot be searched', () => {
    const failed = recallOf({ error: 'Cannot connect to Logseq', result: null });

    it('says why, with a retry, and still shows the highlights', () => {
      const onRetryRecall = vi.fn();
      renderPanel({ recall: failed, onRetryRecall });

      expect(highlightsPart()).not.toBeNull();
      expect(screen.getByText('text of a')).not.toBeNull();
      expect(separator()).not.toBeNull();
      expect(screen.getByRole('alert').textContent).toContain('Cannot connect to Logseq');

      fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
      expect(onRetryRecall).toHaveBeenCalledTimes(1);
    });

    it('shows the error instead of the empty state without highlights', () => {
      renderPanel({ recall: failed, highlights: [] });

      expect(screen.getByRole('alert')).not.toBeNull();
      expect(emptyState()).toBeNull();
    });
  });

  describe('the header', () => {
    it('names the graph, as a link that opens it in Logseq', () => {
      renderPanel();

      const graph = screen.getByRole('link', { name: 'my notes' });
      expect(graph.getAttribute('href')).toBe('logseq://graph/my%20notes');
    });

    it('leaves the graph out until it is known', () => {
      renderPanel({ recall: recallOf({ loading: true, result: null }) });

      expect(screen.queryByRole('link')).toBeNull();
    });

    it('names the graph a search found when the page has no recall', () => {
      renderPanel({
        recall: recallOf({ result: null }),
        search: idleSearch({ query: 'q', submitted: 'q', result: found() }),
      });

      expect(screen.getByRole('link', { name: 'my notes' })).not.toBeNull();
    });

    it('opens the settings', () => {
      const onOpenSettings = vi.fn();
      renderPanel({ onOpenSettings });

      fireEvent.click(screen.getByRole('button', { name: 'Settings' }));

      expect(onOpenSettings).toHaveBeenCalledTimes(1);
    });

    it('has no close button without onClose', () => {
      renderPanel();

      expect(closeButton()).toBeNull();
    });

    it('has a close button with onClose, and calls it on click', () => {
      const onClose = vi.fn();
      renderPanel({ onClose });

      fireEvent.click(closeButton()!);

      expect(onClose).toHaveBeenCalledTimes(1);
      // Only the button: no words next to it.
      expect(closeButton()!.textContent).toBe('');
    });
  });

  describe('searching the graph', () => {
    /** The panel with a real search (useLogseqSearch). */
    const SearchingPanel = (props: Partial<SidebarPanelProps>) => {
      const search = useLogseqSearch();
      return (
        <SidebarPanel
          status="ready"
          highlights={[highlight('a')]}
          notice={null}
          onSelect={noop}
          onDelete={noop}
          onUpdateNote={async () => {}}
          recall={recallOf()}
          onRetryRecall={noop}
          search={search}
          onOpenSettings={noop}
          {...props}
        />
      );
    };

    const box = () => screen.getByRole('searchbox', { name: 'Search Logseq' }) as HTMLInputElement;
    const searchPart = () => screen.queryByRole('region', { name: 'Search results' });
    const pageShown = () => !!highlightsPart() && !!recallPart();
    const searched = () =>
      sendMessage.mock.calls.filter(([type]) => type === 'logseq:search').map(([, q]) => q);

    const searchFor = async (query: string) => {
      fireEvent.change(box(), { target: { value: query } });
      await act(async () => {
        fireEvent.submit(box().form!);
      });
    };

    const answer = (blocks: LogseqBlockType[]) => ({
      status: 200,
      msg: '',
      response: { graph: 'my notes', pages: [], blocks },
    });

    beforeEach(() => {
      sendMessage.mockReset();
      sendMessage.mockResolvedValue(answer([block('s1', '<p>a found block</p>')]));
    });

    it('has a search box in the header, and nothing searched yet', () => {
      render(<SearchingPanel />);

      expect(screen.getByRole('banner').contains(box())).toBe(true);
      expect(box().placeholder).toBe('Search Logseq');
      expect(screen.queryByRole('button', { name: 'Clear search' })).toBeNull();
      expect(pageShown()).toBe(true);
    });

    it('searches on Enter, not while typing, and shows only what it found', async () => {
      render(<SearchingPanel />);

      fireEvent.change(box(), { target: { value: 'reading' } });
      expect(searched()).toEqual([]);
      expect(pageShown()).toBe(true);

      await act(async () => {
        fireEvent.submit(box().form!);
      });

      expect(searched()).toEqual(['reading']);
      expect(searchPart()).not.toBeNull();
      expect(screen.getByText('a found block')).not.toBeNull();
      // The page's highlights and recall are not shown (hidden, kept for later).
      expect(highlightsPart()).toBeNull();
      expect(recallPart()).toBeNull();
      expect(screen.getByText('text of a').closest('main')!.hidden).toBe(true);
      // No title or count over the results.
      expect(searchPart()!.textContent).not.toMatch(/result/i);
      expect(screen.queryByText('1')).toBeNull();
    });

    it('goes back to the page on Escape', async () => {
      render(<SearchingPanel />);
      await searchFor('reading');

      const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
      act(() => {
        box().dispatchEvent(escape);
      });

      // Handled here: an in-page sidebar's page does not get it either.
      expect(escape.defaultPrevented).toBe(true);
      expect(box().value).toBe('');
      expect(searchPart()).toBeNull();
      expect(pageShown()).toBe(true);
      expect(screen.getByText('text of a').closest('main')!.hidden).toBe(false);
    });

    it('leaves Escape alone with an empty box', () => {
      render(<SearchingPanel />);

      const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
      box().dispatchEvent(escape);

      expect(escape.defaultPrevented).toBe(false);
    });

    it('goes back to the page with the clear button', async () => {
      render(<SearchingPanel />);
      await searchFor('reading');

      fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));

      expect(box().value).toBe('');
      expect(searchPart()).toBeNull();
      expect(pageShown()).toBe(true);
    });

    it('goes back to the page when the box is emptied', async () => {
      render(<SearchingPanel />);
      await searchFor('reading');

      fireEvent.change(box(), { target: { value: '' } });

      expect(searchPart()).toBeNull();
      expect(pageShown()).toBe(true);
    });

    it('shows the spinner in the box, and nothing else, while searching', async () => {
      let finish!: (value: unknown) => void;
      sendMessage.mockReturnValueOnce(new Promise((resolve) => (finish = resolve)));
      render(<SearchingPanel />);

      await searchFor('reading');

      expect(screen.getByRole('progressbar', { name: 'Searching' })).not.toBeNull();
      expect(screen.queryByRole('button', { name: 'Clear search' })).toBeNull();
      expect(pageShown()).toBe(false);
      expect(searchPart()).toBeNull();
      expect(screen.queryByText('Nothing found')).toBeNull();

      await act(async () => finish(answer([block('s2', '<p>found later</p>')])));

      expect(screen.queryByRole('progressbar')).toBeNull();
      expect(screen.getByText('found later')).not.toBeNull();
    });

    it('says why the search failed, and searches again on Retry', async () => {
      sendMessage.mockResolvedValueOnce({ status: 500, msg: 'Cannot connect to Logseq' });
      render(<SearchingPanel />);
      await searchFor('reading');

      expect(screen.getByRole('alert').textContent).toContain('Cannot connect to Logseq');
      expect(pageShown()).toBe(false);

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
      });

      expect(searched()).toEqual(['reading', 'reading']);
      expect(screen.queryByRole('alert')).toBeNull();
      expect(screen.getByText('a found block')).not.toBeNull();
    });

    it('says when nothing was found', async () => {
      sendMessage.mockResolvedValueOnce(answer([]));
      render(<SearchingPanel />);
      await searchFor('nothing like it');

      expect(screen.getByText('Nothing found')).not.toBeNull();
      expect(pageShown()).toBe(false);
      expect(screen.queryByText('Nothing for this page yet')).toBeNull();
    });

    it('keeps the search when the page changes', async () => {
      const { rerender } = render(<SearchingPanel />);
      await searchFor('reading');

      rerender(<SearchingPanel highlights={[highlight('other')]} recall={recallOf({ loading: true, result: null })} />);

      expect(screen.getByText('a found block')).not.toBeNull();
      expect(box().value).toBe('reading');
    });
  });

  it('shows the notice', () => {
    renderPanel({ notice: "Couldn't delete the highlight" });

    expect(screen.getByRole('status').textContent).toBe(
      "Couldn't delete the highlight",
    );
  });

  it('passes a click on a highlight to onSelect', () => {
    const onSelect = vi.fn();
    renderPanel({ onSelect });

    fireEvent.click(screen.getByText('text of b'));

    expect(onSelect).toHaveBeenCalledWith('b');
  });

  it('opens web links in Logseq blocks in a new tab, and leaves logseq: links to the host', () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    renderPanel({
      recall: recallOf({
        result: found([
          block('b3', '<p><a href="https://github.com/logseq">repo</a> <a href="logseq://graph/my%20notes?page=x">x</a></p>'),
        ]),
      }),
    });

    const web = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
    screen.getByText('repo').dispatchEvent(web);
    const logseq = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
    screen.getByText('x').dispatchEvent(logseq);

    expect(web.defaultPrevented).toBe(true);
    expect(open).toHaveBeenCalledWith('https://github.com/logseq', '_blank', 'noopener,noreferrer');
    expect(open).toHaveBeenCalledTimes(1);
    expect(logseq.defaultPrevented).toBe(false);
    open.mockRestore();
  });
});
