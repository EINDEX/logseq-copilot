import { storage } from '#imports';

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

export interface LogseqCopliotSettingsV1 {
  logseqPortcol: string;
  logseqHost: string;
  logseqPort: number;
  logseqAuthToken: string;
}

export interface TemplateItemV1 {
  id: string;
  name: string;
  content: string;
  clipNoteLocation?: string;
  clipNoteCustomPage?: string;
}

export const settings = storage.defineItem<LogseqCopliotSettingsV1>(
  'local:settings',
  {
    version: 1,
    fallback: {
      logseqPortcol: 'http',
      logseqHost: 'localhost',
      logseqPort: 12315,
      logseqAuthToken: '',
    },
  },
);

export const templates = storage.defineItem<TemplateItemV1[]>(
  'local:templates',
  {
    version: 1,
    fallback: [
      {
        id: 'default',
        name: 'Default',
        content: `#[[Clip]] [{{title}}]({{url}})
{{content}}`,
        clipNoteLocation: 'journal',
        clipNoteCustomPage: '',
      },
    ],
  },
);

// Define individual storage items for better type safety and default values
export const versionItem = storage.defineItem<string>('local:version', {
  fallback: '',
});

export const logseqHostItem = storage.defineItem<string>('local:logseqHost', {
  fallback: 'http://localhost:12315',
});

export const logseqHostNameItem = storage.defineItem<string>(
  'local:logseqHostName',
  {
    fallback: 'localhost',
  },
);

export const logseqPortItem = storage.defineItem<number>('local:logseqPort', {
  fallback: 12315,
});

export const logseqAuthTokenItem = storage.defineItem<string>(
  'local:logseqAuthToken',
  {
    fallback: import.meta.env.WXT_LOGSEQ_TOKEN || '',
  },
);

export const enableClipNoteFloatButtonItem = storage.defineItem<boolean>(
  'local:enableClipNoteFloatButton',
  {
    fallback: false,
  },
);

export const clipNoteLocationItem = storage.defineItem<string>(
  'local:clipNoteLocation',
  {
    fallback: 'journal',
  },
);

export const clipNoteCustomPageItem = storage.defineItem<string>(
  'local:clipNoteCustomPage',
  {
    fallback: '',
  },
);

export const clipNoteTemplateItem = storage.defineItem<string>(
  'local:clipNoteTemplate',
  {
    fallback: `#[[Clip]] [{{title}}]({{url}})
{{content}}`,
  },
);

// Convenience function to get all configuration as an object
export const getLogseqCopliotConfig =
  async (): Promise<LogseqCopliotConfig> => {
    const [
      version,
      logseqHost,
      logseqHostName,
      logseqPort,
      logseqAuthToken,
      enableClipNoteFloatButton,
      clipNoteLocation,
      clipNoteCustomPage,
      clipNoteTemplate,
    ] = await Promise.all([
      versionItem.getValue(),
      logseqHostItem.getValue(),
      logseqHostNameItem.getValue(),
      logseqPortItem.getValue(),
      logseqAuthTokenItem.getValue(),
      enableClipNoteFloatButtonItem.getValue(),
      clipNoteLocationItem.getValue(),
      clipNoteCustomPageItem.getValue(),
      clipNoteTemplateItem.getValue(),
    ]);

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

// Convenience function to save partial configuration updates
export const saveLogseqCopliotConfig = async (
  updates: Partial<LogseqCopliotConfig>,
): Promise<void> => {
  console.log('saveLogseqCopliotConfig', updates);

  const updatePromises: Promise<void>[] = [];

  if (updates.version !== undefined) {
    updatePromises.push(versionItem.setValue(updates.version));
  }
  if (updates.logseqHost !== undefined) {
    updatePromises.push(logseqHostItem.setValue(updates.logseqHost));
  }
  if (updates.logseqHostName !== undefined) {
    updatePromises.push(logseqHostNameItem.setValue(updates.logseqHostName));
  }
  if (updates.logseqPort !== undefined) {
    updatePromises.push(logseqPortItem.setValue(updates.logseqPort));
  }
  if (updates.logseqAuthToken !== undefined) {
    updatePromises.push(logseqAuthTokenItem.setValue(updates.logseqAuthToken));
  }
  if (updates.enableClipNoteFloatButton !== undefined) {
    updatePromises.push(
      enableClipNoteFloatButtonItem.setValue(updates.enableClipNoteFloatButton),
    );
  }
  if (updates.clipNoteLocation !== undefined) {
    updatePromises.push(
      clipNoteLocationItem.setValue(updates.clipNoteLocation),
    );
  }
  if (updates.clipNoteCustomPage !== undefined) {
    updatePromises.push(
      clipNoteCustomPageItem.setValue(updates.clipNoteCustomPage),
    );
  }
  if (updates.clipNoteTemplate !== undefined) {
    updatePromises.push(
      clipNoteTemplateItem.setValue(updates.clipNoteTemplate),
    );
  }

  await Promise.all(updatePromises);
};

// Export individual storage items for direct access if needed
export const storageItems = {
  version: versionItem,
  logseqHost: logseqHostItem,
  logseqHostName: logseqHostNameItem,
  logseqPort: logseqPortItem,
  logseqAuthToken: logseqAuthTokenItem,
  enableClipNoteFloatButton: enableClipNoteFloatButtonItem,
  clipNoteLocation: clipNoteLocationItem,
  clipNoteCustomPage: clipNoteCustomPageItem,
  clipNoteTemplate: clipNoteTemplateItem,
} as const;
