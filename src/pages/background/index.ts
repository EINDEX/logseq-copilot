import LogseqClient from './client/logseq';

const logseqClient = new LogseqClient();

chrome.runtime.onConnect.addListener((port) => {
  port.onMessage.addListener((msg) => {
    const promise = new Promise(async () => {
      const searchRes = await logseqClient.searchLogseq(msg.query);
      port.postMessage(searchRes);
    });

    promise.catch((err) => console.error(err));
  });
});
