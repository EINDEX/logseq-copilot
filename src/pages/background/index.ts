import LogseqClient from '../logseq/client';
import Browser from 'webextension-polyfill';
import { getLogseqCopliotConfig } from '../../config';
import { removeUrlHash } from '@/utils';
import { setExtensionBadge, versionCompare } from './utils';
import { delay, debounce } from '@/utils';
import { format } from 'date-fns';
import { changeOptionsHostToHostNameAndPort } from './upgrade';

const logseqClient = new LogseqClient();

Browser.runtime.onConnect.addListener((port) => {
  port.onMessage.addListener((msg) => {
    if (msg.type === 'query') {
      const promise = new Promise(async () => {
        const searchRes = await logseqClient.searchLogseq(msg.query);
        port.postMessage(searchRes);
      });

      promise.catch((err) => console.error(err));
    } else if (msg.type === 'open-options') {
      Browser.runtime.openOptionsPage();
    } else {
      console.debug(msg);
    }
  });
});

Browser.runtime.onMessage.addListener((msg, sender) => {
  if (msg.type === 'open-options') {
    Browser.runtime.openOptionsPage();
  } else if (msg.type === 'clip-with-selection') {
    quickCapture(msg.data);
  } else if (msg.type === 'clip-page') {
    quickCapture('');
  } else if (msg.type === 'open-page') {
    openPage(msg.url);
  } else {
    console.debug(msg)
  }
});

const openPage = async (url: string) => {
  console.debug(url);
  const tab = await Browser.tabs.query({ active: true, currentWindow: true });
  if (!tab) {
    Browser.tabs.create({ url: url });
    return;
  }
  const activeTab = tab[0];
  if (activeTab.url !== url)
    await Browser.tabs.update(activeTab.id, { url: url });
};

const quickCapture = async (data: string) => {
  const tab = await Browser.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;
  const activeTab = tab[0];
  const { clipNoteLocation, clipNoteCustomPage, clipNoteTemplate } =
    await getLogseqCopliotConfig();
  const now = new Date();
  const resp = await logseqClient.getUserConfig();
  const journalPage = format(now, resp['preferredDateFormat']);
  const render = clipNoteTemplate
    .replaceAll('{{date}}', journalPage)
    .replaceAll('{{content}}', data.replaceAll(/([\{\}])/g, '\\$1'))
    .replaceAll('{{url}}', activeTab.url)
    .replaceAll(
      '{{time}}',
      `${now.getHours()}:${
        now.getMinutes() < 10 ? '0' + now.getMinutes() : now.getMinutes()
      }`,
    )
    .replaceAll('{{title}}', activeTab.title)
    .trim();

  if (clipNoteLocation === 'customPage') {
    await logseqClient.appendBlock(clipNoteCustomPage, render);
  } else if (clipNoteLocation === 'currentPage') {
    const { name: currentPage } = await logseqClient.getCurrentPage();
    await logseqClient.appendBlock(currentPage, render);
  } else {
    await logseqClient.appendBlock(journalPage, render);
  }

  debounceBadgeSearch(activeTab.url, activeTab.id);
};

Browser.tabs.onActivated.addListener((activeInfo) => {
  const promise = new Promise(async () => {
    const tab = await Browser.tabs.get(activeInfo.tabId);
    await debounceBadgeSearch(tab.url, activeInfo.tabId);
  });
  promise.catch((err) => console.error(err));
});

Browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (tab.active && changeInfo.status === 'complete') {
    const promise = new Promise(async () => {
      await debounceBadgeSearch(tab.url, tabId);
    });
    promise.catch((err) => console.error(err));
  }
});

const badgeSearch = async (url: string | undefined, tabId: number) => {
  if (!url) return;
  const cleanUrl = removeUrlHash(url);
  const searchRes = await logseqClient.blockSearch(cleanUrl);
  const resultCount = searchRes.count ? searchRes.count!.toString() : '';
  await setExtensionBadge(resultCount, tabId);
};

const debounceBadgeSearch = debounce(badgeSearch, 500);

try {
  Browser.contextMenus.create({
    id: 'clip-with-selection',
    title: 'Clip "%s"',
    visible: true,
    contexts: ['selection'],
  });
} catch (error) {
  console.log(error);
}

try {
  Browser.contextMenus.create({
    id: 'clip-page',
    title: 'Clip page link',
    visible: true,
    contexts: ['page'],
  });
} catch (error) {
  console.log(error);
}

Browser.contextMenus.onClicked.addListener((info, tab) => {
  Browser.tabs.sendMessage(tab!.id!, { type: info.menuItemId }, {});
});

Browser.runtime.onInstalled.addListener((event) => {
  if (event.reason === 'install') {
    Browser.runtime.openOptionsPage();
  } else if (event.reason === 'update') {
    if (versionCompare(event.previousVersion!, '1.10.19') < 0) {
      changeOptionsHostToHostNameAndPort();
    }
  }
});

Browser.commands.onCommand.addListener((command, tab) => {
  if (command === 'clip' && tab !== undefined) {
    Browser.tabs.sendMessage(tab.id!, { type: 'clip' });
  }
});
