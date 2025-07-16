import { useState, useEffect, useCallback } from 'react';
import {
  LogseqCopliotConfig,
  getLogseqCopliotConfig,
  saveLogseqCopliotConfig,
  storageItems,
} from '@/utils/storage';
import { log } from '@/utils';

export interface UseSettingsReturn {
  settings: LogseqCopliotConfig | null;
  loading: boolean;
  error: string | null;
  updateSettings: (updates: Partial<LogseqCopliotConfig>) => Promise<void>;
  resetSettings: () => Promise<void>;
  refreshSettings: () => Promise<void>;
}

/**
 * Custom hook for managing Logseq Copilot settings using WXT storage
 *
 * @returns {UseSettingsReturn} Object containing settings, loading state, and utility functions
 *
 * @example
 * ```tsx
 * const { settings, loading, updateSettings } = useSettings();
 *
 * if (loading) return <div>Loading...</div>;
 *
 * const handleHostChange = (newHost: string) => {
 *   updateSettings({ logseqHostName: newHost });
 * };
 * ```
 */
export function useSettings(): UseSettingsReturn {
  const [settings, setSettings] = useState<LogseqCopliotConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /**
   * Load settings from storage
   */
  const loadSettings = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const config = await getLogseqCopliotConfig();
      setSettings(config);
      log.debug('[useSettings] Settings loaded:', config);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to load settings';
      setError(errorMessage);
      log.error('[useSettings] Failed to load settings:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Update settings with partial updates
   */
  const updateSettings = useCallback(
    async (updates: Partial<LogseqCopliotConfig>) => {
      try {
        setError(null);

        // Optimistically update local state
        setSettings((prev) => (prev ? { ...prev, ...updates } : null));

        // Save to storage
        await saveLogseqCopliotConfig(updates);

        log.debug('[useSettings] Settings updated:', updates);
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : 'Failed to update settings';
        setError(errorMessage);
        log.error('[useSettings] Failed to update settings:', err);

        // Revert optimistic update by reloading from storage
        await loadSettings();
      }
    },
    [loadSettings],
  );

  /**
   * Reset all settings to default values
   */
  const resetSettings = useCallback(async () => {
    try {
      setError(null);

      // Reset all storage items to their default values
      const resetPromises = Object.values(storageItems).map((item) =>
        item.removeValue(),
      );
      await Promise.all(resetPromises);

      // Reload settings to get fresh defaults
      await loadSettings();

      log.info('[useSettings] Settings reset to defaults');
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to reset settings';
      setError(errorMessage);
      log.error('[useSettings] Failed to reset settings:', err);
    }
  }, [loadSettings]);

  /**
   * Refresh settings from storage (useful for syncing across contexts)
   */
  const refreshSettings = useCallback(async () => {
    await loadSettings();
  }, [loadSettings]);

  // Load settings on mount
  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  // Set up storage change listeners for real-time updates
  useEffect(() => {
    const unsubscribers: (() => void)[] = [];

    // Listen to changes in individual storage items
    Object.entries(storageItems).forEach(([key, item]) => {
      const unsubscribe = item.watch((newValue) => {
        log.debug(`[useSettings] Storage item ${key} changed:`, newValue);
        // Reload entire config when any item changes
        loadSettings();
      });
      unsubscribers.push(unsubscribe);
    });

    // Cleanup listeners on unmount
    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [loadSettings]);

  return {
    settings,
    loading,
    error,
    updateSettings,
    resetSettings,
    refreshSettings,
  };
}

/**
 * Hook for managing a specific setting item
 *
 * @param key - The key of the setting to manage
 * @returns Object with the setting value and update function
 *
 * @example
 * ```tsx
 * const { value: authToken, setValue: setAuthToken, loading } = useSetting('logseqAuthToken');
 * ```
 */
export function useSetting<K extends keyof LogseqCopliotConfig>(key: K) {
  const { settings, loading, updateSettings } = useSettings();

  const setValue = useCallback(
    (value: LogseqCopliotConfig[K]) => {
      return updateSettings({ [key]: value } as Partial<LogseqCopliotConfig>);
    },
    [key, updateSettings],
  );

  return {
    value: settings?.[key] ?? null,
    setValue,
    loading,
  };
}
