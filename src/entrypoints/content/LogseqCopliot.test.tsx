import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';

const sendMessage = vi.fn();
vi.mock('@/types/messaging', () => ({
  sendMessage: (...args: unknown[]) => sendMessage(...args),
  onMessage: vi.fn(),
}));
vi.mock('@/assets/globals.css', () => ({}));

import { LogseqCopliot } from './LogseqCopliot';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe('LogseqCopliot re-search on URL changes', () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(async () => {
    vi.useFakeTimers();
    sendMessage.mockReset();
    sendMessage.mockResolvedValue({
      msg: 'success',
      status: 200,
      response: { blocks: [], pages: [], graph: 'g' },
    });
    container = document.createElement('div');
    document.body.appendChild(container);
    await act(async () => {
      root = createRoot(container);
      root.render(<LogseqCopliot query="q" />);
    });
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.useRealTimers();
  });

  it('searches once on mount', () => {
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalledWith(
      'logseq:hybridSearch',
      expect.objectContaining({
        url: window.location.href,
        query: 'q',
        keywordOnly: true,
      }),
    );
  });

  it('ignores synthetic popstate/hashchange events dispatched by the page', async () => {
    window.history.replaceState(null, '', '/changed#x');
    await act(async () => {
      for (let i = 0; i < 5; i++) {
        window.dispatchEvent(new PopStateEvent('popstate'));
        window.dispatchEvent(new HashChangeEvent('hashchange'));
      }
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });
});
