/**
 * The toolbar button, the context menu item and the command open the sidebar
 * the settings choose: the browser's own, or the one drawn on pages. The
 * browser's own needs the user action alive, so it is asked for before
 * anything is awaited.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing';
import log from '@/utils/logger';
import { startSidebarAction } from './sidebar-action';

const tab = { id: 7, windowId: 3 } as Browser.tabs.Tab;

const sidePanelOpen = vi.fn();
const setPanelBehavior = vi.fn();
const sidebarActionOpen = vi.fn();
const sidebarActionToggle = vi.fn();

const isOpen = async () =>
  (await fakeBrowser.storage.local.get('inPageSidebarOpen')).inPageSidebarOpen;
/** Let the background read the settings. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  fakeBrowser.reset();
  // Neither API is in the fake browser; each case adds its own.
  delete (fakeBrowser as any).sidePanel;
  delete (fakeBrowser as any).sidebarAction;
  sidePanelOpen.mockReset().mockResolvedValue(undefined);
  setPanelBehavior.mockReset().mockResolvedValue(undefined);
  sidebarActionOpen.mockReset().mockResolvedValue(undefined);
  sidebarActionToggle.mockReset().mockResolvedValue(undefined);
  vi.spyOn(log, 'error').mockImplementation(() => {});
  vi.spyOn(log, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('in Chrome and Edge', () => {
  beforeEach(() => {
    (fakeBrowser as any).sidePanel = { open: sidePanelOpen, setPanelBehavior };
  });

  it('lets the browser open the side panel for the toolbar button', async () => {
    startSidebarAction();
    await settle();

    expect(setPanelBehavior).toHaveBeenLastCalledWith({
      openPanelOnActionClick: true,
    });
  });

  it('opens the side panel of the window right away when the click reaches it', async () => {
    const sidebar = startSidebarAction();
    await settle();

    sidebar.toggle(tab);

    expect(sidePanelOpen).toHaveBeenCalledWith({ windowId: 3 });
    await settle();
    expect(await isOpen()).toBeUndefined();
  });

  it('opens the side panel right away before it has read the settings', async () => {
    const sidebar = startSidebarAction();

    // No await since start: an event woke the background up.
    sidebar.open(tab);

    expect(sidePanelOpen).toHaveBeenCalledWith({ windowId: 3 });
    await settle();
    expect(await isOpen()).toBeUndefined();
  });

  it('warns without a window', async () => {
    const sidebar = startSidebarAction();
    await settle();

    sidebar.open(undefined);

    expect(log.warn).toHaveBeenCalledTimes(1);
    expect(sidePanelOpen).not.toHaveBeenCalled();
  });

  describe('with the sidebar on pages (Arc, or the user)', () => {
    it.each([
      ['Arc', { arcDetected: true }],
      ['the user', { inPageSidebar: true }],
    ])('takes the toolbar button from the browser: %s', async (_, stored) => {
      await fakeBrowser.storage.local.set(stored);

      startSidebarAction();
      await settle();

      expect(setPanelBehavior).toHaveBeenLastCalledWith({
        openPanelOnActionClick: false,
      });
    });

    it('toggles the sidebar on pages from the toolbar button', async () => {
      await fakeBrowser.storage.local.set({ arcDetected: true });
      const sidebar = startSidebarAction();
      await settle();

      sidebar.toggle(tab);
      await vi.waitFor(async () => expect(await isOpen()).toBe(true));
      sidebar.toggle(tab);
      await vi.waitFor(async () => expect(await isOpen()).toBe(false));

      expect(sidePanelOpen).not.toHaveBeenCalled();
    });

    it('opens it from the menu item and the command', async () => {
      await fakeBrowser.storage.local.set({ inPageSidebar: true });
      const sidebar = startSidebarAction();
      await settle();

      sidebar.open(tab);
      await vi.waitFor(async () => expect(await isOpen()).toBe(true));
      // Open stays open.
      sidebar.open(tab);
      await settle();
      expect(await isOpen()).toBe(true);
      expect(sidePanelOpen).not.toHaveBeenCalled();
    });

    it('opens it after the side panel, before it has read the settings', async () => {
      await fakeBrowser.storage.local.set({ arcDetected: true });
      const sidebar = startSidebarAction();

      sidebar.toggle(tab);

      expect(sidePanelOpen).toHaveBeenCalledWith({ windowId: 3 });
      await vi.waitFor(async () => expect(await isOpen()).toBe(true));
    });
  });

  describe('when the settings change', () => {
    it('follows Arc once a page has seen it', async () => {
      startSidebarAction();
      await settle();
      setPanelBehavior.mockClear();

      await fakeBrowser.storage.local.set({ arcDetected: true });

      await vi.waitFor(() =>
        expect(setPanelBehavior).toHaveBeenLastCalledWith({
          openPanelOnActionClick: false,
        }),
      );
    });

    it('follows the user, and closes the sidebar on pages when the side panel takes over', async () => {
      await fakeBrowser.storage.local.set({ arcDetected: true });
      const sidebar = startSidebarAction();
      await settle();
      sidebar.toggle(tab);
      await vi.waitFor(async () => expect(await isOpen()).toBe(true));

      await fakeBrowser.storage.local.set({ inPageSidebar: false });

      await vi.waitFor(() =>
        expect(setPanelBehavior).toHaveBeenLastCalledWith({
          openPanelOnActionClick: true,
        }),
      );
      await vi.waitFor(async () => expect(await isOpen()).toBe(false));

      // And the toolbar button opens the side panel again.
      sidebar.toggle(tab);
      expect(sidePanelOpen).toHaveBeenCalledWith({ windowId: 3 });
    });
  });
});

describe('in Firefox', () => {
  beforeEach(() => {
    vi.stubEnv('FIREFOX', 'true');
    (fakeBrowser as any).sidebarAction = {
      open: sidebarActionOpen,
      toggle: sidebarActionToggle,
    };
  });

  it('toggles the sidebar in the click handler itself, also before it has read the settings', async () => {
    const sidebar = startSidebarAction();

    // Firefox only takes it in the handler of the user action: no await
    // before it.
    sidebar.toggle(tab);
    expect(sidebarActionToggle).toHaveBeenCalledTimes(1);

    await settle();
    sidebar.toggle(tab);
    expect(sidebarActionToggle).toHaveBeenCalledTimes(2);
    expect(sidebarActionOpen).not.toHaveBeenCalled();
    expect(await isOpen()).toBeUndefined();
  });

  it('opens the sidebar from the menu item and the command, right away', () => {
    const sidebar = startSidebarAction();

    sidebar.open(tab);

    expect(sidebarActionOpen).toHaveBeenCalledTimes(1);
    expect(sidebarActionToggle).not.toHaveBeenCalled();
  });

  it('has no side panel behavior to set', async () => {
    startSidebarAction();
    await settle();

    expect(setPanelBehavior).not.toHaveBeenCalled();
  });

  it('toggles the sidebar on pages when the user chose it', async () => {
    await fakeBrowser.storage.local.set({ inPageSidebar: true });
    const sidebar = startSidebarAction();
    await settle();

    sidebar.toggle(tab);

    await vi.waitFor(async () => expect(await isOpen()).toBe(true));
    expect(sidebarActionToggle).not.toHaveBeenCalled();
  });
});

describe('without a sidebar of the browser (Safari, Orion, Firefox for Android)', () => {
  it('toggles the sidebar on pages from the toolbar button, right away', async () => {
    const sidebar = startSidebarAction();

    sidebar.toggle(tab);
    await vi.waitFor(async () => expect(await isOpen()).toBe(true));
    sidebar.toggle(tab);
    await vi.waitFor(async () => expect(await isOpen()).toBe(false));
  });

  it('opens it without a tab (Safari passes none to commands)', async () => {
    const sidebar = startSidebarAction();

    sidebar.open(undefined);

    await vi.waitFor(async () => expect(await isOpen()).toBe(true));
    expect(log.warn).not.toHaveBeenCalled();
  });

  it('ignores the setting', async () => {
    await fakeBrowser.storage.local.set({ inPageSidebar: false });
    const sidebar = startSidebarAction();

    sidebar.open(tab);

    await vi.waitFor(async () => expect(await isOpen()).toBe(true));
  });

  it('in the Firefox build too', async () => {
    vi.stubEnv('FIREFOX', 'true');
    // The other browser's API does not count.
    (fakeBrowser as any).sidePanel = { open: sidePanelOpen, setPanelBehavior };
    const sidebar = startSidebarAction();

    sidebar.toggle(tab);

    await vi.waitFor(async () => expect(await isOpen()).toBe(true));
    expect(sidePanelOpen).not.toHaveBeenCalled();
  });
});
