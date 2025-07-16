import { useState, useEffect, useCallback } from 'react';
import { aiConfig, AIConfig, AIProviderConfig } from '@/utils/storage';
import { log } from '@/utils';

export interface UseAIConfigReturn {
  aiConfig: AIConfig;
  loading: boolean;
  error: string | null;
  updateConfig: (updates: Partial<AIConfig>) => Promise<void>;
  addProvider: (provider: Omit<AIProviderConfig, 'id'>) => Promise<void>;
  updateProvider: (
    id: string,
    updates: Partial<AIProviderConfig>,
  ) => Promise<void>;
  deleteProvider: (id: string) => Promise<void>;
  getProvider: (id: string) => AIProviderConfig | undefined;
  reorderProviders: (newOrder: AIProviderConfig[]) => Promise<void>;
  refreshConfig: () => Promise<void>;
}

/**
 * Custom hook for managing AI configuration using WXT storage
 *
 * @returns {UseAIConfigReturn} Object containing AI config, loading state, and utility functions
 *
 * @example
 * ```tsx
 * const { aiConfig, loading, addProvider, updateProvider } = useAIConfig();
 *
 * if (loading) return <div>Loading...</div>;
 *
 * const handleAddProvider = () => {
 *   addProvider({
 *     name: 'OpenAI',
 *     type: 'openai',
 *     apiKey: 'sk-...',
 *     model: 'gpt-4',
 *     enabled: true
 *   });
 * };
 * ```
 */
export function useAIConfig(): UseAIConfigReturn {
  const [config, setConfig] = useState<AIConfig>({
    enabled: false,
    providers: [],
    autoRun: false,
    defaultContext: '{{fullHtml}}',
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /**
   * Load AI config from storage
   */
  const loadConfig = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const configData = await aiConfig.getValue();
      setConfig(configData);
      log.debug('[useAIConfig] AI config loaded:', configData);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to load AI config';
      setError(errorMessage);
      log.error('[useAIConfig] Failed to load AI config:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Update AI config
   */
  const updateConfig = useCallback(async (updates: Partial<AIConfig>) => {
    try {
      setError(null);
      const currentConfig = await aiConfig.getValue();
      const updatedConfig = { ...currentConfig, ...updates };

      await aiConfig.setValue(updatedConfig);
      setConfig(updatedConfig);

      log.debug('[useAIConfig] AI config updated:', updates);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to update AI config';
      setError(errorMessage);
      log.error('[useAIConfig] Failed to update AI config:', err);
    }
  }, []);

  /**
   * Add a new provider
   */
  const addProvider = useCallback(
    async (provider: Omit<AIProviderConfig, 'id'>) => {
      try {
        setError(null);
        const currentConfig = await aiConfig.getValue();
        const newProvider: AIProviderConfig = {
          ...provider,
          id: `provider-${Date.now()}-${Math.random()
            .toString(36)
            .substr(2, 9)}`,
        };

        const updatedConfig = {
          ...currentConfig,
          providers: [newProvider, ...currentConfig.providers],
        };

        await aiConfig.setValue(updatedConfig);
        setConfig(updatedConfig);

        log.debug('[useAIConfig] Provider added:', newProvider);
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : 'Failed to add provider';
        setError(errorMessage);
        log.error('[useAIConfig] Failed to add provider:', err);
      }
    },
    [],
  );

  /**
   * Update an existing provider
   */
  const updateProvider = useCallback(
    async (id: string, updates: Partial<AIProviderConfig>) => {
      try {
        setError(null);
        const currentConfig = await aiConfig.getValue();
        const updatedProviders = currentConfig.providers.map((provider) =>
          provider.id === id ? { ...provider, ...updates } : provider,
        );

        const updatedConfig = {
          ...currentConfig,
          providers: updatedProviders,
        };

        await aiConfig.setValue(updatedConfig);
        setConfig(updatedConfig);

        log.debug('[useAIConfig] Provider updated:', { id, updates });
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : 'Failed to update provider';
        setError(errorMessage);
        log.error('[useAIConfig] Failed to update provider:', err);
      }
    },
    [],
  );

  /**
   * Delete a provider
   */
  const deleteProvider = useCallback(async (id: string) => {
    try {
      setError(null);
      const currentConfig = await aiConfig.getValue();
      const updatedProviders = currentConfig.providers.filter(
        (provider) => provider.id !== id,
      );

      const updatedConfig = {
        ...currentConfig,
        providers: updatedProviders,
      };

      await aiConfig.setValue(updatedConfig);
      setConfig(updatedConfig);

      log.debug('[useAIConfig] Provider deleted:', id);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to delete provider';
      setError(errorMessage);
      log.error('[useAIConfig] Failed to delete provider:', err);
    }
  }, []);

  /**
   * Get a specific provider by ID
   */
  const getProvider = useCallback(
    (id: string): AIProviderConfig | undefined => {
      return config.providers.find((provider) => provider.id === id);
    },
    [config.providers],
  );

  /**
   * Reorder providers
   */
  const reorderProviders = useCallback(async (newOrder: AIProviderConfig[]) => {
    try {
      setError(null);
      const currentConfig = await aiConfig.getValue();
      const updatedConfig = {
        ...currentConfig,
        providers: newOrder,
      };

      await aiConfig.setValue(updatedConfig);
      setConfig(updatedConfig);

      log.debug('[useAIConfig] Providers reordered');
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to reorder providers';
      setError(errorMessage);
      log.error('[useAIConfig] Failed to reorder providers:', err);
    }
  }, []);

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
    const unsubscribe = aiConfig.watch((newConfig) => {
      log.debug('[useAIConfig] AI config changed:', newConfig);
      setConfig(newConfig);
    });

    return unsubscribe;
  }, []);

  return {
    aiConfig: config,
    loading,
    error,
    updateConfig,
    addProvider,
    updateProvider,
    deleteProvider,
    getProvider,
    reorderProviders,
    refreshConfig,
  };
}

/**
 * Hook for managing a specific provider
 *
 * @param id - The ID of the provider to manage
 * @returns Object with the provider data and update function
 *
 * @example
 * ```tsx
 * const { provider, updateProvider, loading } = useAIProvider('provider-123');
 * ```
 */
export function useAIProvider(id: string) {
  const { aiConfig, loading, updateProvider, getProvider } = useAIConfig();

  const provider = getProvider(id);

  const updateThisProvider = useCallback(
    (updates: Partial<AIProviderConfig>) => {
      return updateProvider(id, updates);
    },
    [id, updateProvider],
  );

  return {
    provider,
    updateProvider: updateThisProvider,
    loading,
  };
}
