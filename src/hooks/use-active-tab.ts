import { useEffect, useState } from 'react';
import { browser } from 'wxt/browser';
import log from '@/utils/logger';

export interface ActiveTab {
  id: number;
  title: string;
  /**
   * The URL of the page, or null if the page cannot have highlights: only web
   * pages (http and https) run the content script. A restricted page, or one
   * the extension has no host permission for, has no url at all.
   */
  url: string | null;
}

interface ActiveTabState {
  tab: ActiveTab | null;
  /** True until the active tab has been read for the first time. */
  loading: boolean;
}

const toActiveTab = (tab: Browser.tabs.Tab | undefined): ActiveTab | null => {
  if (tab?.id === undefined) return null;
  return {
    id: tab.id,
    title: tab.title ?? '',
    url: tab.url && /^https?:\/\//i.test(tab.url) ? tab.url : null,
  };
};

const isSameTab = (a: ActiveTab | null, b: ActiveTab | null) =>
  a === b ||
  (!!a && !!b && a.id === b.id && a.title === b.title && a.url === b.url);

/**
 * Follows the active tab of the window this page is in (the browser sidebar):
 * tab switches, navigations and title changes.
 *
 * Everything is read from the browser when the page mounts, and nothing is
 * kept elsewhere: Edge reloads the side panel on every tab switch.
 */
export function useActiveTab(): ActiveTabState {
  const [state, setState] = useState<ActiveTabState>({
    tab: null,
    loading: true,
  });

  useEffect(() => {
    let disposed = false;
    let removeListeners = () => {};
    // Reads finish in any order; only the latest may show its result.
    let latestRead = 0;

    const show = (tab: Browser.tabs.Tab | undefined) => {
      const next = toActiveTab(tab);
      setState((prev) =>
        !prev.loading && isSameTab(prev.tab, next)
          ? prev
          : { tab: next, loading: false },
      );
    };

    const read = (reading: Promise<Browser.tabs.Tab | undefined>) => {
      const thisRead = ++latestRead;
      reading.then(
        (tab) => {
          if (!disposed && thisRead === latestRead) show(tab);
        },
        (error) => {
          // Mostly a tab that was closed again before it could be read.
          log.warn('[useActiveTab] Failed to read the active tab:', error);
          if (!disposed && thisRead === latestRead) {
            setState((prev) =>
              prev.loading ? { tab: null, loading: false } : prev,
            );
          }
        },
      );
    };

    const start = async () => {
      const current = await browser.windows.getCurrent();
      if (disposed) return;

      const windowId = current?.id;
      if (windowId === undefined) {
        log.warn('[useActiveTab] This page is not in a window');
        setState({ tab: null, loading: false });
        return;
      }

      const onActivated = (info: Browser.tabs.TabActiveInfo) => {
        if (info.windowId !== windowId) return;
        // The event has no url or title.
        read(browser.tabs.get(info.tabId));
      };
      const onUpdated = (
        _tabId: number,
        changeInfo: Browser.tabs.TabChangeInfo,
        tab: Browser.tabs.Tab,
      ) => {
        if (tab.windowId !== windowId || !tab.active) return;
        if (
          changeInfo.url === undefined &&
          changeInfo.title === undefined &&
          changeInfo.status !== 'complete'
        ) {
          return;
        }
        // This is newer than any read still under way.
        latestRead++;
        show(tab);
      };

      browser.tabs.onActivated.addListener(onActivated);
      browser.tabs.onUpdated.addListener(onUpdated);
      removeListeners = () => {
        browser.tabs.onActivated.removeListener(onActivated);
        browser.tabs.onUpdated.removeListener(onUpdated);
      };

      // Listening comes first, so a change while this reads is not missed.
      read(browser.tabs.query({ active: true, windowId }).then(([tab]) => tab));
    };

    start().catch((error) => {
      log.error('[useActiveTab] Failed to start:', error);
      if (!disposed) setState({ tab: null, loading: false });
    });

    return () => {
      disposed = true;
      removeListeners();
    };
  }, []);

  return state;
}
