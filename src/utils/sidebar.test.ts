import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing';
import { openSidebar } from './sidebar';

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
});
