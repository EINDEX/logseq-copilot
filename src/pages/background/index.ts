import { browser } from '@/browser';
import { getLogseqCopliotConfig } from '../../config';
import { blockRending, versionCompare } from './utils';
import { debounce } from '@/utils';
import { format } from 'date-fns';
import { changeOptionsHostToHostNameAndPort } from './upgrade';
import {getLogseqService} from '@pages/logseq/tool';

browser.runtime.onConnect.addListener((port) => {
  port.onMessage.addListener((msg) => {
    if (msg.type === 'query') {
      const promise = new Promise(async () => {
        const logseqService = await getLogseqService();
        const searchRes = await logseqService.search(msg.query);
        console.debug("search result", searchRes)
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
  } else if (msg.type === 'change-block-marker') {
    changeBlockMarker(msg.uuid, msg.marker);
  } else {
    console.debug(msg);
  }
});

const changeBlockMarker = async (uuid: string, marker: string) => {
  const tab = await getCurrentTab();
  if (!tab) {
    return;
  }
  const logseqService = await getLogseqService();
  const result = await logseqService.changeBlockMarker(uuid, marker);
  browser.tabs.sendMessage(tab.id!, result);
};

const getCurrentTab = async () => {
  const tab = await browser.tabs.query({ active: true, currentWindow: true });
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
  const { clipNoteLocation, clipNoteCustomPage, clipNoteTemplate } =
    await getLogseqCopliotConfig();
  const now = new Date();
  const logseqService = await getLogseqService();

  const resp = await logseqService.client.getUserConfig();

  const block = blockRending({
    url: activeTab.url,
    title: activeTab.title,
    data,
    clipNoteTemplate,
    preferredDateFormat: resp['preferredDateFormat'],
    time: now,
  });

  if (clipNoteLocation === 'customPage') {
    await logseqService.client.appendBlock(clipNoteCustomPage, block);
  } else if (clipNoteLocation === 'currentPage') {
    const { name: currentPage } = await logseqService.client.getCurrentPage();
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
