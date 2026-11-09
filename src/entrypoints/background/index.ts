import { debounce } from '@/utils';
import {
  changeOptionsHostToHostNameAndPort,
  migrateGithubRecallRuleToRepoScope,
  migrateLegacyClipSettingsToTemplates,
  migrateRecallRuleDefaultsToEnglish,
} from './upgrade';
import { getLogseqService } from './logseq/tool';
import { SearchEngineConfigMigration } from '@/utils/migration';
import { inPageSidebarOpenItem } from '@/utils/storage';
import { onMessage, sendMessage } from '@/types/messaging';
import { RecallRuleProcessor } from '@/utils/recall-rule-processor';
import { hasNativeSidebar, openSidebar } from '@/utils/sidebar';
import type { RecallResult } from '@/types/recall';
import log from '@/utils/logger';
import {
  recallRequestKey,
  recentRequests,
} from './logseq/recall/recent-requests';
import { backgroundClipFallback, clipToLogseq, type ClipSource } from './clip';
import {
  clearClipErrorBadges,
  hasClipErrorBadge,
  showClipErrorBadge,
} from './clip-error-badge';
import { clipErrorMessage } from '@/utils/clip-feedback';
import { isLogseqUrl } from '@/utils/logseq-url';

const CANNOT_CLIP_PAGE = 'Cannot clip this page: extensions cannot run on it.';

// Long enough to cover a result page that reloads itself (Bing: ~1.5 s).
const RECALL_SHARE_MS = 5_000;

export default defineBackground({
  // Set manifest options
  // persistent: undefined | true | false,
  // type: undefined | 'module',

  // // Set include/exclude if the background should be removed from some builds
  // include: undefined | string[],
  // exclude: undefined | string[],

  main() {
    // Executed when background is loaded, CANNOT BE ASYNC

    // Register message handlers using @webext-core/messaging
    onMessage('logseq:search', async ({ data }) => {
      const logseqService = await getLogseqService();
      const searchRes = await logseqService.search(data);
      log.debug('search result', searchRes);
      return searchRes;
    });

    // Result pages that load twice in a row (Bing) ask the same recall twice.
    const sharedRecall = recentRequests<RecallResult>(RECALL_SHARE_MS);
    // The answer depends on the recall rules, the Logseq connection and other
    // settings. Any storage change may alter it, so share nothing older.
    browser.storage.onChanged.addListener(() => sharedRecall.clear());
    onMessage('logseq:recall', ({ data }) =>
      sharedRecall(recallRequestKey(data.query, data.url), async () => {
        const logseqService = await getLogseqService();
        const recallProcessor = RecallRuleProcessor.getInstance();
        const searchContext = await recallProcessor.processSearchContext(
          data.url,
        );
        return await logseqService.recall(
          data.query,
          recallProcessor.recallOptions(searchContext),
        );
      }),
    );

    onMessage('logseq:urlSearch', async ({ data }) => {
      const logseqService = await getLogseqService();

      // Apply recall rules processing
      const recallProcessor = RecallRuleProcessor.getInstance();
      const searchContext = await recallProcessor.processSearchContext(
        data.url,
      );

      // Use processed URL for search
      const searchRes = await logseqService.urlSearch(
        searchContext.processedUrl,
        { scopeDepth: searchContext.scopeDepth },
      );

      // Filter results based on recall rules
      if (searchRes.response?.blocks) {
        searchRes.response.blocks = recallProcessor.filterResults(
          searchRes.response.blocks,
          searchContext,
        );
      }
      return searchRes;
    });

    onMessage('app:openOptions', async () => {
      browser.runtime.openOptionsPage();
    });

    // A failed clip rejects with a readable message (LogseqError), which the
    // sender (content script, popup) shows.
    // The content script sends this from the page it clips, so clip its tab:
    // the active tab of the current window can be another page, or the popup
    // window, once focus has moved.
    onMessage('logseq:clipWithSelection', async ({ data, sender }) => {
      await quickCapture(data, sender.tab);
    });

    onMessage('logseq:clipPage', async () => {
      await quickCapture('');
    });

    onMessage('app:openPage', async ({ data }) => {
      await openPage(data.url);
    });

    // A link to Logseq in a content script UI (the recall card, ...). Opened
    // by the page, the browser asks whether that site may open Logseq, once
    // per site; opened here, it asks once for the extension. Only in the tab
    // the content script runs in, and only logseq: URLs: this must not become
    // a way to send a tab to any address.
    onMessage('logseq:openLink', async ({ data, sender }) => {
      const tabId = sender.tab?.id;
      if (tabId === undefined || tabId < 0) {
        log.warn('[background] logseq:openLink without a sender tab, ignored');
        return;
      }
      if (!isLogseqUrl(data?.url)) throw new Error('Not a logseq: link.');
      await browser.tabs.update(tabId, { url: data.url });
    });

    onMessage('logseq:changeBlockMarker', async ({ data }) => {
      // The sender (content script or popup) updates its UI from this return
      // value, so report the service's real outcome.
      const logseqService = await getLogseqService();
      return await logseqService.changeBlockMarker(data.uuid, data.marker);
    });

    const getCurrentTab = async () => {
      const tab = await browser.tabs.query({
        active: true,
        currentWindow: true,
      });
      return tab[0];
    };

    const openPage = async (url: string) => {
      log.debug(url);
      const tab = await getCurrentTab();
      if (!tab) {
        browser.tabs.create({ url: url });
        return;
      }
      const activeTab = tab;
      if (activeTab.url !== url)
        await browser.tabs.update(activeTab.id!, { url: url });
    };

    // Without the sender's tab (an extension page sent the message), clip the
    // active tab of the current window.
    const quickCapture = async (
      data: string,
      senderTab?: { id?: number; url?: string; title?: string },
    ) => {
      const tab = senderTab ?? (await getCurrentTab());
      if (!tab) throw new Error('No tab to clip.');
      await clip({ url: tab.url, title: tab.title, data }, tab.id);
    };

    const clip = async (source: ClipSource, tabId: number | undefined) => {
      await clipToLogseq(source);
      await clearClipErrorBadges();
      if (tabId !== undefined) debounceBadgeSearch(source.url, tabId);
    };

    browser.tabs.onActivated.addListener((activeInfo) => {
      const promise = new Promise(async () => {
        const tab = await browser.tabs.get(activeInfo.tabId);
        await debounceBadgeSearch(tab.url, activeInfo.tabId);
      });
      promise.catch((err) => log.error(err));
    });

    browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      if (tab.active && changeInfo.status === 'complete') {
        const promise = new Promise(async () => {
          await debounceBadgeSearch(tab.url, tabId);
        });
        promise.catch((err) => log.error(err));
      }
    });

    const badgeSearch = async (url: string | undefined, tabId: number) => {
      if (!url) return;

      // Apply recall rules processing
      const recallProcessor = RecallRuleProcessor.getInstance();
      const searchContext = await recallProcessor.processSearchContext(url);

      // The badge counts notes about this page only, not its parent paths.
      const logseqService = await getLogseqService();
      const searchRes = await logseqService.urlSearch(
        searchContext.processedUrl,
      );

      // Count the results left after the recall rules filter
      let count: number = searchRes.count || 0;
      if (searchRes.response?.blocks) {
        count = recallProcessor.filterResults(
          searchRes.response.blocks,
          searchContext,
        ).length;
      }
      const resultCount = count ? count.toString() : '';
      await setExtensionBadge(resultCount, tabId);
    };

    const debounceBadgeSearch = debounce(badgeSearch, 1000);

    // Menus persist across service worker restarts, so create them only on
    // install/update. Creating at every startup fails with "duplicate id"
    // (reported via runtime.lastError, which try/catch cannot catch).
    const createContextMenus = () => {
      browser.contextMenus.create({
        id: 'clip-with-selection',
        title: 'Clip "%s"',
        visible: true,
        contexts: ['selection'],
      });
      browser.contextMenus.create({
        id: 'clip-page',
        title: 'Clip page link',
        visible: true,
        contexts: ['page'],
      });
      browser.contextMenus.create({
        id: 'open-highlights-sidebar',
        title: 'Open highlights sidebar',
        visible: true,
        contexts: ['page', 'selection'],
      });
    };

    // Call it first in the handler of a menu item or command: the browser opens
    // the sidebar only while the user action is still alive, so nothing may be
    // awaited before it. The sidebar drawn on the page needs no window.
    const openSidebarForTab = (tab: Browser.tabs.Tab | undefined) => {
      if (tab?.windowId === undefined && hasNativeSidebar()) {
        log.warn('[background] No tab to open the highlights sidebar for');
        return;
      }
      openSidebar(tab?.windowId).catch((err) =>
        log.error('Failed to open the highlights sidebar:', err),
      );
    };

    // Clip commands (shortcut, context menu) go to the content script: it
    // clips the selection as Markdown, highlights it, and shows a failure in
    // the page. Where it cannot run (the browser's PDF viewer, ...), the
    // background clips the plain selected text a menu click reports, and
    // reports a failure on the toolbar button.
    const relayClipCommand = async (
      send: (tabId: number) => Promise<void>,
      tab: Browser.tabs.Tab | undefined,
      info: { selectionText?: string; pageUrl?: string } = {},
    ) => {
      if (tab?.id !== undefined) {
        try {
          await send(tab.id);
          return;
        } catch (err) {
          log.debug('[background] Content script unreachable', err);
        }
      }
      try {
        const fallback = backgroundClipFallback(info, tab);
        if (!fallback) throw new Error(CANNOT_CLIP_PAGE);
        await clip(fallback, tab?.id);
      } catch (err) {
        await showClipErrorBadge(tab?.id, clipErrorMessage(err));
      }
    };

    browser.contextMenus.onClicked.addListener((info, tab) => {
      if (info.menuItemId === 'open-highlights-sidebar') {
        openSidebarForTab(tab);
      } else if (info.menuItemId === 'clip-with-selection') {
        void relayClipCommand(
          (tabId) =>
            sendMessage('content:quickCaptureWithSelection', undefined, { tabId }),
          tab,
          info,
        );
      } else if (info.menuItemId === 'clip-page') {
        void relayClipCommand(
          (tabId) => sendMessage('content:quickCapturePage', undefined, { tabId }),
          tab,
        );
      }
    });

    browser.runtime.onInstalled.addListener(async (event) => {
      createContextMenus();

      // Run migration for both install and update events
      await migrateLegacyClipSettingsToTemplates().catch((err) =>
        log.error('Failed to migrate legacy clip settings:', err),
      );
      await SearchEngineConfigMigration.runMigrations();
      // Idempotent, so it is safe on every install/update (version gating via
      // versionCompare was unreliable).
      await changeOptionsHostToHostNameAndPort();
      await migrateRecallRuleDefaultsToEnglish().catch((err) =>
        log.error('Failed to migrate the recall rule defaults:', err),
      );
      // After the English copy: it matches the old English description.
      await migrateGithubRecallRuleToRepoScope().catch((err) =>
        log.error('Failed to migrate the GitHub recall rule:', err),
      );

      if (event.reason === 'install') {
        browser.runtime.openOptionsPage();
      }
    });

    // The sidebar drawn on pages starts closed with the browser, like the
    // browser's own.
    browser.runtime.onStartup.addListener(() => {
      inPageSidebarOpenItem
        .setValue(false)
        .catch((err) => log.error('Failed to close the in-page sidebar:', err));
    });

    browser.commands.onCommand.addListener((command, tab) => {
      if (command === 'open-sidebar') {
        openSidebarForTab(tab);
      } else if (command === 'clip' && tab !== undefined) {
        void relayClipCommand(
          (tabId) => sendMessage('content:quickCapture', undefined, { tabId }),
          tab,
        );
      }
    });

    async function setExtensionBadge(text: string, tabId: number) {
      // A clip error stays on the tab until the next successful clip.
      if (hasClipErrorBadge(tabId)) return;
      await browser.action.setBadgeText({
        text: text,
        tabId: tabId,
      });
      await browser.action.setBadgeBackgroundColor({ color: '#4caf50', tabId });
      await browser.action.setBadgeTextColor({ color: '#ffffff', tabId });
    }
  },
});
