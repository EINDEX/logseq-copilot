import { searchEngineConfig, SearchEngineConfig } from './storage';
import { log } from './index';

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

      // Define the default built-in search engines with full configuration
      const builtInEngines: SearchEngineConfig[] = [
        {
          id: 'google',
          name: 'Google',
          enabled: true,
          icon: '🔍',
          description: "The world's most popular search engine",
          isCustom: false,
          urlPattern: '\\.google(\\.com?)?(\\.[a-z]{2})?(\\.[a-z]{3})?$',
          querySelector: '?q',
          elementSelector: '#rhs',
          insertPosition: 'first',
        },
        {
          id: 'bing',
          name: 'Bing',
          enabled: true,
          icon: '🔷',
          description: "Microsoft's search engine with AI integration",
          isCustom: false,
          urlPattern: 'bing(\\.com?)?(\\.[a-z]{2})?$',
          querySelector: '?q',
          elementSelector: '#b_context',
          insertPosition: 'first',
        },
        {
          id: 'duckduckgo',
          name: 'DuckDuckGo',
          enabled: true,
          icon: '🦆',
          description: 'Privacy-focused search engine',
          isCustom: false,
          urlPattern: 'duckduckgo\\.com$',
          querySelector: '?q',
          elementSelector: '.js-react-sidebar',
          insertPosition: 'first',
        },
        {
          id: 'ecosia',
          name: 'Ecosia',
          enabled: true,
          icon: '🌱',
          description: 'Search engine that plants trees',
          isCustom: false,
          urlPattern: 'ecosia\\.org$',
          querySelector: '?q',
          elementSelector: '.layout__content .web .sidebar',
          insertPosition: 'first',
        },
        {
          id: 'yandex',
          name: 'Yandex',
          enabled: true,
          icon: '🔴',
          description: 'Russian search engine and web services',
          isCustom: false,
          urlPattern: 'yandex\\.(com|ru)$',
          querySelector: '?text',
          elementSelector: '#search-result-aside',
          insertPosition: 'first',
        },
        {
          id: 'searx',
          name: 'SearX',
          enabled: true,
          icon: '🔒',
          description: 'Privacy-respecting metasearch engine',
          isCustom: false,
          urlPattern: '^searx(ng)?\\.',
          querySelector: '?q',
          elementSelector: '#sidebar',
          insertPosition: 'first',
        },
        {
          id: 'baidu',
          name: 'Baidu',
          enabled: true,
          icon: '🐾',
          description: 'Leading Chinese search engine',
          isCustom: false,
          urlPattern: 'baidu\\.com',
          querySelector: '?wd',
          elementSelector: '#con-ar',
          insertPosition: 'first',
        },
        {
          id: 'kagi',
          name: 'Kagi',
          enabled: true,
          icon: '🔎',
          description: 'Ad-free, privacy-focused search',
          isCustom: false,
          urlPattern: 'kagi\\.com$',
          querySelector: '?q',
          elementSelector: 'div.right-content-box',
          insertPosition: 'first',
        },
        {
          id: 'startpage',
          name: 'Startpage',
          enabled: true,
          icon: '🛡️',
          description: 'Private search using Google results',
          isCustom: false,
          urlPattern: 'startpage\\.com$',
          querySelector: '#q',
          elementSelector: 'div.layout-web__sidebar.layout-web__sidebar--web',
          insertPosition: 'first',
        },
      ];

      // Merge existing configuration with new built-in engines
      const migratedConfig: SearchEngineConfig[] = [];

      // First, add built-in engines with preserved enabled state
      for (const builtInEngine of builtInEngines) {
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
   * Run all necessary migrations
   */
  static async runMigrations() {
    try {
      await this.migrateToV2();
      log.info(
        '[Migration] All search engine migrations completed successfully',
      );
    } catch (error) {
      log.error('[Migration] Migration failed:', error);
      throw error;
    }
  }
}

/**
 * Auto-run migrations on import
 */
SearchEngineConfigMigration.runMigrations().catch((error) => {
  console.error('Failed to run search engine migrations:', error);
});
