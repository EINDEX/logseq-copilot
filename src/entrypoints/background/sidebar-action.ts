import { browser } from 'wxt/browser';
import log from '@/utils/logger';
import {
  hasNativeSidebar,
  openInPageSidebar,
  openNativeSidebar,
  toggleInPageSidebar,
  toggleNativeSidebar,
  usesInPageSidebar,
} from '@/utils/sidebar';
import {
  arcDetectedItem,
  inPageSidebarItem,
  inPageSidebarOpenItem,
} from '@/utils/storage';

type Tab = Browser.tabs.Tab | undefined;

export interface SidebarAction {
  /** The context menu item and the command: open the sidebar. */
  open(tab: Tab): void;
  /** The toolbar button: open the sidebar, or close it. */
  toggle(tab: Tab): void;
}

/**
 * Where the sidebar opens: the browser's own (side panel, Firefox sidebar) or
 * the one drawn on pages (src/utils/sidebar.ts, usesInPageSidebar).
 *
 * The browser's own opens only for a user action, and only if nothing is
 * awaited before. So the background keeps the answer in memory, and follows
 * the settings. Until it has read them (an event woke it up), it opens the
 * browser's own first, then the one on pages if that is the one in use: the
 * browser's own is shown nowhere then (Arc).
 *
 * Chrome opens the side panel for the toolbar button by itself
 * (openPanelOnActionClick), without a click event. It is turned off while
 * the sidebar on pages is in use.
 */
export function startSidebarAction(): SidebarAction {
  const native = hasNativeSidebar();
  let inPage: boolean | undefined = native ? undefined : true;

  const setPanelBehavior = (openPanelOnActionClick: boolean) => {
    // Chrome and Edge only.
    if (typeof browser.sidePanel?.setPanelBehavior !== 'function') return;
    browser.sidePanel
      .setPanelBehavior({ openPanelOnActionClick })
      .catch((err) => log.error('Failed to set the side panel behavior:', err));
  };

  const follow = (closeInPage: boolean) =>
    usesInPageSidebar()
      .then(async (value) => {
        inPage = value;
        setPanelBehavior(!value);
        // Switched to the browser's own: the one on pages goes away.
        if (!value && closeInPage) await inPageSidebarOpenItem.setValue(false);
      })
      .catch((err) => log.error('Failed to read the sidebar settings:', err));

  if (native) {
    void follow(false);
    inPageSidebarItem.watch(() => void follow(true));
    arcDetectedItem.watch(() => void follow(true));
  }

  const logFailure = (err: unknown) =>
    log.error('Failed to open the sidebar:', err);

  // Nothing awaited before the browser's own is asked to open.
  const run = (
    tab: Tab,
    openNative: (windowId: number | undefined) => Promise<void>,
    openOnPages: () => Promise<void>,
  ) => {
    if (inPage === true) {
      openOnPages().catch(logFailure);
      return;
    }
    if (tab?.windowId === undefined) {
      log.warn('[background] No tab to open the sidebar for');
      return;
    }
    openNative(tab?.windowId).catch(logFailure);
    if (inPage === undefined) {
      usesInPageSidebar()
        .then((value) => (value ? openOnPages() : undefined))
        .catch(logFailure);
    }
  };

  return {
    open: (tab) => run(tab, openNativeSidebar, openInPageSidebar),
    toggle: (tab) => run(tab, toggleNativeSidebar, toggleInPageSidebar),
  };
}
