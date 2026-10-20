import { getLogseqCopliotConfig } from '@/utils/storage';
import { blockRending } from '@/utils/utils';
import { debounce } from '@/utils';
import { format } from 'date-fns';
import {
  changeOptionsHostToHostNameAndPort,
  migrateLegacyClipSettingsToTemplates,
} from './upgrade';
import { getLogseqService } from './logseq/tool';
import { SearchEngineConfigMigration } from '@/utils/migration';
import { templates } from '@/utils/storage';
import { onMessage, sendMessage } from '@/types/messaging';
import { RecallRuleProcessor } from '@/utils/recall-rule-processor';
import type { LogseqBlockType } from '@/types/logseqBlock';
import log from '@/utils/logger';

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

    onMessage('logseq:hybridSearch', async ({ data }) => {
      const logseqService = await getLogseqService();

      // Apply recall rules processing
      const recallProcessor = RecallRuleProcessor.getInstance();
      const searchContext = await recallProcessor.processSearchContext(
        data.url,
      );

      // Perform both URL search and query search (query search only for
      // keywordOnly, e.g. search engine result pages, where the page URL says
      // nothing about the content). Errors (LogseqError) are thrown and reach
      // the sender as a readable message.
      const urlSearchRes = data.keywordOnly
        ? undefined
        : await logseqService.urlSearch(
            searchContext.processedUrl,
            data.options,
          );
      const querySearchRes = await logseqService.search(data.query);

      // Combine results, prioritizing URL-based results; drop duplicate blocks
      const seenUuids = new Set<string>();
      const blocks = [
        ...(urlSearchRes?.response?.blocks || []),
        ...(querySearchRes.response?.blocks || []),
      ].filter((block: LogseqBlockType) => {
        if (seenUuids.has(block.uuid)) return false;
        seenUuids.add(block.uuid);
        return true;
      });
      const pages = [
        ...(urlSearchRes?.response?.pages || []),
        ...(querySearchRes.response?.pages || []),
      ];

      // Filter results (blocks and pages) based on recall rules
      const filteredBlocks = recallProcessor.filterResults(
        blocks,
        searchContext,
      );
      const filteredPages = recallProcessor.filterPages(pages, searchContext);

      return {
        status: (urlSearchRes ?? querySearchRes).status,
        msg: (urlSearchRes ?? querySearchRes).msg,
        response: {
          blocks: filteredBlocks,
          pages: filteredPages,
          graph: urlSearchRes?.response?.graph || querySearchRes.response?.graph,
        },
        count: filteredBlocks.length + filteredPages.length,
      };
    });

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
        data.options,
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

    onMessage('logseq:clipWithSelection', async ({ data }) => {
      await quickCapture(data);
    });

    onMessage('logseq:clipPage', async () => {
      await quickCapture('');
    });

    onMessage('app:openPage', async ({ data }) => {
      await openPage(data.url);
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

    const quickCapture = async (data: string) => {
      const tab = await getCurrentTab();
      if (!tab) return;
      const activeTab = tab;

      // Get the first template (default template) from the templates list
      const templateList = await templates.getValue();
      const defaultTemplate = templateList[0];

      if (!defaultTemplate) {
        log.error('No templates found for clipping');
        return;
      }

      const now = new Date();
      const logseqService = await getLogseqService();

      const resp = await logseqService.client.getUserConfig();

      const block = blockRending({
        url: activeTab.url,
        title: activeTab.title,
        data,
        clipNoteTemplate: defaultTemplate.content,
        preferredDateFormat: resp['preferredDateFormat'],
        time: now,
      });

      const clipNoteLocation = defaultTemplate.clipNoteLocation || 'journal';
      const clipNoteCustomPage = defaultTemplate.clipNoteCustomPage || '';

      if (clipNoteLocation === 'customPage') {
        await logseqService.client.appendBlock(clipNoteCustomPage, block);
      } else if (clipNoteLocation === 'currentPage') {
        const { name: currentPage } =
          await logseqService.client.getCurrentPage();
        await logseqService.client.appendBlock(currentPage, block);
      } else {
        const journalPage = format(now, resp['preferredDateFormat']);
        await logseqService.client.appendBlock(journalPage, block);
      }

      debounceBadgeSearch(activeTab.url, activeTab.id!);
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
    };

    browser.contextMenus.onClicked.addListener((info, tab) => {
      if (info.menuItemId === 'clip-with-selection') {
        sendMessage('content:quickCaptureWithSelection', undefined, {
          tabId: tab!.id!,
        });
      } else if (info.menuItemId === 'clip-page') {
        sendMessage('content:quickCapturePage', undefined, { tabId: tab!.id! });
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

      if (event.reason === 'install') {
        browser.runtime.openOptionsPage();
      }
    });

    browser.commands.onCommand.addListener((command, tab) => {
      if (command === 'clip' && tab !== undefined) {
        sendMessage('content:quickCapture', undefined, { tabId: tab.id! });
      }
    });

    async function setExtensionBadge(text: string, tabId: number) {
      await browser.action.setBadgeText({
        text: text,
        tabId: tabId,
      });
      await browser.action.setBadgeBackgroundColor({ color: '#4caf50', tabId });
      await browser.action.setBadgeTextColor({ color: '#ffffff', tabId });
    }
  },
});
