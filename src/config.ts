export interface logseqCopliotConfig {
  logseqHost: string | undefined;
  logseqAuthToken: string | undefined;
}

export const getLogseqCopliotConfig =
  async (): Promise<logseqCopliotConfig> => {
    const { logseqHost = 'http://localhost:12315', logseqAuthToken = 'token' } =
      await chrome.storage.local.get();
    return {
      logseqHost,
      logseqAuthToken,
    };
  };

export const saveLogseqCopliotConfig = async (
  updates: Partial<logseqCopliotConfig>,
) => {
  console.log('saveLogseqCopliotConfig', updates);
  await chrome.storage.local.set(updates);
};
