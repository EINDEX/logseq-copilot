import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing';
import { sendMessage } from '@/types/messaging';
import log from '@/utils/logger';

vi.mock('@/types/messaging', () => ({
  onMessage: vi.fn(),
  sendMessage: vi.fn(),
}));

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

  describe('opening the highlights sidebar', () => {
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
});
