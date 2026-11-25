/**
 * The highlight management page: the empty state, and "Clear All", which
 * asks first.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { HighlightData } from '@/types/highlight';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const service = vi.hoisted(() => ({
  getHighlights: vi.fn(),
  clearHighlights: vi.fn(),
  deleteHighlight: vi.fn(),
}));
vi.mock('@/utils/highlight-service', () => ({ HighlightService: service }));

import { HighlightsPage } from './highlights-page';

const stored: HighlightData = {
  id: 'h1',
  url: 'https://example.com/',
  title: 'Example',
  hostname: 'example.com',
  range: {
    startContainerXPath: '/html',
    endContainerXPath: '/html',
    startOffset: 0,
    endOffset: 5,
    textContent: 'hello world',
  },
  createdAt: Date.now(),
  lastAccessedAt: Date.now(),
} as HighlightData;

const mount = async () => {
  render(<HighlightsPage />);
  await act(async () => {});
};

describe('HighlightsPage', () => {
  beforeEach(() => {
    service.getHighlights.mockReset().mockResolvedValue([]);
    service.clearHighlights.mockReset().mockResolvedValue({ success: true });
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('says there is nothing yet, and how to start', async () => {
    await mount();
    expect(screen.getByText('No highlights found')).toBeTruthy();
    expect(
      screen.getByText('Start highlighting text on websites to see them here'),
    ).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Clear All' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it('keeps the highlights when the user declines to clear them', async () => {
    service.getHighlights.mockResolvedValue([stored]);
    const confirmSpy = vi.fn(() => false);
    vi.stubGlobal('confirm', confirmSpy);
    await mount();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Clear All' }));
    });
    expect(confirmSpy).toHaveBeenCalledWith(
      'Are you sure you want to delete ALL highlights? This action cannot be undone.',
    );
    expect(service.clearHighlights).not.toHaveBeenCalled();
    expect(screen.getByText('hello world')).toBeTruthy();
  });

  it('clears the highlights when the user agrees', async () => {
    service.getHighlights.mockResolvedValue([stored]);
    vi.stubGlobal('confirm', () => true);
    await mount();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Clear All' }));
    });
    expect(service.clearHighlights).toHaveBeenCalledTimes(1);
    expect(screen.getByText('No highlights found')).toBeTruthy();
  });
});
