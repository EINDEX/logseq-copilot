/**
 * Content script startup. Restoring saved highlights can be slow, and it must
 * not delay the message handlers: a clip shortcut pressed meanwhile has to
 * clip at once. Only saving the highlight for that clip waits for the restore.
 *
 * What the browser sidebar needs from the page (scrolling to a highlight,
 * following its edits) does not depend on the clip float button either.
 */
import { beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { fakeBrowser } from 'wxt/testing';
import type { HighlightData } from '@/types/highlight';

const messaging = vi.hoisted(() => ({
  handlers: new Map<string, (message: { data: unknown }) => unknown>(),
  sendMessage: vi.fn(),
}));

vi.mock('@/types/messaging', () => ({
  sendMessage: (...args: unknown[]) => messaging.sendMessage(...args),
  onMessage: (name: string, handler: (message: { data: unknown }) => unknown) => {
    messaging.handlers.set(name, handler);
  },
}));
vi.mock('wxt/utils/content-script-ui/shadow-root', () => ({
  createShadowRootUi: vi.fn(async () => undefined),
}));
vi.mock('@/assets/globals.css', () => ({}));
vi.mock('./index.module.scss', () => ({ default: {} }));
vi.mock('../../assets/img/logo.png', () => ({ default: '' }));

import { HighlightService } from '@/utils/highlight-service';
import { HighlightManager } from '@/utils/highlight-manager';
import { contentEvents } from '@/utils/content-events';
import contentScript from './index';

const saved: HighlightData = {
  id: 'h1',
  url: 'http://localhost:3000/',
  title: 'Page',
  hostname: 'localhost',
  range: {
    startContainerXPath: '/html/body[1]/p[1]',
    endContainerXPath: '/html/body[1]/p[1]',
    startOffset: 0,
    endOffset: 11,
    textContent: 'hello world',
  },
  createdAt: 1,
  lastAccessedAt: 1,
};

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

const selectText = () => {
  document.body.innerHTML = '<p id="p">hello world</p>';
  const range = document.createRange();
  range.selectNodeContents(document.getElementById('p')!);
  window.getSelection()!.removeAllRanges();
  window.getSelection()!.addRange(range);
};

describe('content script startup', () => {
  let save: MockInstance<typeof HighlightService.saveHighlight>;

  beforeEach(() => {
    fakeBrowser.reset();
    messaging.handlers.clear();
    messaging.sendMessage.mockReset();
    (globalThis as any).CSS = { highlights: new Map() };
    (globalThis as any).Highlight = class {
      add() {}
      clear() {}
    };
    HighlightManager.getInstance().cleanup();
    vi.restoreAllMocks();
    // happy-dom has no XPath, so displaying a highlight is out of scope here.
    vi.spyOn(HighlightManager.prototype, 'displayHighlight').mockResolvedValue(
      true,
    );
    save = vi
      .spyOn(HighlightService, 'saveHighlight')
      .mockResolvedValue({ success: true, message: 'ok', data: saved });
  });

  it('handles quickCapture while highlights are still restoring, and saves the highlight once they are ready', async () => {
    const restore = deferred<HighlightData[]>();
    vi.spyOn(HighlightService, 'getCurrentPageHighlights').mockReturnValue(
      restore.promise,
    );
    const added = vi.fn();
    const off = contentEvents.on('highlightAdded', added);

    // Do not await main: the restore below never resolves until we say so.
    void (contentScript as any).main({});

    // All handlers are registered synchronously, before any await.
    for (const name of [
      'content:quickCapture',
      'content:quickCaptureWithSelection',
      'content:quickCapturePage',
    ]) {
      expect(messaging.handlers.has(name), name).toBe(true);
    }

    selectText();
    await messaging.handlers.get('content:quickCapture')!({ data: undefined });
    await flush();

    // The clip ran at once, although the restore is still pending ...
    expect(messaging.sendMessage).toHaveBeenCalledWith(
      'logseq:clipWithSelection',
      'hello world',
    );
    // ... and only the highlight save is waiting for it.
    expect(save).not.toHaveBeenCalled();

    restore.resolve([]);
    await flush();

    expect(save).toHaveBeenCalledTimes(1);
    expect(added).toHaveBeenCalledWith(saved);
    off();
  });

  it('clips the page at once while highlights are still restoring', async () => {
    vi.spyOn(HighlightService, 'getCurrentPageHighlights').mockReturnValue(
      new Promise(() => {}),
    );
    void (contentScript as any).main({});

    await messaging.handlers.get('content:quickCapturePage')!({
      data: undefined,
    });

    expect(messaging.sendMessage).toHaveBeenCalledWith('logseq:clipPage');
  });

  it('a failed restore still lets the highlight be saved', async () => {
    const restore = deferred<HighlightData[]>();
    vi.spyOn(HighlightService, 'getCurrentPageHighlights').mockReturnValue(
      restore.promise,
    );
    void (contentScript as any).main({});

    selectText();
    await messaging.handlers.get('content:quickCapture')!({ data: undefined });
    await flush();
    expect(save).not.toHaveBeenCalled();

    restore.reject(new Error('storage unavailable'));
    await flush();

    await expect(HighlightManager.getInstance().ready).resolves.toBeUndefined();
    expect(save).toHaveBeenCalledTimes(1);
  });
  describe('for the browser sidebar', () => {
    it('handles scrollToHighlight from the start, whatever the float button setting', async () => {
      const scroll = vi
        .spyOn(HighlightManager.prototype, 'scrollToHighlight')
        .mockResolvedValue(true);
      vi.spyOn(HighlightService, 'getCurrentPageHighlights').mockReturnValue(
        new Promise(() => {}),
      );

      // Not awaited: it is still waiting for the restore and the UI.
      void (contentScript as any).main({});

      // Registered synchronously, before any await, so before the float button
      // setting is even read.
      expect(messaging.handlers.has('content:scrollToHighlight')).toBe(true);
      const handler = messaging.handlers.get('content:scrollToHighlight')!;

      await expect(handler({ data: { id: 'h1' } })).resolves.toBe(true);
      expect(scroll).toHaveBeenCalledWith('h1');

      scroll.mockResolvedValue(false);
      await expect(handler({ data: { id: 'gone' } })).resolves.toBe(false);
      expect(scroll).toHaveBeenLastCalledWith('gone');
    });

    it('follows highlights changed in other contexts from the start, whatever the float button setting', async () => {
      await fakeBrowser.storage.local.set({ highlights: [saved] });
      const removed = vi.fn();
      const off = contentEvents.on('highlightRemoved', removed);

      void (contentScript as any).main({});
      await HighlightManager.getInstance().ready;

      await fakeBrowser.storage.local.set({ highlights: [] });

      await vi.waitFor(() =>
        expect(removed).toHaveBeenCalledWith({ highlightId: 'h1' }),
      );
      off();
    });
  });
});
