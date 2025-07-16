import { useState, useEffect, useCallback } from 'react';
import { SearchEngineConfig, searchEngineConfig } from '@/utils/storage';
import { log } from '@/utils';

export interface UseSearchEnginesReturn {
  searchEngines: SearchEngineConfig[];
  loading: boolean;
  error: string | null;
  updateSearchEngine: (
    id: string,
    updates: Partial<SearchEngineConfig>,
  ) => Promise<void>;
  toggleSearchEngine: (id: string) => Promise<void>;
  refreshConfig: () => Promise<void>;
  getEnabledSearchEngines: () => SearchEngineConfig[];
  isSearchEngineEnabled: (id: string) => boolean;
  addCustomSearchEngine: (
    config: Omit<SearchEngineConfig, 'id'>,
  ) => Promise<void>;
  removeSearchEngine: (id: string) => Promise<void>;
  getCustomSearchEngines: () => SearchEngineConfig[];
  getBuiltInSearchEngines: () => SearchEngineConfig[];
}

/**
 * Custom hook for managing search engine configuration using WXT storage
 *
 * @returns {UseSearchEnginesReturn} Object containing search engines, loading state, and utility functions
 *
 * @example
 * ```tsx
 * const { searchEngines, loading, toggleSearchEngine, isSearchEngineEnabled } = useSearchEngines();
 *
 * if (loading) return <div>Loading...</div>;
 *
 * const handleToggle = (id: string) => {
 *   toggleSearchEngine(id);
 * };
 * ```
 */
export function useSearchEngines(): UseSearchEnginesReturn {
  const [engines, setEngines] = useState<SearchEngineConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /**
   * Load search engine config from storage
   */
  const loadConfig = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const configData = await searchEngineConfig.getValue();
      setEngines(configData);
      log.debug('[useSearchEngines] Search engine config loaded:', configData);
    } catch (err) {
      const errorMessage =
        err instanceof Error
          ? err.message
          : 'Failed to load search engine config';
      setError(errorMessage);
      log.error('[useSearchEngines] Failed to load search engine config:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Update a specific search engine
   */
  const updateSearchEngine = useCallback(
    async (id: string, updates: Partial<SearchEngineConfig>) => {
      try {
        setError(null);
        const currentConfig = await searchEngineConfig.getValue();
        const updatedConfig = currentConfig.map((engine) =>
          engine.id === id ? { ...engine, ...updates } : engine,
        );

        await searchEngineConfig.setValue(updatedConfig);
        setEngines(updatedConfig);

        log.debug('[useSearchEngines] Search engine updated:', { id, updates });
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : 'Failed to update search engine';
        setError(errorMessage);
        log.error('[useSearchEngines] Failed to update search engine:', err);
      }
    },
    [],
  );

  /**
   * Toggle a search engine's enabled state
   */
  const toggleSearchEngine = useCallback(
    async (id: string) => {
      const engine = engines.find((e) => e.id === id);
      if (engine) {
        await updateSearchEngine(id, { enabled: !engine.enabled });
      }
    },
    [engines, updateSearchEngine],
  );

  /**
   * Get only enabled search engines
   */
  const getEnabledSearchEngines = useCallback(() => {
    return engines.filter((engine) => engine.enabled);
  }, [engines]);

  /**
   * Check if a specific search engine is enabled
   */
  const isSearchEngineEnabled = useCallback(
    (id: string) => {
      const engine = engines.find((e) => e.id === id);
      return engine?.enabled ?? false;
    },
    [engines],
  );

  /**
   * Add a custom search engine
   */
  const addCustomSearchEngine = useCallback(
    async (config: Omit<SearchEngineConfig, 'id'>) => {
      try {
        setError(null);
        const currentConfig = await searchEngineConfig.getValue();

        // Generate a unique ID for the custom search engine
        const customId = `custom-${Date.now()}-${Math.random()
          .toString(36)
          .substr(2, 9)}`;

        const newEngine: SearchEngineConfig = {
          ...config,
          id: customId,
          isCustom: true,
        };

        const updatedConfig = [...currentConfig, newEngine];
        await searchEngineConfig.setValue(updatedConfig);
        setEngines(updatedConfig);

        log.debug('[useSearchEngines] Custom search engine added:', newEngine);
      } catch (err) {
        const errorMessage =
          err instanceof Error
            ? err.message
            : 'Failed to add custom search engine';
        setError(errorMessage);
        log.error(
          '[useSearchEngines] Failed to add custom search engine:',
          err,
        );
      }
    },
    [],
  );

  /**
   * Remove a search engine (only custom ones can be removed)
   */
  const removeSearchEngine = useCallback(async (id: string) => {
    try {
      setError(null);
      const currentConfig = await searchEngineConfig.getValue();
      const engineToRemove = currentConfig.find((e) => e.id === id);

      if (!engineToRemove?.isCustom) {
        throw new Error('Cannot remove built-in search engines');
      }

      const updatedConfig = currentConfig.filter((engine) => engine.id !== id);
      await searchEngineConfig.setValue(updatedConfig);
      setEngines(updatedConfig);

      log.debug('[useSearchEngines] Search engine removed:', id);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to remove search engine';
      setError(errorMessage);
      log.error('[useSearchEngines] Failed to remove search engine:', err);
    }
  }, []);

  /**
   * Get only custom search engines
   */
  const getCustomSearchEngines = useCallback(() => {
    return engines.filter((engine) => engine.isCustom);
  }, [engines]);

  /**
   * Get only built-in search engines
   */
  const getBuiltInSearchEngines = useCallback(() => {
    return engines.filter((engine) => !engine.isCustom);
  }, [engines]);

  /**
   * Refresh config from storage
   */
  const refreshConfig = useCallback(async () => {
    await loadConfig();
  }, [loadConfig]);

  // Load config on mount
  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  // Set up storage change listeners for real-time updates
  useEffect(() => {
    const unsubscribe = searchEngineConfig.watch((newConfig) => {
      log.debug('[useSearchEngines] Search engine config changed:', newConfig);
      setEngines(newConfig);
    });

    return unsubscribe;
  }, []);

  return {
    searchEngines: engines,
    loading,
    error,
    updateSearchEngine,
    toggleSearchEngine,
    refreshConfig,
    getEnabledSearchEngines,
    isSearchEngineEnabled,
    addCustomSearchEngine,
    removeSearchEngine,
    getCustomSearchEngines,
    getBuiltInSearchEngines,
  };
}

/**
 * Hook for getting a specific search engine configuration
 */
export function useSearchEngine(id: string) {
  const { searchEngines, loading, updateSearchEngine } = useSearchEngines();

  const engine = searchEngines.find((e) => e.id === id);

  return {
    engine,
    loading,
    updateEngine: (updates: Partial<SearchEngineConfig>) =>
      updateSearchEngine(id, updates),
    isEnabled: engine?.enabled ?? false,
  };
}
