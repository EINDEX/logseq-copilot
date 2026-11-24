import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing';
import { storage } from '#imports';
import { sendMessage } from '@/types/messaging';
import { templates, uiLanguageItem } from '@/utils/storage';
import { i18n } from '@/i18n/core';
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
  // Like the browser: a duplicate id fails through lastError.
  const menuIds = new Set<string>();
  const duplicates: string[] = [];
  const fakeCreate = (item: { id: string }, callback?: () => void) => {
    if (menuIds.has(item.id)) {
      duplicates.push(item.id);
      (fakeBrowser as any).runtime.lastError = {
        message: `Cannot create item with duplicate id ${item.id}`,
      };
    } else menuIds.add(item.id);
    callback?.();
    delete (fakeBrowser as any).runtime.lastError;
  };
  const fakeRemoveAll = async () => {
    menuIds.clear();
  };
  const create = vi.fn();
  const removeAll = vi.fn();
  const onClicked = { addListener: vi.fn() };
  const onCommand = { addListener: vi.fn() };
  const sidePanelOpen = vi.fn();

  beforeEach(() => {
    vi.restoreAllMocks();
    fakeBrowser.reset();
    menuIds.clear();
    duplicates.length = 0;
    create.mockReset().mockImplementation(fakeCreate);
    removeAll.mockReset().mockImplementation(fakeRemoveAll);
    onClicked.addListener.mockReset();
    onCommand.addListener.mockReset();
    sidePanelOpen.mockReset().mockResolvedValue(undefined);
    vi.mocked(sendMessage).mockReset();
    vi.mocked(clipToLogseq).mockReset().mockResolvedValue({
      page: 'p',
      graph: 'g',
      templateId: 'clip',
      rootUuid: 'r',
      added: true,
    });
    vi.mocked(showClipErrorBadge).mockReset().mockResolvedValue(undefined);
    vi.mocked(clearClipErrorBadges).mockReset().mockResolvedValue(undefined);
    (fakeBrowser as any).contextMenus = { create, removeAll, onClicked };
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
      'clip-with-selection:default',
      'clip-with-selection:task',
      'clip-page',
      'clip-page:default',
      'clip-page:task',
      'clip-image',
      'clip-image:default',
      'clip-image:task',
      'open-highlights-sidebar',
    ]);
  });

  describe('rebuilding the menus', () => {
    const install = () =>
      fakeBrowser.runtime.onInstalled.trigger({
        reason: 'update',
        previousVersion: '99.0.0',
        temporary: false,
      } as any);
    const ids = () => create.mock.calls.map(([o]) => o.id);

    it('removes the old menus before it creates the new ones', async () => {
      background.main();
      await install();
      expect(removeAll).toHaveBeenCalledTimes(1);
      expect(removeAll.mock.invocationCallOrder[0]).toBeLessThan(
        create.mock.invocationCallOrder[0],
      );
    });

    it('creates the clip items as plain items with one template', async () => {
      await templates.setValue([
        { id: 'default', name: 'Clip', content: '{{content}}' },
      ]);
      // Task already added: no migration changes the templates.
      await storage.setItem('local:taskTemplateAdded', true);
      background.main();
      await install();
      expect(create.mock.calls.map(([o]) => o)).toEqual([
        {
          id: 'clip-with-selection',
          title: 'Clip "%s"',
          visible: true,
          contexts: ['selection'],
        },
        {
          id: 'clip-page',
          title: 'Clip page link',
          visible: true,
          contexts: ['page'],
        },
        {
          id: 'clip-image',
          title: 'Clip image',
          visible: true,
          contexts: ['image'],
        },
        {
          id: 'open-highlights-sidebar',
          title: 'Open sidebar',
          visible: true,
          contexts: ['page', 'selection'],
        },
      ]);
    });

    it('rebuilds when the browser starts', async () => {
      background.main();
      await fakeBrowser.runtime.onStartup.trigger();
      await vi.waitFor(() => expect(ids()).toContain('clip-page:task'));
      expect(removeAll).toHaveBeenCalledTimes(1);
    });

    it('rebuilds when the templates change', async () => {
      background.main();
      await templates.setValue([
        { id: 'a', name: 'A', content: '' },
        { id: 'b', name: '', content: '' },
        { id: 'c', name: 'C', content: '' },
      ]);
      await vi.waitFor(() => expect(ids()).toContain('clip-page:c'));
      const child = create.mock.calls
        .map(([o]) => o)
        .find((o) => o.id === 'clip-page:b');
      expect(child).toMatchObject({
        parentId: 'clip-page',
        title: 'Untitled',
        contexts: ['page'],
      });
    });

    it('never creates an existing menu id, however often onInstalled fires', async () => {
      const installed = (reason: string) =>
        fakeBrowser.runtime.onInstalled.trigger({
          reason,
          previousVersion: '99.0.0',
          temporary: false,
        } as any);

      // Install, then the service worker restarts and the browser updates
      // itself (Chrome, Edge, Brave: chrome_update; Firefox: browser_update).
      vi.spyOn(fakeBrowser.runtime, 'openOptionsPage').mockResolvedValue();
      background.main();
      await installed('install');
      // A new service worker registers its listeners afresh.
      fakeBrowser.runtime.onInstalled.removeAllListeners();
      fakeBrowser.runtime.onStartup.removeAllListeners();
      background.main();
      await fakeBrowser.runtime.onStartup.trigger();
      await installed('chrome_update');
      await installed('browser_update');
      await installed('update');
      await vi.waitFor(() => expect(removeAll.mock.calls.length).toBeGreaterThan(4));
      await new Promise((r) => setTimeout(r, 30));

      expect(duplicates).toEqual([]);
      expect(menuIds.has('clip-page:task')).toBe(true);
      expect(menuIds.has('open-highlights-sidebar')).toBe(true);
    });

    it('creates no duplicate items when the background starts again', async () => {
      background.main();
      await install();
      // The service worker restarts, then the browser restarts.
      background.main();
      await fakeBrowser.runtime.onStartup.trigger();
      await templates.setValue([
        { id: 'a', name: 'A', content: '' },
        { id: 'b', name: 'B', content: '' },
      ]);
      await install();
      await vi.waitFor(() => expect(removeAll.mock.calls.length).toBeGreaterThan(2));
      await new Promise((r) => setTimeout(r, 30));
      expect(duplicates).toEqual([]);
      expect([...menuIds].sort()).toEqual([
        'clip-image',
        'clip-image:a',
        'clip-image:b',
        'clip-page',
        'clip-page:a',
        'clip-page:b',
        'clip-with-selection',
        'clip-with-selection:a',
        'clip-with-selection:b',
        'open-highlights-sidebar',
      ]);
    });

    it('never runs two rebuilds at once', async () => {
      let open = 0;
      let overlapped = false;
      removeAll.mockImplementation(async () => {
        open++;
        overlapped ||= open > 1;
        await new Promise((r) => setTimeout(r, 5));
        open--;
      });
      background.main();
      await Promise.all([
        install(),
        fakeBrowser.runtime.onStartup.trigger(),
        templates.setValue([
          { id: 'a', name: 'A', content: '' },
          { id: 'b', name: 'B', content: '' },
        ]),
      ]);
      await vi.waitFor(() => expect(removeAll.mock.calls.length).toBeGreaterThan(2));
      await new Promise((r) => setTimeout(r, 30));
      expect(overlapped).toBe(false);
    });

    it('survives a failing rebuild and a failing item', async () => {
      const error = vi.spyOn(log, 'error').mockImplementation(() => {});
      const warn = vi.spyOn(log, 'warn').mockImplementation(() => {});
      removeAll.mockRejectedValueOnce(new Error('boom'));
      background.main();
      await install();
      expect(error).toHaveBeenCalledTimes(1);

      (fakeBrowser as any).runtime.lastError = { message: 'duplicate id' };
      create.mockImplementation((_, callback) => callback?.());
      await fakeBrowser.runtime.onStartup.trigger();
      await vi.waitFor(() => expect(warn).toHaveBeenCalled());
      delete (fakeBrowser as any).runtime.lastError;
    });

    describe('in the UI language', () => {
      afterEach(() => i18n.changeLanguage('en'));

      // The title an item was last created with.
      const titleOf = (id: string) =>
        create.mock.calls.map(([o]) => o).findLast((o) => o.id === id)?.title;

      it('rebuilds in the new language when the setting changes', async () => {
        background.main();
        await install();
        expect(titleOf('clip-page')).toBe('Clip page link');
        const templateTitle = titleOf('clip-page:task');

        await uiLanguageItem.setValue('zh-CN');
        await vi.waitFor(() => expect(titleOf('clip-page')).toBe('剪藏页面链接'));
        expect(titleOf('clip-with-selection')).toBe('剪藏“%s”');
        expect(titleOf('clip-image')).toBe('剪藏图片');
        expect(titleOf('open-highlights-sidebar')).toBe('打开侧边栏');
        // Template names are the user's: never translated.
        expect(titleOf('clip-page:task')).toBe(templateTitle);
      });

      it('leaves one set of menus, in the last language, after quick switches', async () => {
        removeAll.mockImplementation(async () => {
          await new Promise((r) => setTimeout(r, 5));
          menuIds.clear();
        });
        background.main();
        await install();
        await vi.waitFor(() => expect(menuIds.has('open-highlights-sidebar')).toBe(true));
        const ids = [...menuIds].sort();
        expect(ids).toContain('clip-page:task');

        await uiLanguageItem.setValue('zh-CN');
        await uiLanguageItem.setValue('zh-TW');
        await vi.waitFor(() =>
          expect(titleOf('open-highlights-sidebar')).toBe('開啟側邊欄'),
        );
        await new Promise((r) => setTimeout(r, 30));

        expect(duplicates).toEqual([]);
        expect([...menuIds].sort()).toEqual(ids);
        expect(titleOf('clip-with-selection')).toBe('剪存「%s」');
        expect(titleOf('clip-page')).toBe('剪存頁面連結');
      });

      it('does not rebuild when the language stays the same', async () => {
        background.main();
        await install();
        removeAll.mockClear();
        // Auto in an English browser: English, as before.
        await uiLanguageItem.setValue('en');
        await new Promise((r) => setTimeout(r, 30));
        expect(removeAll).not.toHaveBeenCalled();
      });
    });
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

  describe('choosing the template', () => {
    const tab = { id: 7, windowId: 3 };
    const click = (menuItemId: string, info: object = {}) => {
      background.main();
      onClicked.addListener.mock.calls[0][0]({ menuItemId, ...info }, tab);
    };

    it('clips with the template of a child item', () => {
      click('clip-page:task');
      expect(sendMessage).toHaveBeenLastCalledWith(
        'content:quickCapturePage',
        { templateId: 'task' },
        { tabId: 7 },
      );
      click('clip-with-selection:task');
      expect(sendMessage).toHaveBeenLastCalledWith(
        'content:quickCaptureWithSelection',
        { templateId: 'task' },
        { tabId: 7 },
      );
    });

    it('keeps a colon in the template id', () => {
      click('clip-page:a:b');
      expect(sendMessage).toHaveBeenLastCalledWith(
        'content:quickCapturePage',
        { templateId: 'a:b' },
        { tabId: 7 },
      );
    });

    it('clips with no template choice from a bare parent item', () => {
      click('clip-page');
      expect(sendMessage).toHaveBeenLastCalledWith(
        'content:quickCapturePage',
        undefined,
        { tabId: 7 },
      );
    });

    it('marks "Clip image" in a frame inside the page, so its tab is not asked for the image', () => {
      const srcUrl = 'https://frame.example/pic.png';
      click('clip-image', { srcUrl, frameId: 0 });
      expect(sendMessage).toHaveBeenLastCalledWith(
        'content:quickCaptureImage',
        { srcUrl },
        { tabId: 7 },
      );
      click('clip-image', { srcUrl });
      expect(sendMessage).toHaveBeenLastCalledWith(
        'content:quickCaptureImage',
        { srcUrl },
        { tabId: 7 },
      );
      click('clip-image:task', { srcUrl, frameId: 4 });
      expect(sendMessage).toHaveBeenLastCalledWith(
        'content:quickCaptureImage',
        { templateId: 'task', srcUrl, subframe: true },
        { tabId: 7 },
      );
    });

    it('clips an image of a frame from the background without asking its tab', async () => {
      vi.mocked(sendMessage).mockRejectedValue(new Error('no receiver'));
      const srcUrl = 'https://frame.example/pic.png';
      click('clip-image', { srcUrl, frameId: 4, pageUrl: 'https://e.com/' });
      await vi.waitFor(() => expect(clipToLogseq).toHaveBeenCalledTimes(1));
      expect(clipToLogseq).toHaveBeenLastCalledWith(
        expect.objectContaining({ data: `![](${srcUrl})` }),
        undefined,
      );

      vi.mocked(clipToLogseq).mockClear();
      click('clip-image', { srcUrl, frameId: 0, pageUrl: 'https://e.com/' });
      await vi.waitFor(() => expect(clipToLogseq).toHaveBeenCalledTimes(1));
      expect(clipToLogseq).toHaveBeenLastCalledWith(
        expect.objectContaining({ data: `![](${srcUrl})` }),
        7,
      );
    });

    it('ignores items that are not its own', () => {
      click('something-else');
      expect(sendMessage).not.toHaveBeenCalled();
      expect(sidePanelOpen).not.toHaveBeenCalled();
    });

    it('saves the page as a task from the clip-task command', () => {
      background.main();
      onCommand.addListener.mock.calls[0][0]('clip-task', tab);
      expect(sendMessage).toHaveBeenLastCalledWith(
        'content:quickCapture',
        { templateId: 'task' },
        { tabId: 7 },
      );
    });

    it('clips the selection with the template where the content script cannot run', async () => {
      vi.mocked(sendMessage).mockRejectedValue(new Error('no receiver'));
      click('clip-with-selection:task', {
        selectionText: 'a quote',
        pageUrl: 'https://example.com/a.pdf',
      });
      await vi.waitFor(() => expect(clipToLogseq).toHaveBeenCalledTimes(1));
      expect(clipToLogseq).toHaveBeenCalledWith(
        expect.objectContaining({ data: 'a quote', templateId: 'task' }),
        7,
      );
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
      // With the tab: the images of a clip are asked of it first.
      expect(clipToLogseq).toHaveBeenCalledWith(
        {
          url: 'https://example.com/paper.pdf',
          title: 'paper.pdf',
          data: 'a quote',
        },
        7,
      );
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
