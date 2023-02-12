import LogseqClient from './client/logseq';

const logseqClient = new LogseqClient();

chrome.runtime.onConnect.addListener((port) => {
  port.onMessage.addListener((msg) => {
    console.log(msg);
    const promise = new Promise(async () => {
      console.log(await logseqClient.search(msg.query));
      port.postMessage(await logseqClient.search(msg.query));
    });

    promise.catch((err) => console.error(err));
  });
});
