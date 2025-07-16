import { getLogseqCopliotConfig } from '@/utils/storage';
import { blockRending, versionCompare } from '@/utils/utils';
import { debounce } from '@/utils';
import { format } from 'date-fns';
import { changeOptionsHostToHostNameAndPort } from './upgrade';
import { getLogseqService } from './logseq/tool';
import { SearchEngineConfigMigration } from '@/utils/migration';
import { templates } from '@/utils/storage';
import { onMessage, sendMessage } from '@/types/messaging';

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
      console.debug('search result', searchRes);
      return searchRes;
    });

    onMessage('logseq:urlSearch', async ({ data }) => {
      const logseqService = await getLogseqService();
      const url = new URL(data.url);
      const searchRes = await logseqService.urlSearch(url, data.options);
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
      const result = await changeBlockMarker(data.uuid, data.marker);
      return result;
    });

    const changeBlockMarker = async (uuid: string, marker: string) => {
      const tab = await getCurrentTab();
      if (!tab) {
        return {
          type: 'change-block-marker-result',
          uuid,
          status: 'error',
          marker,
          msg: 'No active tab found',
        };
      }
      const logseqService = await getLogseqService();
      const result = await logseqService.changeBlockMarker(uuid, marker);

      // Send result to content script
      await sendMessage(
        'content:blockMarkerChanged',
        {
          type: 'change-block-marker-result',
          uuid,
          status: 'success',
          marker,
          msg: result.msg,
        },
        { tabId: tab.id! },
      );

      return {
        type: 'change-block-marker-result',
        uuid,
        status: 'success',
        marker,
        msg: result.msg,
      };
    };

    const getCurrentTab = async () => {
      const tab = await browser.tabs.query({
        active: true,
        currentWindow: true,
      });
      return tab[0];
    };

    const openPage = async (url: string) => {
      console.debug(url);
      const tab = await getCurrentTab();
      if (!tab) {
        browser.tabs.create({ url: url });
        return;
      }
      const activeTab = tab;
      if (activeTab.url !== url)
        await browser.tabs.update(activeTab.id, { url: url });
    };

    const quickCapture = async (data: string) => {
      const tab = await getCurrentTab();
      if (!tab) return;
      const activeTab = tab;

      // Get the first template (default template) from the templates list
      const templateList = await templates.getValue();
      const defaultTemplate = templateList[0];

      if (!defaultTemplate) {
        console.error('No templates found for clipping');
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
      promise.catch((err) => console.error(err));
    });

    browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      if (tab.active && changeInfo.status === 'complete') {
        const promise = new Promise(async () => {
          await debounceBadgeSearch(tab.url, tabId);
        });
        promise.catch((err) => console.error(err));
      }
    });

    const badgeSearch = async (url: string | undefined, tabId: number) => {
      if (!url) return;
      const searchURL = new URL(url);
      const logseqService = await getLogseqService();
      const searchRes = await logseqService.urlSearch(searchURL);
      const resultCount = searchRes.count ? searchRes.count!.toString() : '';
      await setExtensionBadge(resultCount, tabId);
    };

    const debounceBadgeSearch = debounce(badgeSearch, 1000);

    try {
      browser.contextMenus.create({
        id: 'clip-with-selection',
        title: 'Clip "%s"',
        visible: true,
        contexts: ['selection'],
      });
    } catch (error) {
      console.log(error);
    }

    try {
      browser.contextMenus.create({
        id: 'clip-page',
        title: 'Clip page link',
        visible: true,
        contexts: ['page'],
      });
    } catch (error) {
      console.log(error);
    }

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
      // Run migration for both install and update events
      await SearchEngineConfigMigration.runMigrations();

      if (event.reason === 'install') {
        browser.runtime.openOptionsPage();
      } else if (event.reason === 'update') {
        if (versionCompare(event.previousVersion!, '1.10.19') < 0) {
          changeOptionsHostToHostNameAndPort();
        }
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
