import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, waitFor, cleanup } from '@testing-library/react';
import { browser } from 'wxt/browser';

const sendMessage = vi.fn();
vi.mock('@/types/messaging', () => ({
  sendMessage: (...args: unknown[]) => sendMessage(...args),
}));

import Popup from './Popup';

describe('Popup', () => {
  beforeEach(() => {
    cleanup();
    sendMessage.mockReset();
    sendMessage.mockResolvedValue({
      status: 200,
      response: { graph: 'g', pages: [], blocks: [], count: 0 },
    });
  });

  it('searches the current tab URL as soon as the popup opens', async () => {
    vi.spyOn(browser.tabs, 'query').mockResolvedValue([
      { id: 1, url: 'https://example.com/page', title: 'Example' },
    ] as Browser.tabs.Tab[]);

    render(<Popup />);

    await waitFor(() =>
      expect(sendMessage).toHaveBeenCalledWith('logseq:urlSearch', {
        url: 'https://example.com/page',
        options: { fuzzy: true },
      }),
    );
  });

  it('does not search for chrome:// pages', async () => {
    vi.spyOn(browser.tabs, 'query').mockResolvedValue([
      { id: 1, url: 'chrome://extensions', title: 'Extensions' },
    ] as Browser.tabs.Tab[]);

    render(<Popup />);
    await new Promise((r) => setTimeout(r, 50));

    expect(sendMessage).not.toHaveBeenCalledWith(
      'logseq:urlSearch',
      expect.anything(),
    );
  });
});
