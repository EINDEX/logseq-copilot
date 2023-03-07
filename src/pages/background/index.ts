import LogseqClient from '../logseq/client';
import Browser from 'webextension-polyfill';
import { getLogseqCopliotConfig } from '../../config';
import { removeUrlHash } from '../../utils';
import { setExtensionBadge } from './utils';

const logseqClient = new LogseqClient();
// const connect = Browser.runtime.connect();

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
    } else if (msg.type === 'quick-capture') {
      quickCapture(msg.data);
    } else {
      console.debug(msg);
    }
  });
});

const quickCapture = async (data: string) => {
  const tab = await Browser.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;
  const activeTab = tab[0];
  const url = `logseq://x-callback-url/quickCapture?title=${
    activeTab.title
  }&url=${encodeURIComponent(activeTab.url)}&content=${data}`;
  Browser.tabs.update(activeTab.id, { url: url });
};

Browser.runtime.onInstalled.addListener(() => {
  const promise = new Promise(async () => {
    const { logseqAuthToken } = await getLogseqCopliotConfig();
    if (logseqAuthToken === '') Browser.runtime.openOptionsPage();
  });
  promise.catch((err) => console.error(err));
});

Browser.tabs.onActivated.addListener((activeInfo) => {
  const promise = new Promise(async () => {
    const tab = await Browser.tabs.get(activeInfo.tabId);
    await badgeSearch(tab.url, activeInfo.tabId);
  });
  promise.catch((err) => console.error(err));
});

Browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (tab.active) {
    const promise = new Promise(async () => {
      await badgeSearch(changeInfo.url, tabId);
    });
    promise.catch((err) => console.error(err));
  }
});

const badgeSearch = async (url: string | undefined, tabId: number) => {
  if (!url) return;
  console.debug(url);
  const cleanUrl = removeUrlHash(url);
  const searchRes = await logseqClient.blockSearch(cleanUrl);
  const resultCount = searchRes.count ? searchRes.count!.toString() : '';
  await setExtensionBadge(resultCount, tabId);
};
