import {
  getLogseqCopliotConfig,
  saveLogseqCopliotConfig,
  storageItems,
} from '@/config';

export const changeOptionsHostToHostNameAndPort = async () => {
  const { logseqHost } = await getLogseqCopliotConfig();
  if (logseqHost) {
    const url = new URL(logseqHost);
    await saveLogseqCopliotConfig({
      logseqHostName: url.hostname,
      logseqPort: parseInt(url.port),
    });
    // Remove the old logseqHost key using WXT storage
    await storageItems.logseqHost.removeValue();
  }
};
