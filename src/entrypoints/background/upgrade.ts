import { getLogseqCopliotConfig, saveLogseqCopliotConfig } from '@/config';

export const changeOptionsHostToHostNameAndPort = async () => {
  const { logseqHost } = await getLogseqCopliotConfig();
  if (logseqHost) {
    const url = new URL(logseqHost);
    await saveLogseqCopliotConfig({
      logseqHostName: url.hostname,
      logseqPort: parseInt(url.port),
    });
    browser.storage.local.remove('logseqHost');
  }
};
