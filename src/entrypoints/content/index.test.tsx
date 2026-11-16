/**
 * Content script startup. Restoring saved highlights can be slow, and it must
 * not delay the message handlers: a clip shortcut pressed meanwhile has to
 * clip at once. Only saving the highlight for that clip waits for the restore.
 *
 * What the browser sidebar needs from the page (scrolling to a highlight,
 * following its edits) does not depend on the clip float button either.
 */
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
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
vi.mock('./arc-detection', () => ({ detectArc: vi.fn() }));

import { createShadowRootUi } from 'wxt/utils/content-script-ui/shadow-root';
import { HighlightService } from '@/utils/highlight-service';
import { HighlightManager } from '@/utils/highlight-manager';
import { contentEvents } from '@/utils/content-events';
import { detectArc } from './arc-detection';
import { getActivePicker, openClipPicker } from './clip-picker';
import { defaultTemplateIdItem, templates } from '@/utils/storage';
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

    // Do not await main: the restore below never resolves until we say so.
    void (contentScript as any).main({ onInvalidated: vi.fn() });

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
  });

  it('clips the page at once while highlights are still restoring', async () => {
    vi.spyOn(HighlightService, 'getCurrentPageHighlights').mockReturnValue(
      new Promise(() => {}),
    );
    void (contentScript as any).main({ onInvalidated: vi.fn() });

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
    void (contentScript as any).main({ onInvalidated: vi.fn() });

    selectText();
    await messaging.handlers.get('content:quickCapture')!({ data: undefined });
    await flush();
    expect(save).not.toHaveBeenCalled();

    restore.reject(new Error('storage unavailable'));
    await flush();

    await expect(HighlightManager.getInstance().ready).resolves.toBeUndefined();
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('tells the browser sidebar whether there is a selection to clip, from the start', async () => {
    vi.spyOn(HighlightService, 'getCurrentPageHighlights').mockReturnValue(
      new Promise(() => {}),
    );
    void (contentScript as any).main({ onInvalidated: vi.fn() });
    const hasSelection = messaging.handlers.get('content:hasSelection')!;

    document.body.innerHTML = '<p id="p">hello world</p>';
    window.getSelection()!.removeAllRanges();
    expect(await hasSelection({ data: undefined })).toBe(false);

    window.getSelection()!.collapse(document.getElementById('p')!.firstChild, 2);
    expect(await hasSelection({ data: undefined })).toBe(false);

    selectText();
    expect(await hasSelection({ data: undefined })).toBe(true);
  });

  it('answers a clip command once the clip is done, with the failure when the sidebar asks for it', async () => {
    vi.spyOn(HighlightService, 'getCurrentPageHighlights').mockReturnValue(
      new Promise(() => {}),
    );
    void (contentScript as any).main({ onInvalidated: vi.fn() });
    messaging.sendMessage.mockRejectedValue(new Error('Cannot connect to Logseq'));

    // From the background: shown in the page, the command resolves.
    await expect(
      messaging.handlers.get('content:quickCapturePage')!({ data: undefined }),
    ).resolves.toBeUndefined();
    // From the browser sidebar: the sidebar shows it.
    await expect(
      messaging.handlers.get('content:quickCaptureWithSelection')!({
        data: { feedback: 'sender' },
      }),
    ).rejects.toThrow('Cannot connect to Logseq');
  });

  describe('the clip shortcut and the picker panel', () => {
    const RESULT = { templateId: 'default', page: 'Nov 16th, 2026', rootUuid: 'r' };
    const TWO = [
      { id: 'default', name: 'Clip', content: '{{content}}' },
      { id: 'task', name: 'Task', content: 'TODO {{content}}', pinned: true },
    ];

    beforeEach(() => {
      vi.spyOn(HighlightService, 'getCurrentPageHighlights').mockReturnValue(
        new Promise(() => {}),
      );
      void (contentScript as any).main({ onInvalidated: vi.fn() });
      messaging.sendMessage.mockResolvedValue(RESULT);
    });

    afterEach(() => {
      getActivePicker()?.destroy();
    });

    it('saves at once, as always, when only the default is on offer', async () => {
      await messaging.handlers.get('content:quickCapture')!({ data: undefined });
      await flush();

      expect(getActivePicker()).toBeNull();
      expect(messaging.sendMessage).toHaveBeenCalledWith('logseq:clipPage');
    });

    it('opens the panel when a template is pinned, and saves nothing yet', async () => {
      await templates.setValue(TWO);
      await messaging.handlers.get('content:quickCapture')!({ data: undefined });
      await flush();

      expect(getActivePicker()?.getView().templates.map((x) => x.id)).toEqual(['default', 'task']);
      expect(messaging.sendMessage).not.toHaveBeenCalled();
    });

    it('offers the default first, whichever place it has in the list', async () => {
      await templates.setValue([{ ...TWO[0], pinned: true }, TWO[1]]);
      await defaultTemplateIdItem.setValue('task');
      await messaging.handlers.get('content:quickCapture')!({ data: undefined });
      await flush();

      expect(getActivePicker()?.getView().templates.map((x) => x.id)).toEqual(['task', 'default']);
    });

    it('the shortcut again saves the highlighted template, with the note so far', async () => {
      await templates.setValue(TWO);
      await messaging.handlers.get('content:quickCapture')!({ data: undefined });
      await flush();
      getActivePicker()!.setNote('first thoughts');

      await messaging.handlers.get('content:quickCapture')!({ data: undefined });
      await flush();

      expect(getActivePicker()).toBeNull();
      expect(messaging.sendMessage).toHaveBeenCalledTimes(1);
      expect(messaging.sendMessage).toHaveBeenCalledWith('logseq:clipPage', {
        templateId: 'default',
        note: 'first thoughts',
      });
    });

    it('clips anew, with no panel, for a command that names its template (clip-task)', async () => {
      await templates.setValue(TWO);
      await messaging.handlers.get('content:quickCapture')!({ data: { templateId: 'task' } });
      await flush();

      expect(getActivePicker()).toBeNull();
      expect(messaging.sendMessage).toHaveBeenCalledWith('logseq:clipPage', { templateId: 'task' });
    });

    it('is a command of the page only: the sidebar’s clip is a clip', async () => {
      await templates.setValue(TWO);
      await messaging.handlers.get('content:quickCapture')!({ data: { feedback: 'sender' } });
      await flush();

      expect(getActivePicker()).toBeNull();
      expect(messaging.sendMessage).toHaveBeenCalledWith('logseq:clipPage');
    });

    it('is not asked for by the context menu or the sidebar commands', async () => {
      await templates.setValue(TWO);
      await messaging.handlers.get('content:quickCapturePage')!({ data: undefined });
      await messaging.handlers.get('content:quickCaptureWithSelection')!({ data: { templateId: 'task' } });
      await flush();

      expect(getActivePicker()).toBeNull();
    });

    it('cancelling the panel writes nothing', async () => {
      await templates.setValue(TWO);
      await messaging.handlers.get('content:quickCapture')!({ data: undefined });
      await flush();
      getActivePicker()!.cancel();
      expect(messaging.sendMessage).not.toHaveBeenCalled();
    });

    it('keeps no panel of its own: openClipPicker replaces the one that is up', () => {
      const first = openClipPicker({ templates: [{ id: 'a', name: 'A' }], onDecide: vi.fn() });
      openClipPicker({ templates: [{ id: 'b', name: 'B' }], onDecide: vi.fn() });
      expect(first.getView().phase).toBe('closed');
      expect(getActivePicker()?.getView().templates[0].id).toBe('b');
    });
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
      void (contentScript as any).main({ onInvalidated: vi.fn() });

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

      void (contentScript as any).main({ onInvalidated: vi.fn() });
      await HighlightManager.getInstance().ready;

      await fakeBrowser.storage.local.set({ highlights: [] });

      await vi.waitFor(() =>
        expect(removed).toHaveBeenCalledWith({ highlightId: 'h1' }),
      );
      off();
    });
  });
});

describe('content script UI mounting', () => {
  const mountedNames = () =>
    vi.mocked(createShadowRootUi).mock.calls.map(([, options]) => options.name);

  beforeEach(async () => {
    fakeBrowser.reset();
    messaging.handlers.clear();
    vi.mocked(createShadowRootUi).mockClear();
    (globalThis as any).CSS = { highlights: new Map() };
    (globalThis as any).Highlight = class {
      add() {}
      clear() {}
    };
    HighlightManager.getInstance().cleanup();
    vi.restoreAllMocks();
    vi.spyOn(HighlightService, 'getCurrentPageHighlights').mockResolvedValue(
      [],
    );
  });

  // The highlights list lives in the browser sidebar: the page only gets the
  // comment popup (and the float button, when it is on).
  it('mounts the highlight UI (comment popup) with the default config, where the float button is off', async () => {
    await (contentScript as any).main({ onInvalidated: vi.fn() });

    expect(new Set(mountedNames())).toEqual(new Set(['logseq-copilot-popup']));
  });

  it('mounts the highlight UI as well when the float button is on', async () => {
    await fakeBrowser.storage.local.set({ enableClipNoteFloatButton: true });
    await (contentScript as any).main({ onInvalidated: vi.fn() });

    expect(new Set(mountedNames())).toEqual(new Set(['logseq-copilot-popup']));
  });
});

// Browsers without a sidebar of their own (src/utils/sidebar.ts).
describe('content script in-page highlights sidebar', () => {
  const ctx = { addEventListener: vi.fn(), onInvalidated: vi.fn() };
  const sidebarUi = {
    mount: vi.fn(),
    remove: vi.fn(),
    mounted: undefined,
    shadow: new EventTarget(),
  };
  const sidebarCreated = () =>
    vi
      .mocked(createShadowRootUi)
      .mock.calls.some(([, options]) => options.name === 'logseq-copilot-highlights');

  beforeEach(() => {
    fakeBrowser.reset();
    messaging.handlers.clear();
    sidebarUi.mount.mockClear();
    sidebarUi.remove.mockClear();
    (globalThis as any).CSS = { highlights: new Map() };
    (globalThis as any).Highlight = class {
      add() {}
      clear() {}
    };
    HighlightManager.getInstance().cleanup();
    vi.restoreAllMocks();
    vi.mocked(createShadowRootUi)
      .mockClear()
      .mockImplementation((async (_ctx: unknown, options: { name: string }) =>
        options.name === 'logseq-copilot-highlights' ? sidebarUi : undefined) as never);
    vi.spyOn(HighlightService, 'getCurrentPageHighlights').mockResolvedValue(
      [],
    );
  });

  afterEach(() => {
    vi.mocked(createShadowRootUi).mockImplementation((async () => undefined) as never);
  });

  it('is mounted while open, and removed when closed', async () => {
    await fakeBrowser.storage.local.set({ inPageSidebarOpen: true });

    await (contentScript as any).main(ctx);

    await vi.waitFor(() => expect(sidebarUi.mount).toHaveBeenCalledTimes(1));

    await fakeBrowser.storage.local.set({ inPageSidebarOpen: false });

    await vi.waitFor(() => expect(sidebarUi.remove).toHaveBeenCalledTimes(1));
  });

  it('is not on the page while closed', async () => {
    await (contentScript as any).main(ctx);

    expect(sidebarCreated()).toBe(false);
  });

  it('is not mounted in a frame', async () => {
    vi.spyOn(window, 'top', 'get').mockReturnValue({} as Window);
    await fakeBrowser.storage.local.set({ inPageSidebarOpen: true });

    await (contentScript as any).main(ctx);
    await flush();

    expect(sidebarCreated()).toBe(false);
  });

  // Arc has the side panel API but never shows the panel.
  describe('looking for Arc', () => {
    beforeEach(() => {
      vi.mocked(detectArc).mockClear();
    });

    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it('looks in the top frame of pages', async () => {
      await (contentScript as any).main(ctx);

      expect(detectArc).toHaveBeenCalledTimes(1);
      expect(detectArc).toHaveBeenCalledWith(ctx);
    });

    it('does not look in a frame', async () => {
      vi.spyOn(window, 'top', 'get').mockReturnValue({} as Window);

      await (contentScript as any).main(ctx);

      expect(detectArc).not.toHaveBeenCalled();
    });

    it('does not look in Firefox', async () => {
      vi.stubEnv('FIREFOX', 'true');

      await (contentScript as any).main(ctx);

      expect(detectArc).not.toHaveBeenCalled();
    });
  });
});
