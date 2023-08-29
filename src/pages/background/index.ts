import { browser } from '@/browser';
import LogseqClient from '../logseq/client';
import { getLogseqCopliotConfig } from '../../config';
import { removeUrlHash } from '@/utils';
import { blockRending, versionCompare } from './utils';
import { debounce } from '@/utils';
import { format } from 'date-fns';
import { changeOptionsHostToHostNameAndPort } from './upgrade';

const logseqClient = new LogseqClient();

browser.runtime.onConnect.addListener((port) => {
  port.onMessage.addListener((msg) => {
    if (msg.type === 'query') {
      const promise = new Promise(async () => {
        const searchRes = await logseqClient.searchLogseq(msg.query);
        port.postMessage(searchRes);
      });

      promise.catch((err) => console.error(err));
    } else if (msg.type === 'open-options') {
      browser.runtime.openOptionsPage();
    } else {
      console.debug(msg);
    }
  });
});

browser.runtime.onMessage.addListener((msg, sender) => {
  if (msg.type === 'open-options') {
    browser.runtime.openOptionsPage();
  } else if (msg.type === 'clip-with-selection') {
    quickCapture(msg.data);
  } else if (msg.type === 'clip-page') {
    quickCapture('');
  } else if (msg.type === 'open-page') {
    openPage(msg.url);
  } else {
    console.debug(msg);
  }
});

const openPage = async (url: string) => {
  console.debug(url);
  const tab = await browser.tabs.query({ active: true, currentWindow: true });
  if (!tab) {
    browser.tabs.create({ url: url });
    return;
  }
  const activeTab = tab[0];
  if (activeTab.url !== url)
    await browser.tabs.update(activeTab.id, { url: url });
};

const quickCapture = async (data: string) => {
  const tab = await browser.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;
  const activeTab = tab[0];
  const { clipNoteLocation, clipNoteCustomPage, clipNoteTemplate } =
    await getLogseqCopliotConfig();
  const now = new Date();
  const resp = await logseqClient.getUserConfig();
  
  const block = blockRending({
    url: activeTab.url,
    title: activeTab.title,
    data,
    clipNoteTemplate,
    preferredDateFormat: resp['preferredDateFormat'],
    time: now,
  });

  if (clipNoteLocation === 'customPage') {
    await logseqClient.appendBlock(clipNoteCustomPage, block);
  } else if (clipNoteLocation === 'currentPage') {
    const { name: currentPage } = await logseqClient.getCurrentPage();
    await logseqClient.appendBlock(currentPage, block);
  } else {
    const journalPage = format(now, resp['preferredDateFormat']);
    await logseqClient.appendBlock(journalPage, block);
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
  const cleanUrl = removeUrlHash(url);
  const searchRes = await logseqClient.blockSearch(cleanUrl);
  const resultCount = searchRes.count ? searchRes.count!.toString() : '';
  await setExtensionBadge(resultCount, tabId);
};

const debounceBadgeSearch = debounce(badgeSearch, 500);

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
  browser.tabs.sendMessage(tab!.id!, { type: info.menuItemId }, {});
});

browser.runtime.onInstalled.addListener((event) => {
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
    browser.tabs.sendMessage(tab.id!, { type: 'clip' });
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
