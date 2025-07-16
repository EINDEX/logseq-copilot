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

export interface SearchEngineConfig {
  id: string;
  name: string;
  enabled: boolean;
  icon?: string;
  description?: string;
  isCustom?: boolean;
  // Custom search engine template fields
  urlPattern?: string; // Regex pattern or hostname to match
  querySelector?: string; // CSS selector or URL parameter to get search query
  elementSelector?: string; // CSS selector to find where to insert the Logseq Copilot
  insertPosition?: 'before' | 'after' | 'first' | 'last'; // Where to insert relative to the element
}

export interface AIProviderConfig {
  id: string;
  name: string;
  type: 'openai' | 'anthropic' | 'google' | 'ollama' | 'litellm' | 'custom';
  baseUrl?: string;
  apiKey: string;
  model: string;
  enabled: boolean;
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
}

export interface AIConfig {
  enabled: boolean;
  providers: AIProviderConfig[];
  defaultProvider?: string;
  autoRun: boolean;
  defaultContext: string;
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

export const searchEngineConfig = storage.defineItem<SearchEngineConfig[]>(
  'local:searchEngineConfig',
  {
    version: 1,
    fallback: [
      { id: 'google', name: 'Google', enabled: true, icon: '🔍', description: 'The world\'s most popular search engine' },
      { id: 'bing', name: 'Bing', enabled: true, icon: '🔷', description: 'Microsoft\'s search engine with AI integration' },
      { id: 'duckduckgo', name: 'DuckDuckGo', enabled: true, icon: '🦆', description: 'Privacy-focused search engine' },
      { id: 'ecosia', name: 'Ecosia', enabled: true, icon: '🌱', description: 'Search engine that plants trees' },
      { id: 'yandex', name: 'Yandex', enabled: true, icon: '🔴', description: 'Russian search engine and web services' },
      { id: 'searx', name: 'SearX', enabled: true, icon: '🔒', description: 'Privacy-respecting metasearch engine' },
      { id: 'baidu', name: 'Baidu', enabled: true, icon: '🐾', description: 'Leading Chinese search engine' },
      { id: 'kagi', name: 'Kagi', enabled: true, icon: '🔎', description: 'Ad-free, privacy-focused search' },
      { id: 'startpage', name: 'Startpage', enabled: true, icon: '🛡️', description: 'Private search using Google results' },
    ],
  },
);

export const aiConfig = storage.defineItem<AIConfig>(
  'local:aiConfig',
  {
    version: 1,
    fallback: {
      enabled: false,
      providers: [],
      autoRun: false,
      defaultContext: '{{fullHtml}}',
    },
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
