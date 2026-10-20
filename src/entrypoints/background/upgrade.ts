import {
  getLogseqCopliotConfig,
  saveLogseqCopliotConfig,
  storageItems,
} from '@/config';
import { storage } from '#imports';
import { templates, type TemplateItemV1 } from '@/utils/storage';

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

const DEFAULT_TEMPLATE_CONTENT = `#[[Clip]] [{{title}}]({{url}})
{{content}}`;

const CLIP_SETTINGS_MIGRATED_KEY = 'local:clipSettingsMigratedToTemplates';

/**
 * One-time migration of the legacy clip settings (`clipNoteTemplate`,
 * `clipNoteLocation`, `clipNoteCustomPage`) into the first entry of the
 * `templates` storage item, which is the only thing quickCapture reads.
 *
 * Only runs when the user has not customised `templates` yet (unset, or still
 * the single built-in default). The legacy keys are left untouched, and a flag
 * makes the migration idempotent.
 */
export const migrateLegacyClipSettingsToTemplates = async () => {
  if (await storage.getItem<boolean>(CLIP_SETTINGS_MIGRATED_KEY)) return;

  const [legacyContent, legacyLocation, legacyCustomPage] = await Promise.all([
    storage.getItem<string>('local:clipNoteTemplate'),
    storage.getItem<string>('local:clipNoteLocation'),
    storage.getItem<string>('local:clipNoteCustomPage'),
  ]);
  if (
    legacyContent == null &&
    legacyLocation == null &&
    legacyCustomPage == null
  ) {
    return;
  }

  const current = await storage.getItem<TemplateItemV1[]>('local:templates');
  const isDefaultOrEmpty =
    !current ||
    current.length === 0 ||
    (current.length === 1 &&
      current[0].id === 'default' &&
      current[0].content === DEFAULT_TEMPLATE_CONTENT);

  if (isDefaultOrEmpty) {
    await templates.setValue([
      {
        id: 'default',
        name: current?.[0]?.name || 'Default',
        content: legacyContent || DEFAULT_TEMPLATE_CONTENT,
        clipNoteLocation: legacyLocation || 'journal',
        clipNoteCustomPage: legacyCustomPage || '',
      },
    ]);
  }

  await storage.setItem(CLIP_SETTINGS_MIGRATED_KEY, true);
};
