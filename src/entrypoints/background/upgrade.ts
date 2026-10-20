import { storage } from '#imports';
import { saveLogseqCopliotConfig } from '@/config';

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
