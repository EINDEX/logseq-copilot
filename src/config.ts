import Browser from 'webextension-polyfill';

export type LogseqCopliotConfig = {
  logseqHost: string;
  logseqAuthToken: string;
  enableClipNoteFloatButton: boolean;
  clipNoteLocation: string;
  clipNoteCustomPage: string;
  clipNoteTemplate: string;
};

export const getLogseqCopliotConfig =
  async (): Promise<LogseqCopliotConfig> => {
    const {
      logseqHost = 'http://localhost:12315',
      logseqAuthToken = '',
      enableClipNoteFloatButton = true,
      clipNoteLocation = "journal",
      clipNoteCustomPage = "",
      clipNoteTemplate = `[[date]] **{{time}}**
url:: [{{title}}]({{url}})
tags:: [[Clip]]
{{content}}`
    } = await Browser.storage.local.get();
    return {
      logseqHost,
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
