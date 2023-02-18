export type LogseqCopliotConfig = {
  logseqHost: string;
  logseqAuthToken: string;
};

export const getLogseqCopliotConfig =
  async (): Promise<LogseqCopliotConfig> => {
    const { logseqHost = 'http://localhost:12315', logseqAuthToken = '' } =
      await chrome.storage.local.get();
    return {
      logseqHost,
      logseqAuthToken,
    };
  };

export const saveLogseqCopliotConfig = async (
  updates: Partial<LogseqCopliotConfig>,
) => {
  console.log('saveLogseqCopliotConfig', updates);
  await chrome.storage.local.set(updates);
};
