import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing';
import { hasNativeSidebar, openSidebar } from './sidebar';

describe('openSidebar', () => {
  const sidePanelOpen = vi.fn();
  const sidebarActionOpen = vi.fn();

  beforeEach(() => {
    fakeBrowser.reset();
    sidePanelOpen.mockReset().mockResolvedValue(undefined);
    sidebarActionOpen.mockReset().mockResolvedValue(undefined);
    // Neither API is in the fake browser.
    (fakeBrowser as any).sidePanel = { open: sidePanelOpen };
    (fakeBrowser as any).sidebarAction = { open: sidebarActionOpen };
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('in Chrome and Edge', () => {
    it('opens the side panel of the window, before anything is awaited', () => {
      // Not awaited: the browser only opens the panel while the click that
      // asked for it is still being handled.
      const opening = openSidebar(4);

      expect(sidePanelOpen).toHaveBeenCalledTimes(1);
      expect(sidePanelOpen).toHaveBeenCalledWith({ windowId: 4 });
      expect(sidebarActionOpen).not.toHaveBeenCalled();
      return opening;
    });

    it('rejects when the browser does not open it', async () => {
      const refusal = new Error('no user gesture');
      sidePanelOpen.mockRejectedValue(refusal);

      await expect(openSidebar(4)).rejects.toBe(refusal);
    });

    it('rejects without a window', async () => {
      await expect(openSidebar(undefined)).rejects.toThrow();
      expect(sidePanelOpen).not.toHaveBeenCalled();
    });
  });

  describe('in Firefox', () => {
    beforeEach(() => {
      vi.stubEnv('FIREFOX', 'true');
    });

    it('opens the sidebar, before anything is awaited', () => {
      const opening = openSidebar(4);

      expect(sidebarActionOpen).toHaveBeenCalledTimes(1);
      // It has no window argument: the window of the user action is used.
      expect(sidebarActionOpen).toHaveBeenCalledWith();
      expect(sidePanelOpen).not.toHaveBeenCalled();
      return opening;
    });

    it('rejects when the browser does not open it', async () => {
      const refusal = new Error('no user gesture');
      sidebarActionOpen.mockRejectedValue(refusal);

      await expect(openSidebar(4)).rejects.toBe(refusal);
    });
  });

  describe('without a sidebar of the browser (Safari, Firefox for Android)', () => {
    const isOpen = async () =>
      (await fakeBrowser.storage.local.get('inPageSidebarOpen'))
        .inPageSidebarOpen;

    beforeEach(() => {
      delete (fakeBrowser as any).sidePanel;
      delete (fakeBrowser as any).sidebarAction;
    });

    it('opens the sidebar drawn on the page, in the Chrome build', async () => {
      expect(hasNativeSidebar()).toBe(false);

      await openSidebar(4);

      expect(await isOpen()).toBe(true);
    });

    it('opens the sidebar drawn on the page, in the Firefox build', async () => {
      vi.stubEnv('FIREFOX', 'true');
      // The other browser's API does not count.
      (fakeBrowser as any).sidePanel = { open: sidePanelOpen };
      expect(hasNativeSidebar()).toBe(false);

      await openSidebar(4);

      expect(await isOpen()).toBe(true);
      expect(sidePanelOpen).not.toHaveBeenCalled();
    });

    it('needs no window', async () => {
      await openSidebar(undefined);

      expect(await isOpen()).toBe(true);
    });
  });

  it('leaves the sidebar drawn on the page closed where the browser has its own', async () => {
    expect(hasNativeSidebar()).toBe(true);

    await openSidebar(4);

    expect(
      (await fakeBrowser.storage.local.get('inPageSidebarOpen'))
        .inPageSidebarOpen,
    ).toBeUndefined();
  });
});
