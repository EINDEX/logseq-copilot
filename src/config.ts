import Browser from 'webextension-polyfill';

export type LogseqCopliotConfig = {
  version: string;
  logseqHost: string;
  logseqHostName: string;
  logseqPort: number;
  logseqAuthToken: string;
  enableClipNoteFloatButton: boolean;
  clipNoteLocation: string;
  clipNoteCustomPage: string;
  clipNoteTemplate: string;
};

export const getLogseqCopliotConfig =
  async (): Promise<LogseqCopliotConfig> => {
    const {
      version = '',
      logseqHost = 'http://localhost:12315',
      logseqHostName = 'localhost',
      logseqPort = 12315,
      logseqAuthToken = import.meta.env.WXT_LOGSEQ_TOKEN || '',
      enableClipNoteFloatButton = false,
      clipNoteLocation = "journal",
      clipNoteCustomPage = "",
      clipNoteTemplate = `#[[Clip]] [{{title}}]({{url}})
{{content}}`
    } = await Browser.storage.local.get();
    return {
      version,
      logseqHost,
      logseqHostName,
      logseqPort,
      logseqAuthToken,
      enableClipNoteFloatButton,
      clipNoteLocation,
      clipNoteCustomPage,
      clipNoteTemplate,
    };
  };

export const saveLogseqCopliotConfig = async (
  updates: Partial<LogseqCopliotConfig>,
) => {
  console.log('saveLogseqCopliotConfig', updates);
  await Browser.storage.local.set(updates);
};
