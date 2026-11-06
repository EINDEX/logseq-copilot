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

describe('SearchEngineConfigMigration.refreshBuiltInEngines', () => {
  const OLD_STARTPAGE = 'div.layout-web__sidebar.layout-web__sidebar--web';

  /** A config saved by a version with Startpage's old selector: Startpage off. */
  const savedWithOldStartpage = (): SearchEngineConfig[] => [
    ...savedBeforeBrave().map((e) =>
      e.id === 'startpage'
        ? { ...e, enabled: false, elementSelector: OLD_STARTPAGE }
        : e,
    ),
    byId('brave'),
  ];

  beforeEach(() => {
    fakeBrowser.reset();
  });

  it("gives Startpage its current mount point, the right column's section#sidebar", () => {
    expect(byId('startpage').elementSelector).toBe('section#sidebar');
  });

  it('updates a saved built-in definition and keeps its on/off state and place', async () => {
    const saved = savedWithOldStartpage();
    await storage.setItem(KEY, saved);

    await SearchEngineConfigMigration.refreshBuiltInEngines();

    const config = await searchEngineConfig.getValue();
    const index = saved.findIndex((e) => e.id === 'startpage');
    expect(config[index]).toEqual({ ...byId('startpage'), enabled: false });
    // Everything else as it was: Google still off, the custom engine.
    expect(config.filter((e) => e.id !== 'startpage')).toEqual(
      saved.filter((e) => e.id !== 'startpage'),
    );
  });

  it('leaves custom engines alone, also one for a built-in site', async () => {
    const custom: SearchEngineConfig = {
      id: 'custom-startpage',
      name: 'My Startpage',
      enabled: true,
      isCustom: true,
      urlPattern: 'startpage\\.com$',
      querySelector: '#q',
      elementSelector: OLD_STARTPAGE,
      insertPosition: 'last',
    };
    await storage.setItem(KEY, [custom, ...savedWithOldStartpage()]);

    await SearchEngineConfigMigration.refreshBuiltInEngines();

    const config = await searchEngineConfig.getValue();
    expect(config[0]).toEqual(custom);
    expect(config.find((e) => e.id === 'custom-1')).toEqual(
      savedBeforeBrave().find((e) => e.id === 'custom-1'),
    );
  });

  it('writes nothing when the saved definitions are current', async () => {
    // Saved with the keys in another order: still the same definition.
    const saved = BUILT_IN_SEARCH_ENGINES.map((e) =>
      Object.fromEntries(Object.entries(e).reverse()),
    );
    await storage.setItem(KEY, saved);
    const writes: unknown[] = [];
    const unwatch = storage.watch(KEY, (value) => writes.push(value));

    await SearchEngineConfigMigration.refreshBuiltInEngines();

    unwatch();
    expect(writes).toEqual([]);
  });

  it('writes nothing when no config is saved', async () => {
    await SearchEngineConfigMigration.refreshBuiltInEngines();
    expect(await storage.getItem(KEY)).toBeNull();
  });

  it('runs on install and update (runMigrations)', async () => {
    await storage.setItem(KEY, savedWithOldStartpage());

    await SearchEngineConfigMigration.runMigrations();

    const startpage = (await searchEngineConfig.getValue()).find(
      (e) => e.id === 'startpage',
    );
    expect(startpage).toEqual({ ...byId('startpage'), enabled: false });
  });
});
