import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

// Task checkboxes in the results talk to the background.
vi.mock('@/types/messaging', () => ({ sendMessage: vi.fn() }));

import { SidebarPanel, type SidebarPanelProps } from './SidebarPanel';
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

      expect(screen.queryByRole('link', { name: 'my notes' })).toBeNull();
      expect(screen.getByRole('banner').textContent).toBe('');
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
