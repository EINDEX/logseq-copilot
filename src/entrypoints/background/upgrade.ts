import { storage } from '#imports';
import { saveLogseqCopliotConfig } from '@/config';
import { templates, type TemplateItemV1 } from '@/utils/storage';

const DEFAULT_PORTS: Record<string, number> = { 'http:': 80, 'https:': 443 };

const parseLegacyHost = (legacyHost: string) => {
  // Very old versions may have stored a bare "host:port" without a scheme.
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(legacyHost)
    ? legacyHost
    : `http://${legacyHost}`;
  const url = new URL(withScheme);
  if (!url.hostname) throw new TypeError('empty hostname');
  const port = url.port ? parseInt(url.port) : DEFAULT_PORTS[url.protocol];
  return { hostName: url.hostname, port };
};

/**
 * Migrate the legacy full-URL `logseqHost` key to `logseqHostName` +
 * `logseqPort`. Idempotent: it only acts when the legacy key still exists,
 * never overwrites host name / port the user has already saved, and always
 * removes the legacy key afterwards.
 */
export const changeOptionsHostToHostNameAndPort = async () => {
  // Read the raw values: the typed storage items return fallbacks for missing
  // keys, which would be indistinguishable from stored values here.
  const legacyHost = await storage.getItem<string>('local:logseqHost');
  if (legacyHost === null) return;

  const [savedHostName, savedPort] = await Promise.all([
    storage.getItem<string>('local:logseqHostName'),
    storage.getItem<number>('local:logseqPort'),
  ]);

  if (savedHostName === null && savedPort === null) {
    try {
      const { hostName, port } = parseLegacyHost(legacyHost);
      await saveLogseqCopliotConfig({
        logseqHostName: hostName,
        ...(port !== undefined && { logseqPort: port }),
      });
    } catch {
      // Unparseable legacy value: fall through and keep the defaults.
    }
  }

  await storage.removeItem('local:logseqHost');
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
