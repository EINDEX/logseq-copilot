import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing';
import { storage } from '#imports';
import { SearchEngineConfigMigration } from './migration';
import {
  BUILT_IN_SEARCH_ENGINES,
  searchEngineConfig,
  type SearchEngineConfig,
} from './storage';

const KEY = 'local:searchEngineConfig';
const byId = (id: string) => BUILT_IN_SEARCH_ENGINES.find((e) => e.id === id)!;

/** A config saved by a version without Brave Search: Google off, a custom engine. */
const savedBeforeBrave = (): SearchEngineConfig[] => [
  ...BUILT_IN_SEARCH_ENGINES.filter((e) => e.id !== 'brave').map((e) =>
    e.id === 'google' ? { ...e, enabled: false } : e,
  ),
  {
    id: 'custom-1',
    name: 'My engine',
    enabled: true,
    isCustom: true,
    urlPattern: 'search\\.example\\.com$',
    querySelector: '?q',
    elementSelector: '#side',
    insertPosition: 'first',
  },
];

describe('SearchEngineConfigMigration.addMissingBuiltInEngines', () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });

  it('includes Brave Search in the defaults', async () => {
    expect(byId('brave')).toMatchObject({
      enabled: true,
      isCustom: false,
      querySelector: '?q',
      elementSelector: '#mixed-side',
    });
    expect((await searchEngineConfig.getValue()).map((e) => e.id)).toContain(
      'brave',
    );
  });

  it('adds Brave Search to a config saved before it existed', async () => {
    const saved = savedBeforeBrave();
    await storage.setItem(KEY, saved);

    await SearchEngineConfigMigration.addMissingBuiltInEngines();

    const config = await searchEngineConfig.getValue();
    // Everything saved stays as it was and in its place; Brave goes last.
    expect(config.slice(0, saved.length)).toEqual(saved);
    expect(config).toHaveLength(saved.length + 1);
    expect(config[config.length - 1]).toEqual(byId('brave'));
  });

  it('keeps a saved Brave entry as it is', async () => {
    const saved = [{ ...byId('brave'), enabled: false }];
    await storage.setItem(KEY, saved);

    await SearchEngineConfigMigration.addMissingBuiltInEngines();

    const config = await searchEngineConfig.getValue();
    expect(config.filter((e) => e.id === 'brave')).toEqual(saved);
  });

  it('is idempotent', async () => {
    await storage.setItem(KEY, savedBeforeBrave());

    await SearchEngineConfigMigration.addMissingBuiltInEngines();
    const once = await searchEngineConfig.getValue();
    await SearchEngineConfigMigration.addMissingBuiltInEngines();

    expect(await searchEngineConfig.getValue()).toEqual(once);
  });

  it('writes nothing when no config is saved', async () => {
    await SearchEngineConfigMigration.addMissingBuiltInEngines();
    expect(await storage.getItem(KEY)).toBeNull();
  });

  it('runs on install and update (runMigrations)', async () => {
    await storage.setItem(KEY, savedBeforeBrave());

    await SearchEngineConfigMigration.runMigrations();

    const config = await searchEngineConfig.getValue();
    expect(config.find((e) => e.id === 'google')?.enabled).toBe(false);
    expect(config.find((e) => e.id === 'brave')?.enabled).toBe(true);
  });

  it('also covers configs from before the v2 migration', async () => {
    // 1.x saved only id and enabled state.
    await storage.setItem(KEY, [
      { id: 'google', name: 'Google', enabled: false },
      { id: 'bing', name: 'Bing', enabled: true },
    ]);

    await SearchEngineConfigMigration.runMigrations();

    const config = await searchEngineConfig.getValue();
    expect(config.map((e) => e.id)).toEqual(
      BUILT_IN_SEARCH_ENGINES.map((e) => e.id),
    );
    expect(config.find((e) => e.id === 'google')?.enabled).toBe(false);
    expect(config.find((e) => e.id === 'brave')).toEqual(byId('brave'));
  });
});
