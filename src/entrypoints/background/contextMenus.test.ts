import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing';
import { sendMessage } from '@/types/messaging';
import log from '@/utils/logger';

vi.mock('@/types/messaging', () => ({
  onMessage: vi.fn(),
  sendMessage: vi.fn(),
}));
vi.mock('./clip', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./clip')>()),
  clipToLogseq: vi.fn(),
}));

vi.mock('./clip-error-badge', () => ({
  showClipErrorBadge: vi.fn(),
  clearClipErrorBadges: vi.fn(),
  hasClipErrorBadge: vi.fn(() => false),
}));

import { clipToLogseq } from './clip';
import { clearClipErrorBadges, showClipErrorBadge } from './clip-error-badge';
import { CannotConnectWithLogseq, LogseqError } from './logseq/error';
import background from './index';

describe('background context menus', () => {
  const create = vi.fn();
  const onClicked = { addListener: vi.fn() };
  const onCommand = { addListener: vi.fn() };
  const sidePanelOpen = vi.fn();

  beforeEach(() => {
    vi.restoreAllMocks();
    fakeBrowser.reset();
    create.mockReset();
    onClicked.addListener.mockReset();
    onCommand.addListener.mockReset();
    sidePanelOpen.mockReset().mockResolvedValue(undefined);
    vi.mocked(sendMessage).mockReset();
    vi.mocked(clipToLogseq).mockReset().mockResolvedValue(undefined);
    vi.mocked(showClipErrorBadge).mockReset().mockResolvedValue(undefined);
    vi.mocked(clearClipErrorBadges).mockReset().mockResolvedValue(undefined);
    (fakeBrowser as any).contextMenus = { create, onClicked };
    (fakeBrowser as any).commands = { onCommand };
    (fakeBrowser as any).sidePanel = { open: sidePanelOpen };
  });

  it('does not create menus when the service worker starts', () => {
    background.main();
    expect(create).not.toHaveBeenCalled();
  });

  it('registers the click listener at startup', () => {
    background.main();
    expect(onClicked.addListener).toHaveBeenCalledTimes(1);
  });

  it('creates the menus on install/update', async () => {
    background.main();
    await fakeBrowser.runtime.onInstalled.trigger({
      reason: 'update',
      previousVersion: '99.0.0',
      temporary: false,
    } as any);
    expect(create.mock.calls.map(([o]) => o.id)).toEqual([
      'clip-with-selection',
      'clip-page',
      'open-highlights-sidebar',
    ]);
  });

  describe('opening the sidebar', () => {
    const click = (
      menuItemId: string,
      tab?: { id: number; windowId: number },
    ) => {
      background.main();
      const listener = onClicked.addListener.mock.calls[0][0];
      listener({ menuItemId }, tab);
    };
    const runCommand = (
      command: string,
      tab?: { id: number; windowId: number },
    ) => {
      background.main();
      const listener = onCommand.addListener.mock.calls[0][0];
      listener(command, tab);
    };

    it('is offered on pages, also with a selection', async () => {
      background.main();
      await fakeBrowser.runtime.onInstalled.trigger({
        reason: 'update',
        previousVersion: '99.0.0',
        temporary: false,
      } as any);

      const menu = create.mock.calls
        .map(([o]) => o)
        .find((o) => o.id === 'open-highlights-sidebar');
      expect(menu.contexts).toEqual(['page', 'selection']);
      expect(menu.title).toBe('Open sidebar');
    });

    it('opens the sidebar of the window from the menu item, right away', () => {
      click('open-highlights-sidebar', { id: 7, windowId: 3 });

      // No await in between: the user action is gone after one.
      expect(sidePanelOpen).toHaveBeenCalledTimes(1);
      expect(sidePanelOpen).toHaveBeenCalledWith({ windowId: 3 });
      expect(sendMessage).not.toHaveBeenCalled();
    });

    it('opens the sidebar of the window from the open-sidebar command, right away', () => {
      runCommand('open-sidebar', { id: 7, windowId: 3 });

      expect(sidePanelOpen).toHaveBeenCalledTimes(1);
      expect(sidePanelOpen).toHaveBeenCalledWith({ windowId: 3 });
      expect(sendMessage).not.toHaveBeenCalled();
    });

    it('opens the sidebar of the window from the toolbar button, right away', () => {
      background.main();

      void fakeBrowser.action.onClicked.trigger(
        { id: 7, windowId: 3 } as any,
        undefined,
      );

      expect(sidePanelOpen).toHaveBeenCalledTimes(1);
      expect(sidePanelOpen).toHaveBeenCalledWith({ windowId: 3 });
    });

    it('does nothing but warn when there is no tab', () => {
      const warn = vi.spyOn(log, 'warn').mockImplementation(() => {});

      click('open-highlights-sidebar', undefined);
      expect(warn).toHaveBeenCalledTimes(1);
      runCommand('open-sidebar', undefined);
      expect(warn).toHaveBeenCalledTimes(2);

      expect(sidePanelOpen).not.toHaveBeenCalled();
      expect(sendMessage).not.toHaveBeenCalled();
    });

    it('logs the error when the browser refuses to open it', async () => {
      const error = vi.spyOn(log, 'error').mockImplementation(() => {});
      const refusal = new Error('may only be called in response to a gesture');
      sidePanelOpen.mockRejectedValue(refusal);

      expect(() =>
        click('open-highlights-sidebar', { id: 7, windowId: 3 }),
      ).not.toThrow();

      await vi.waitFor(() => expect(error).toHaveBeenCalledTimes(1));
      expect(error.mock.calls[0]).toContain(refusal);
    });

    it('opens the sidebar drawn on pages where the browser has none, also without a tab', async () => {
      delete (fakeBrowser as any).sidePanel;
      const warn = vi.spyOn(log, 'warn').mockImplementation(() => {});
      const isOpen = async () =>
        (await fakeBrowser.storage.local.get('inPageSidebarOpen'))
          .inPageSidebarOpen;

      click('open-highlights-sidebar', { id: 7, windowId: 3 });
      await vi.waitFor(async () => expect(await isOpen()).toBe(true));

      await fakeBrowser.storage.local.set({ inPageSidebarOpen: false });
      // Safari passes no tab to commands.
      runCommand('open-sidebar', undefined);
      await vi.waitFor(async () => expect(await isOpen()).toBe(true));

      expect(warn).not.toHaveBeenCalled();
      expect(sendMessage).not.toHaveBeenCalled();
    });

    it('leaves the clip menu items and the clip command alone', () => {
      click('clip-page', { id: 7, windowId: 3 });
      expect(sendMessage).toHaveBeenLastCalledWith(
        'content:quickCapturePage',
        undefined,
        { tabId: 7 },
      );

      click('clip-with-selection', { id: 7, windowId: 3 });
      expect(sendMessage).toHaveBeenLastCalledWith(
        'content:quickCaptureWithSelection',
        undefined,
        { tabId: 7 },
      );

      runCommand('clip', { id: 7, windowId: 3 });
      expect(sendMessage).toHaveBeenLastCalledWith(
        'content:quickCapture',
        undefined,
        { tabId: 7 },
      );

      expect(sidePanelOpen).not.toHaveBeenCalled();
    });
  });

  describe('clipping a selection where the content script cannot run (#60)', () => {
    const noReceiver = () =>
      new Error('Could not establish connection. Receiving end does not exist.');
    const clickSelection = (
      info: { selectionText?: string; pageUrl?: string },
      tab?: { id?: number; windowId: number; url?: string; title?: string },
    ) => {
      background.main();
      const listener = onClicked.addListener.mock.calls[0][0];
      listener({ menuItemId: 'clip-with-selection', ...info }, tab);
    };
    const pdfTab = {
      id: 7,
      windowId: 3,
      url: 'https://example.com/paper.pdf',
      title: 'paper.pdf',
    };

    it('leaves the clip to the content script when it answers', async () => {
      vi.mocked(sendMessage).mockResolvedValue(undefined);

      clickSelection({ selectionText: 'a quote', pageUrl: pdfTab.url }, pdfTab);
      await new Promise((r) => setTimeout(r, 0));

      expect(clipToLogseq).not.toHaveBeenCalled();
      // A failure there is the content script's to show, in the page.
      expect(showClipErrorBadge).not.toHaveBeenCalled();
    });

    it('clips the selected text from the background when the tab has no receiver', async () => {
      vi.mocked(sendMessage).mockRejectedValue(noReceiver());

      clickSelection({ selectionText: 'a quote', pageUrl: pdfTab.url }, pdfTab);

      await vi.waitFor(() => expect(clipToLogseq).toHaveBeenCalledTimes(1));
      expect(clipToLogseq).toHaveBeenCalledWith({
        url: 'https://example.com/paper.pdf',
        title: 'paper.pdf',
        data: 'a quote',
      });
      await vi.waitFor(() => expect(clearClipErrorBadges).toHaveBeenCalledTimes(1));
      expect(showClipErrorBadge).not.toHaveBeenCalled();
    });

    it('clips from the background when the click has no tab id', async () => {
      clickSelection(
        { selectionText: 'a quote', pageUrl: pdfTab.url },
        { windowId: 3, url: pdfTab.url, title: 'paper.pdf' },
      );

      await vi.waitFor(() => expect(clipToLogseq).toHaveBeenCalledTimes(1));
      expect(sendMessage).not.toHaveBeenCalled();
    });

    it('does not clip from the background without selected text', async () => {
      vi.mocked(sendMessage).mockRejectedValue(noReceiver());

      clickSelection({ pageUrl: pdfTab.url }, pdfTab);

      await vi.waitFor(() => expect(showClipErrorBadge).toHaveBeenCalledTimes(1));
      expect(clipToLogseq).not.toHaveBeenCalled();
    });
  });

  describe('a failed clip no page can show (#48)', () => {
    const noReceiver = () =>
      new Error('Could not establish connection. Receiving end does not exist.');
    const tab = { id: 7, windowId: 3, url: 'chrome://newtab/', title: 'New Tab' };
    const listenerOf = (event: { addListener: { mock: { calls: any[][] } } }) => {
      background.main();
      return event.addListener.mock.calls[0][0];
    };

    beforeEach(() => {
      vi.mocked(sendMessage).mockRejectedValue(noReceiver());
    });

    it.each([
      ['the clip shortcut', () => listenerOf(onCommand)('clip', tab)],
      ['Clip page link', () => listenerOf(onClicked)({ menuItemId: 'clip-page' }, tab)],
    ])('puts the error on the toolbar button of the tab: %s', async (_, run) => {
      run();

      await vi.waitFor(() => expect(showClipErrorBadge).toHaveBeenCalledTimes(1));
      expect(showClipErrorBadge).toHaveBeenCalledWith(
        7,
        'Cannot clip this page: extensions cannot run on it.',
      );
      expect(clipToLogseq).not.toHaveBeenCalled();
    });

    it('shows the Logseq error when the clip of the selection from the background fails', async () => {
      vi.mocked(clipToLogseq).mockRejectedValue(new LogseqError(CannotConnectWithLogseq));

      listenerOf(onClicked)(
        { menuItemId: 'clip-with-selection', selectionText: 'a quote' },
        { ...tab, url: 'https://example.com/paper.pdf' },
      );

      await vi.waitFor(() => expect(showClipErrorBadge).toHaveBeenCalledTimes(1));
      expect(showClipErrorBadge).toHaveBeenCalledWith(7, CannotConnectWithLogseq.msg);
      expect(clearClipErrorBadges).not.toHaveBeenCalled();
    });
  });
});
