import LogseqClient from '../logseq/client';
import Browser from 'webextension-polyfill';
import { getLogseqCopliotConfig } from '../../config';

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
    }
  });
});

Browser.runtime.onInstalled.addListener(() => {
  const promise = new Promise(async () => {
    const { logseqAuthToken } = await getLogseqCopliotConfig();
    if (logseqAuthToken === '') Browser.runtime.openOptionsPage();
  });
  promise.catch((err) => console.error(err));
});
