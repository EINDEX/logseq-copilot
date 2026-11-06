import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { HighlightsPanel, type HighlightsPanelProps } from './HighlightsPanel';
import type { HighlightData } from '@/types/highlight';

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

const noop = () => {};

const renderPanel = (props: Partial<HighlightsPanelProps> = {}) =>
  render(
    <HighlightsPanel
      page={{ title: 'Page one', url: 'https://one.example/page' }}
      status="ready"
      highlights={[highlight('a'), highlight('b')]}
      notice={null}
      onSelect={noop}
      onDelete={noop}
      onUpdateNote={async () => {}}
      {...props}
    />,
  );

const closeButton = () => screen.queryByRole('button', { name: 'Close' });

describe('HighlightsPanel', () => {
  afterEach(() => {
    cleanup();
  });

  it('names the page and counts its highlights', () => {
    renderPanel();

    expect(screen.getByText('Highlights')).not.toBeNull();
    expect(screen.getByText('Page one')).not.toBeNull();
    expect(screen.getByText('2')).not.toBeNull();
    expect(screen.getByText('text of a')).not.toBeNull();
    expect(screen.getByText('text of b')).not.toBeNull();
  });

  it('names the page by its domain when it has no title', () => {
    renderPanel({
      page: { title: '', url: 'https://one.example/page' },
      highlights: [],
    });

    expect(screen.getByText('one.example')).not.toBeNull();
  });

  it('has no count and no list while loading, or where highlights are not available', () => {
    const { rerender } = renderPanel({ status: 'loading' });
    expect(screen.getByText('Loading highlights...')).not.toBeNull();
    expect(screen.queryByText('2')).toBeNull();
    expect(screen.queryByText('text of a')).toBeNull();

    rerender(
      <HighlightsPanel
        page={{ title: 'Extensions', url: null }}
        status="unavailable"
        highlights={[]}
        notice={null}
        onSelect={noop}
        onDelete={noop}
        onUpdateNote={async () => {}}
      />,
    );
    expect(
      screen.getByText("Highlights aren't available on this page"),
    ).not.toBeNull();
    expect(screen.getByText('Extensions')).not.toBeNull();
  });

  it('shows the notice', () => {
    renderPanel({ notice: "Couldn't delete the highlight" });

    expect(screen.getByRole('status').textContent).toBe(
      "Couldn't delete the highlight",
    );
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

  it('passes a click on a highlight to onSelect', () => {
    const onSelect = vi.fn();
    renderPanel({ onSelect });

    fireEvent.click(screen.getByText('text of b'));

    expect(onSelect).toHaveBeenCalledWith('b');
  });
});
