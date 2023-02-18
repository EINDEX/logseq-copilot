import LogseqClient from '../logseq/client';

const logseqClient = new LogseqClient();

chrome.runtime.onConnect.addListener((port) => {
  port.onMessage.addListener((msg) => {
    if (msg.type === 'query') {
      const promise = new Promise(async () => {
        const searchRes = await logseqClient.searchLogseq(msg.query);
        port.postMessage(searchRes);
      });

      promise.catch((err) => console.error(err));
    } else if (msg.type === 'open-options') {
      chrome.runtime.openOptionsPage();
    }
  });
});
