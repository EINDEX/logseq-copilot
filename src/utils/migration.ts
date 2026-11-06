import { storage } from '#imports';
import {
  BUILT_IN_SEARCH_ENGINES,
  searchEngineConfig,
  SearchEngineConfig,
} from './storage';
import { log } from './index';

/** The same fields with the same values (the order of the keys aside). */
const sameEngine = (a: SearchEngineConfig, b: SearchEngineConfig) => {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...keys].every(
    (key) =>
      a[key as keyof SearchEngineConfig] === b[key as keyof SearchEngineConfig],
  );
};

/**
 * Migration utility for search engine configuration
 */
export class SearchEngineConfigMigration {
  /**
   * Migrate from v1 to v2 search engine configuration
   * This handles the transition from simple config to full configuration-based search engines
   */
  static async migrateToV2() {
    try {
      const currentConfig = await searchEngineConfig.getValue();

      // Check if migration is needed
      const needsMigration = currentConfig.some(
        (engine) =>
          !engine.urlPattern ||
          !engine.querySelector ||
          !engine.elementSelector,
      );

      if (!needsMigration) {
        log.debug('[Migration] Search engine config is already up to date');
        return;
      }

      log.info(
        '[Migration] Starting search engine configuration migration to v2',
      );

      // Merge existing configuration with new built-in engines
      const migratedConfig: SearchEngineConfig[] = [];

      // First, add built-in engines with preserved enabled state
      for (const builtInEngine of BUILT_IN_SEARCH_ENGINES) {
        const existingEngine = currentConfig.find(
          (e) => e.id === builtInEngine.id,
        );
        migratedConfig.push({
          ...builtInEngine,
          enabled: existingEngine
            ? existingEngine.enabled
            : builtInEngine.enabled,
        });
      }

      // Then, add any custom engines that already exist
      const customEngines = currentConfig.filter((e) => e.isCustom === true);
      for (const customEngine of customEngines) {
        // Ensure custom engines have all required fields
        if (
          customEngine.urlPattern &&
          customEngine.querySelector &&
          customEngine.elementSelector
        ) {
          migratedConfig.push(customEngine);
        }
      }

      // Save the migrated configuration
      await searchEngineConfig.setValue(migratedConfig);

      log.info(
        '[Migration] Successfully migrated search engine configuration to v2',
      );
      log.debug('[Migration] Migrated configuration:', migratedConfig);
    } catch (error) {
      log.error(
        '[Migration] Failed to migrate search engine configuration:',
        error,
      );
      throw error;
    }
  }

  /**
   * Add the built-in engines a saved config does not have yet (e.g. Brave
   * Search for users upgrading from an older version), enabled by default.
   * They go at the end: the content script uses the first enabled engine
   * that matches, so a custom engine the user made for the same site keeps
   * working. Entries already saved are left as they are. Built-in engines
   * cannot be removed, so a missing id is always a new one; that makes this
   * idempotent. Nothing is written when no config is saved: the fallback
   * already has every built-in engine.
   */
  static async addMissingBuiltInEngines() {
    // The raw value: the typed item returns its fallback for a missing key.
    const saved = await storage.getItem<SearchEngineConfig[]>(
      'local:searchEngineConfig',
    );
    if (!Array.isArray(saved)) return;

    const savedIds = new Set(saved.map((engine) => engine.id));
    const missing = BUILT_IN_SEARCH_ENGINES.filter(
      (engine) => !savedIds.has(engine.id),
    );
    if (missing.length === 0) return;

    await searchEngineConfig.setValue([...saved, ...missing]);
    log.info(
      '[Migration] Added built-in search engines:',
      missing.map((engine) => engine.id),
    );
  }

  /**
   * Give the saved built-in engines the definition that ships (URL pattern,
   * selectors, ...), each keeping whether it is on. The content script reads
   * the definitions from the saved config, so without this an engine keeps
   * the selector of the version that saved it after the site changed its
   * markup (Startpage's right column). The options page edits custom engines
   * only, so a built-in entry holds nothing else the user set. Custom
   * engines and the order stay as they are. Writes only when a definition
   * changed, and nothing when no config is saved (the fallback is current).
   */
  static async refreshBuiltInEngines() {
    // The raw value: the typed item returns its fallback for a missing key.
    const saved = await storage.getItem<SearchEngineConfig[]>(
      'local:searchEngineConfig',
    );
    if (!Array.isArray(saved)) return;

    const builtIn = new Map(
      BUILT_IN_SEARCH_ENGINES.map((engine) => [engine.id, engine]),
    );
    const refreshed: string[] = [];
    const config = saved.map((engine) => {
      const current = builtIn.get(engine.id);
      if (!current || engine.isCustom) return engine;
      const updated = { ...current, enabled: engine.enabled ?? current.enabled };
      if (sameEngine(engine, updated)) return engine;
      refreshed.push(engine.id);
      return updated;
    });
    if (refreshed.length === 0) return;

    await searchEngineConfig.setValue(config);
    log.info('[Migration] Updated built-in search engines:', refreshed);
  }

  /**
   * Run all necessary migrations
   */
  static async runMigrations() {
    try {
      await this.migrateToV2();
      await this.addMissingBuiltInEngines();
      await this.refreshBuiltInEngines();
      log.info(
        '[Migration] All search engine migrations completed successfully',
      );
    } catch (error) {
      log.error('[Migration] Migration failed:', error);
      throw error;
    }
  }
}
