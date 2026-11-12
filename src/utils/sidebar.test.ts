import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing';
import {
  hasNativeSidebar,
  openInPageSidebar,
  openNativeSidebar,
  resolveInPageSidebar,
  toggleInPageSidebar,
  toggleNativeSidebar,
  usesInPageSidebar,
} from './sidebar';

const sidePanelOpen = vi.fn();
const sidebarActionOpen = vi.fn();
const sidebarActionToggle = vi.fn();

beforeEach(() => {
  fakeBrowser.reset();
  sidePanelOpen.mockReset().mockResolvedValue(undefined);
  sidebarActionOpen.mockReset().mockResolvedValue(undefined);
  sidebarActionToggle.mockReset().mockResolvedValue(undefined);
  // Neither API is in the fake browser.
  (fakeBrowser as any).sidePanel = { open: sidePanelOpen };
  (fakeBrowser as any).sidebarAction = {
    open: sidebarActionOpen,
    toggle: sidebarActionToggle,
  };
});

afterEach(() => {
  vi.unstubAllEnvs();
});

const isOpen = async () =>
  (await fakeBrowser.storage.local.get('inPageSidebarOpen')).inPageSidebarOpen;

describe('resolveInPageSidebar', () => {
  it.each([
    // nativeSidebar, setting, arcDetected, in-page
    [false, null, false, true],
    [false, false, false, true],
    [false, false, true, true],
    [true, null, false, false],
    [true, null, true, true],
    [true, true, false, true],
    [true, false, true, false],
    [true, true, true, true],
  ])(
    'native sidebar %s, setting %s, Arc %s: in-page %s',
    (nativeSidebar, setting, arcDetected, expected) => {
      expect(
        resolveInPageSidebar({ nativeSidebar, setting, arcDetected }),
      ).toBe(expected);
    },
  );
});

describe('usesInPageSidebar', () => {
  it('uses the browser sidebar by default', async () => {
    expect(await usesInPageSidebar()).toBe(false);
  });

  it('uses the sidebar on pages in Arc, until the user picks', async () => {
    await fakeBrowser.storage.local.set({ arcDetected: true });
    expect(await usesInPageSidebar()).toBe(true);

    await fakeBrowser.storage.local.set({ inPageSidebar: false });
    expect(await usesInPageSidebar()).toBe(false);
  });

  it('follows the user', async () => {
    await fakeBrowser.storage.local.set({ inPageSidebar: true });
    expect(await usesInPageSidebar()).toBe(true);
  });

  it('always uses the sidebar on pages without a browser sidebar', async () => {
    delete (fakeBrowser as any).sidePanel;
    await fakeBrowser.storage.local.set({ inPageSidebar: false });
    expect(await usesInPageSidebar()).toBe(true);
  });
});

describe('openNativeSidebar', () => {
  describe('in Chrome and Edge', () => {
    it('opens the side panel of the window, before anything is awaited', () => {
      // Not awaited: the browser only opens the panel while the click that
      // asked for it is still being handled.
      const opening = openNativeSidebar(4);

      expect(sidePanelOpen).toHaveBeenCalledTimes(1);
      expect(sidePanelOpen).toHaveBeenCalledWith({ windowId: 4 });
      expect(sidebarActionOpen).not.toHaveBeenCalled();
      return opening;
    });

    it('rejects when the browser does not open it', async () => {
      const refusal = new Error('no user gesture');
      sidePanelOpen.mockRejectedValue(refusal);

      await expect(openNativeSidebar(4)).rejects.toBe(refusal);
    });

    it('rejects without a window', async () => {
      await expect(openNativeSidebar(undefined)).rejects.toThrow();
      expect(sidePanelOpen).not.toHaveBeenCalled();
    });

    it('opens it for the toolbar button too: Chrome cannot close it', () => {
      const opening = toggleNativeSidebar(4);

      expect(sidePanelOpen).toHaveBeenCalledWith({ windowId: 4 });
      return opening;
    });
  });

  describe('in Firefox', () => {
    beforeEach(() => {
      vi.stubEnv('FIREFOX', 'true');
    });

    it('opens the sidebar, before anything is awaited', () => {
      const opening = openNativeSidebar(4);

      expect(sidebarActionOpen).toHaveBeenCalledTimes(1);
      // It has no window argument: the window of the user action is used.
      expect(sidebarActionOpen).toHaveBeenCalledWith();
      expect(sidePanelOpen).not.toHaveBeenCalled();
      return opening;
    });

    it('rejects when the browser does not open it', async () => {
      const refusal = new Error('no user gesture');
      sidebarActionOpen.mockRejectedValue(refusal);

      await expect(openNativeSidebar(4)).rejects.toBe(refusal);
    });

    it('toggles the sidebar for the toolbar button, before anything is awaited', () => {
      const toggling = toggleNativeSidebar(4);

      expect(sidebarActionToggle).toHaveBeenCalledTimes(1);
      expect(sidebarActionToggle).toHaveBeenCalledWith();
      expect(sidebarActionOpen).not.toHaveBeenCalled();
      return toggling;
    });
  });
});

describe('the sidebar drawn on pages', () => {
  it('opens in every tab', async () => {
    await openInPageSidebar();

    expect(await isOpen()).toBe(true);
  });

  it('toggles', async () => {
    await toggleInPageSidebar();
    expect(await isOpen()).toBe(true);

    await toggleInPageSidebar();
    expect(await isOpen()).toBe(false);
  });
});

describe('hasNativeSidebar', () => {
  it('is the side panel in the Chrome build', () => {
    expect(hasNativeSidebar()).toBe(true);
    delete (fakeBrowser as any).sidePanel;
    expect(hasNativeSidebar()).toBe(false);
  });

  it('is the sidebar in the Firefox build, not the side panel', () => {
    vi.stubEnv('FIREFOX', 'true');
    expect(hasNativeSidebar()).toBe(true);
    delete (fakeBrowser as any).sidebarAction;
    expect(hasNativeSidebar()).toBe(false);
  });
});
