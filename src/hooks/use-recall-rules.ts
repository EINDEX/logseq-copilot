import { useState, useEffect, useCallback } from 'react';
import { RecallRuleConfig, recallRulesConfig } from '@/utils/storage';
import { log } from '@/utils';

export interface UseRecallRulesReturn {
  recallRules: RecallRuleConfig[];
  loading: boolean;
  error: string | null;
  addRecallRule: (rule: Omit<RecallRuleConfig, 'id'>) => Promise<void>;
  updateRecallRule: (
    id: string,
    updates: Partial<RecallRuleConfig>,
  ) => Promise<void>;
  deleteRecallRule: (id: string) => Promise<void>;
  toggleRecallRule: (id: string) => Promise<void>;
  getRecallRule: (id: string) => RecallRuleConfig | undefined;
  getMatchingRules: (url: string) => RecallRuleConfig[];
  getActiveRules: () => RecallRuleConfig[];
  refreshRules: () => Promise<void>;
  reorderRules: (newOrder: RecallRuleConfig[]) => Promise<void>;
}

/**
 * Custom hook for managing recall rules using WXT storage
 *
 * @returns {UseRecallRulesReturn} Object containing recall rules, loading state, and utility functions
 *
 * @example
 * ```tsx
 * const { recallRules, loading, addRecallRule, getMatchingRules } = useRecallRules();
 *
 * if (loading) return <div>Loading...</div>;
 *
 * const handleAddRule = () => {
 *   addRecallRule({
 *     name: 'Custom Rule',
 *     enabled: true,
 *     urlPattern: 'example\\.com',
 *     queryProcessing: {
 *       ignoreHashFragments: true,
 *       ignoreQueryParams: false,
 *       excludeKeywords: [],
 *       includeKeywords: [],
 *       ignorePathSegments: []
 *     },
 *     searchScope: {},
 *     resultFiltering: {
 *       prioritizeRecent: false
 *     }
 *   });
 * };
 * ```
 */
export function useRecallRules(): UseRecallRulesReturn {
  const [rules, setRules] = useState<RecallRuleConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /**
   * Load recall rules from storage
   */
  const loadRules = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const rulesData = await recallRulesConfig.getValue();
      setRules(rulesData);
      log.debug('[useRecallRules] Recall rules loaded:', rulesData);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to load recall rules';
      setError(errorMessage);
      log.error('[useRecallRules] Failed to load recall rules:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Add a new recall rule
   */
  const addRecallRule = useCallback(
    async (rule: Omit<RecallRuleConfig, 'id'>) => {
      try {
        setError(null);
        const currentRules = await recallRulesConfig.getValue();
        const newRule: RecallRuleConfig = {
          ...rule,
          id: `rule-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        };

        const updatedRules = [newRule, ...currentRules];
        await recallRulesConfig.setValue(updatedRules);
        setRules(updatedRules);

        log.debug('[useRecallRules] Recall rule added:', newRule);
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : 'Failed to add recall rule';
        setError(errorMessage);
        log.error('[useRecallRules] Failed to add recall rule:', err);
      }
    },
    [],
  );

  /**
   * Update an existing recall rule
   */
  const updateRecallRule = useCallback(
    async (id: string, updates: Partial<RecallRuleConfig>) => {
      try {
        setError(null);
        const currentRules = await recallRulesConfig.getValue();
        const updatedRules = currentRules.map((rule) =>
          rule.id === id ? { ...rule, ...updates } : rule,
        );

        await recallRulesConfig.setValue(updatedRules);
        setRules(updatedRules);

        log.debug('[useRecallRules] Recall rule updated:', { id, updates });
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : 'Failed to update recall rule';
        setError(errorMessage);
        log.error('[useRecallRules] Failed to update recall rule:', err);
      }
    },
    [],
  );

  /**
   * Delete a recall rule
   */
  const deleteRecallRule = useCallback(async (id: string) => {
    try {
      setError(null);
      const currentRules = await recallRulesConfig.getValue();
      const updatedRules = currentRules.filter((rule) => rule.id !== id);

      await recallRulesConfig.setValue(updatedRules);
      setRules(updatedRules);

      log.debug('[useRecallRules] Recall rule deleted:', id);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to delete recall rule';
      setError(errorMessage);
      log.error('[useRecallRules] Failed to delete recall rule:', err);
    }
  }, []);

  /**
   * Toggle a recall rule's enabled state
   */
  const toggleRecallRule = useCallback(
    async (id: string) => {
      const rule = rules.find((r) => r.id === id);
      if (rule) {
        await updateRecallRule(id, { enabled: !rule.enabled });
      }
    },
    [rules, updateRecallRule],
  );

  /**
   * Get a specific recall rule by ID
   */
  const getRecallRule = useCallback(
    (id: string): RecallRuleConfig | undefined => {
      return rules.find((rule) => rule.id === id);
    },
    [rules],
  );

  /**
   * Get rules that match a given URL
   */
  const getMatchingRules = useCallback(
    (url: string): RecallRuleConfig[] => {
      return rules
        .filter((rule) => {
          if (!rule.enabled) return false;

          try {
            const regex = new RegExp(rule.urlPattern, 'i');
            return regex.test(url);
          } catch (error) {
            log.warn(
              `[useRecallRules] Invalid URL pattern for rule ${rule.name}:`,
              error,
            );
            return false;
          }
        })
        .sort((a, b) => {
          // More specific patterns (longer) should have higher priority
          return b.urlPattern.length - a.urlPattern.length;
        });
    },
    [rules],
  );

  /**
   * Get only enabled rules
   */
  const getActiveRules = useCallback(() => {
    return rules.filter((rule) => rule.enabled);
  }, [rules]);

  /**
   * Refresh rules from storage
   */
  const refreshRules = useCallback(async () => {
    await loadRules();
  }, [loadRules]);

  /**
   * Reorder rules (for priority management)
   */
  const reorderRules = useCallback(async (newOrder: RecallRuleConfig[]) => {
    try {
      setError(null);
      await recallRulesConfig.setValue(newOrder);
      setRules(newOrder);
      log.debug('[useRecallRules] Recall rules reordered');
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to reorder recall rules';
      setError(errorMessage);
      log.error('[useRecallRules] Failed to reorder recall rules:', err);
    }
  }, []);

  // Load rules on mount
  useEffect(() => {
    loadRules();
  }, [loadRules]);

  // Set up storage change listeners for real-time updates
  useEffect(() => {
    const unsubscribe = recallRulesConfig.watch((newRules) => {
      log.debug('[useRecallRules] Recall rules changed:', newRules);
      setRules(newRules);
    });

    return unsubscribe;
  }, []);

  return {
    recallRules: rules,
    loading,
    error,
    addRecallRule,
    updateRecallRule,
    deleteRecallRule,
    toggleRecallRule,
    getRecallRule,
    getMatchingRules,
    getActiveRules,
    refreshRules,
    reorderRules,
  };
}

/**
 * Hook for managing a specific recall rule
 *
 * @param id - The ID of the rule to manage
 * @returns Object with the rule data and update function
 *
 * @example
 * ```tsx
 * const { rule, updateRule, loading } = useRecallRule('rule-123');
 * ```
 */
export function useRecallRule(id: string) {
  const { recallRules, loading, updateRecallRule, getRecallRule } =
    useRecallRules();

  const rule = getRecallRule(id);

  const updateRule = useCallback(
    (updates: Partial<RecallRuleConfig>) => {
      return updateRecallRule(id, updates);
    },
    [id, updateRecallRule],
  );

  return {
    rule,
    updateRule,
    loading,
  };
}

/**
 * Hook for getting rules that match the current URL
 *
 * @param url - The URL to match against (optional, defaults to current location)
 * @returns Array of matching rules
 *
 * @example
 * ```tsx
 * const matchingRules = useMatchingRecallRules();
 * const customRules = useMatchingRecallRules('https://example.com/path');
 * ```
 */
export function useMatchingRecallRules(url?: string) {
  const { getMatchingRules, loading } = useRecallRules();
  const [matchingRules, setMatchingRules] = useState<RecallRuleConfig[]>([]);

  useEffect(() => {
    if (!loading) {
      const currentUrl =
        url || (typeof window !== 'undefined' ? window.location.href : '');
      const matches = getMatchingRules(currentUrl);
      setMatchingRules(matches);
    }
  }, [url, getMatchingRules, loading]);

  return { matchingRules, loading };
}
