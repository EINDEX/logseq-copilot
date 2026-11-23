import { debounce } from '@/utils';
import {
  addTaskTemplate,
  changeOptionsHostToHostNameAndPort,
  migrateGithubRecallRuleToRepoScope,
  migrateLegacyClipSettingsToTemplates,
  migrateRecallRuleDefaultsToEnglish,
  removeInPageClipShortcut,
} from './upgrade';
import { getGraphKind, getLogseqService } from './logseq/tool';
import { SearchEngineConfigMigration } from '@/utils/migration';
import { inPageSidebarOpenItem, templates } from '@/utils/storage';
import { TASK_TEMPLATE_ID } from '@/utils/default-templates';
import {
  OPEN_SIDEBAR_MENU_ID,
  parseClipMenuId,
  rebuildContextMenus,
} from './context-menus';
import { onMessage, sendMessage } from '@/types/messaging';
import { RecallRuleProcessor } from '@/utils/recall-rule-processor';
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
import { setBadgeTextColorIfSupported } from './badge-text-color';
import { clipErrorMessage } from '@/utils/clip-feedback';
import { isLogseqUrl } from '@/utils/logseq-url';
import { startSidebarAction } from './sidebar-action';
import { checkHighlightLinks, syncHighlightNote } from './highlight-sync';

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

    onMessage('logseq:syncHighlightNote', async ({ data }) => {
      return await syncHighlightNote(data.id);
    });

    onMessage('logseq:checkHighlightLinks', async ({ data }) => {
      return await checkHighlightLinks(data.ids);
    });

    onMessage('logseq:listTags', async () => {
      const logseqService = await getLogseqService();
      return await logseqService.listTags();
    });

    onMessage('logseq:listProperties', async () => {
      try {
        const logseqService = await getLogseqService();
        return await logseqService.listProperties();
      } catch (error) {
        log.warn('Could not list the properties of the graph.', error);
        return [];
      }
    });

    onMessage('logseq:graphKind', () => getGraphKind());

    onMessage('app:openOptions', async () => {
      browser.runtime.openOptionsPage();
    });

    // A failed clip rejects with a readable message (LogseqError), which the
    // sender (content script, sidebar) shows.
    // The content script sends this from the page it clips, so clip its tab:
    // the active tab of the current window can be another page once focus has
    // moved.
    onMessage('logseq:clipWithSelection', async ({ data, sender }) => {
      const { text, templateId, note, subframe } =
        typeof data === 'string'
          ? { text: data, templateId: undefined, note: undefined, subframe: false }
          : data;
      return await quickCapture(text, sender.tab, templateId, note, subframe !== true);
    });

    // The browser sidebar names the tab beside it: its messages have no
    // sender tab, and the active tab of the current window may be in another
    // window.
    onMessage('logseq:clipPage', async ({ data }) => {
      const tabId = data?.tabId;
      return await quickCapture(
        '',
        tabId === undefined ? undefined : await browser.tabs.get(tabId),
        data?.templateId,
        data?.note,
      );
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
      // The sender (content script or sidebar) updates its UI from this return
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
    // active tab of the current window. `pageImages`: see `clip`.
    const quickCapture = async (
      data: string,
      senderTab?: { id?: number; url?: string; title?: string },
      templateId?: string,
      note?: string,
      pageImages = true,
    ) => {
      const tab = senderTab ?? (await getCurrentTab());
      if (!tab) throw new Error('No tab to clip.');
      return await clip(
        {
          url: tab.url,
          title: tab.title,
          data,
          ...(templateId && { templateId }),
          ...(note && { note }),
        },
        tab.id,
        pageImages,
      );
    };

    // "Save images to Logseq" asks the tab for the images of the clip only
    // when they come from the page itself (`pageImages`), never for a clip
    // from a frame inside it: that frame chose the URL, and the page would
    // fetch it with its own cookies.
    const clip = async (
      source: ClipSource,
      tabId: number | undefined,
      pageImages = true,
    ) => {
      const clipped = await clipToLogseq(source, pageImages ? tabId : undefined);
      await clearClipErrorBadges();
      if (tabId !== undefined) debounceBadgeSearch(source.url, tabId);
      return clipped;
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

    // Menus persist across service worker restarts, but they follow the
    // templates, so they are rebuilt (from scratch, one rebuild at a time)
    // when the extension is installed or updated, the browser starts, and the
    // templates change. onInstalled also fires when the browser itself updates
    // (chrome_update, browser_update) while the menus still exist; a rebuild
    // removes them all first, so no id is created twice (#78). Never at every
    // service worker start: it is no event of the menus.
    templates.watch(() => void rebuildContextMenus());

    // Call sidebar.open / sidebar.toggle first in the handler of a click, menu
    // item or command: the browser opens its sidebar only while the user
    // action is still alive, so nothing may be awaited before it.
    const sidebar = startSidebarAction();

    // The toolbar button. Chrome opens its side panel itself, without this
    // event, unless the sidebar drawn on pages is in use (sidebar-action.ts).
    browser.action.onClicked.addListener((tab) => sidebar.toggle(tab));

    // Clip commands (shortcut, context menu) go to the content script: it
    // clips the selection as Markdown, highlights it, and shows a failure in
    // the page. Where it cannot run (the browser's PDF viewer, ...), the
    // background clips the plain selected text a menu click reports, and
    // reports a failure on the toolbar button.
    const relayClipCommand = async (
      send: (tabId: number) => Promise<void>,
      tab: Browser.tabs.Tab | undefined,
      info: {
        selectionText?: string;
        pageUrl?: string;
        srcUrl?: string;
        frameId?: number;
      } = {},
      templateId?: string,
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
        const fallback = backgroundClipFallback(info, tab, templateId);
        if (!fallback) throw new Error(CANNOT_CLIP_PAGE);
        await clip(fallback, tab?.id, !inSubframe(info));
      } catch (err) {
        await showClipErrorBadge(tab?.id, clipErrorMessage(err));
      }
    };

    // A context menu opened in a frame inside the page (0: the page itself).
    const inSubframe = (info: { frameId?: number }) =>
      info.frameId !== undefined && info.frameId !== 0;

    // The data of a clip command sent to the content script.
    const clipOptions = (templateId?: string) =>
      templateId === undefined ? undefined : { templateId };

    browser.contextMenus.onClicked.addListener((info, tab) => {
      if (info.menuItemId === OPEN_SIDEBAR_MENU_ID) {
        sidebar.open(tab);
        return;
      }
      const clipMenu = parseClipMenuId(info.menuItemId);
      if (!clipMenu) return;
      const { templateId } = clipMenu;
      if (clipMenu.command === 'selection') {
        void relayClipCommand(
          (tabId) =>
            sendMessage(
              'content:quickCaptureWithSelection',
              clipOptions(templateId),
              { tabId },
            ),
          tab,
          info,
          templateId,
        );
      } else if (clipMenu.command === 'image') {
        const srcUrl = info.srcUrl;
        if (!srcUrl) return;
        void relayClipCommand(
          (tabId) =>
            sendMessage(
              'content:quickCaptureImage',
              {
                ...clipOptions(templateId),
                srcUrl,
                ...(inSubframe(info) && { subframe: true }),
              },
              { tabId },
            ),
          tab,
          { srcUrl, pageUrl: info.pageUrl, frameId: info.frameId },
          templateId,
        );
      } else {
        void relayClipCommand(
          (tabId) =>
            sendMessage('content:quickCapturePage', clipOptions(templateId), {
              tabId,
            }),
          tab,
          {},
          templateId,
        );
      }
    });

    browser.runtime.onInstalled.addListener(async (event) => {
      // Not awaited: on Firefox it would delay the options page install opens.
      void rebuildContextMenus();

      // Run migration for both install and update events
      await migrateLegacyClipSettingsToTemplates().catch((err) =>
        log.error('Failed to migrate legacy clip settings:', err),
      );
      // After the legacy migration: it appends to the templates it wrote.
      await addTaskTemplate().catch((err) =>
        log.error('Failed to add the Task template:', err),
      );
      await SearchEngineConfigMigration.runMigrations();
      // Idempotent, so it is safe on every install/update (version gating via
      // versionCompare was unreliable).
      await changeOptionsHostToHostNameAndPort();
      await removeInPageClipShortcut().catch((err) =>
        log.error('Failed to remove the in-page clip shortcut:', err),
      );
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
      void rebuildContextMenus();
      inPageSidebarOpenItem
        .setValue(false)
        .catch((err) => log.error('Failed to close the in-page sidebar:', err));
    });

    browser.commands.onCommand.addListener((command, tab) => {
      if (command === 'open-sidebar') {
        sidebar.open(tab);
      } else if (command === 'clip' && tab !== undefined) {
        void relayClipCommand(
          (tabId) => sendMessage('content:quickCapture', undefined, { tabId }),
          tab,
        );
      } else if (command === 'clip-task' && tab !== undefined) {
        void relayClipCommand(
          (tabId) =>
            sendMessage('content:quickCapture', clipOptions(TASK_TEMPLATE_ID), {
              tabId,
            }),
          tab,
          {},
          TASK_TEMPLATE_ID,
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
      await setBadgeTextColorIfSupported('#ffffff', tabId);
    }
  },
});
