import { browser } from 'wxt/browser';
import log from '@/utils/logger';
import { sendMessage } from '@/types/messaging';
import { clearSidebarHint, showSidebarHint } from './clip-error-badge';
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

const CANNOT_OPEN_SIDEBAR = "Logseq Copilot can't open on this page";
const PING_TIMEOUT_MS = 1500;

/**
 * Whether the sidebar on pages can show on the tab: its content script runs
 * there. Web pages only (a cheap check first), then the content script
 * itself answers. A tab we know nothing about is let through.
 */
async function canShowInPage(tab: Tab): Promise<boolean> {
  if (tab?.id === undefined) return true;
  if (tab.url && !/^https?:/i.test(tab.url)) return false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      sendMessage('content:ping', undefined, { tabId: tab.id }),
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('ping timed out')),
          PING_TIMEOUT_MS,
        );
      }),
    ]);
    return true;
  } catch (err) {
    log.debug('[background] Content script unreachable', err);
    return false;
  } finally {
    clearTimeout(timer);
  }
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
    // The sidebar on pages is one stored state for every tab. On a tab it
    // cannot show on, flipping it would only change the other tabs: hint on
    // this tab instead. Only here, never before the browser's own opens.
    const openOnPagesOf = async () => {
      if (!(await canShowInPage(tab))) {
        await showSidebarHint(tab?.id, CANNOT_OPEN_SIDEBAR);
        return;
      }
      if (tab?.id !== undefined) await clearSidebarHint(tab.id);
      await openOnPages();
    };
    if (inPage === true) {
      openOnPagesOf().catch(logFailure);
      return;
    }
    if (tab?.windowId === undefined) {
      log.warn('[background] No tab to open the sidebar for');
      return;
    }
    openNative(tab?.windowId).catch(logFailure);
    if (inPage === undefined) {
      usesInPageSidebar()
        .then((value) => (value ? openOnPagesOf() : undefined))
        .catch(logFailure);
    }
  };

  return {
    open: (tab) => run(tab, openNativeSidebar, openInPageSidebar),
    toggle: (tab) => run(tab, toggleNativeSidebar, toggleInPageSidebar),
  };
}
