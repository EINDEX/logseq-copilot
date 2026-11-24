import { useState, useEffect, useCallback, useMemo } from 'react';
import { RecallRuleConfig, recallRulesConfig } from '@/utils/storage';
import { log } from '@/utils';
import {
  isBuiltinRuleId,
  mergeBuiltinRules,
  rulesToStore,
} from '@/utils/recall-builtin-rules';
import { t } from '@/i18n/core';

export interface UseRecallRulesReturn {
  /** The effective rules: stored ones, then the built-ins that are not stored. */
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
  /** Whether the rule is one the extension ships (`builtin:` ids). */
  isBuiltin: (id: string) => boolean;
  /** Whether the user changed a built-in rule (a copy of it is stored). */
  isOverridden: (id: string) => boolean;
  /** Drop the user's changes to a built-in rule: its shipped version applies again. */
  resetToBuiltin: (id: string) => Promise<void>;
}

/**
 * Custom hook for managing recall rules using WXT storage
 *
 * Built-in rules (src/utils/recall-builtin-rules.ts) are part of the list
 * without being stored. Saving an edited built-in (updateRecallRule,
 * toggleRecallRule) stores an override with the same id; resetToBuiltin (or
 * deleteRecallRule, which means the same for a built-in) removes it. An
 * override equal to the shipped rule is not stored.
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
  // What is stored; the built-ins are merged in at read time.
  const [stored, setStored] = useState<RecallRuleConfig[]>([]);
  const rules = useMemo(() => mergeBuiltinRules(stored), [stored]);
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
      setStored(rulesData);
      log.debug('[useRecallRules] Recall rules loaded:', rulesData);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : t('options.errors.loadRecallRules');
      setError(errorMessage);
      log.error('[useRecallRules] Failed to load recall rules:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  /** Store a list of effective rules (unchanged built-ins stay code). */
  const saveRules = useCallback(async (effective: RecallRuleConfig[]) => {
    const toStore = rulesToStore(effective);
    await recallRulesConfig.setValue(toStore);
    setStored(toStore);
  }, []);

  /**
   * Add a new recall rule
   */
  const addRecallRule = useCallback(
    async (rule: Omit<RecallRuleConfig, 'id'>) => {
      try {
        setError(null);
        const currentRules = mergeBuiltinRules(await recallRulesConfig.getValue());
        const newRule: RecallRuleConfig = {
          ...rule,
          id: `rule-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        };

        await saveRules([newRule, ...currentRules]);

        log.debug('[useRecallRules] Recall rule added:', newRule);
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : t('options.errors.addRecallRule');
        setError(errorMessage);
        log.error('[useRecallRules] Failed to add recall rule:', err);
      }
    },
    [saveRules],
  );

  /**
   * Update an existing recall rule
   */
  const updateRecallRule = useCallback(
    async (id: string, updates: Partial<RecallRuleConfig>) => {
      try {
        setError(null);
        const currentRules = mergeBuiltinRules(await recallRulesConfig.getValue());
        await saveRules(
          currentRules.map((rule) =>
            rule.id === id ? { ...rule, ...updates } : rule,
          ),
        );

        log.debug('[useRecallRules] Recall rule updated:', { id, updates });
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : t('options.errors.updateRecallRule');
        setError(errorMessage);
        log.error('[useRecallRules] Failed to update recall rule:', err);
      }
    },
    [saveRules],
  );

  /**
   * Delete a recall rule. A built-in cannot be deleted: this resets it.
   */
  const deleteRecallRule = useCallback(async (id: string) => {
    try {
      setError(null);
      const currentRules = await recallRulesConfig.getValue();
      const updatedRules = currentRules.filter((rule) => rule.id !== id);

      await recallRulesConfig.setValue(updatedRules);
      setStored(updatedRules);

      log.debug('[useRecallRules] Recall rule deleted:', id);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : t('options.errors.deleteRecallRule');
      setError(errorMessage);
      log.error('[useRecallRules] Failed to delete recall rule:', err);
    }
  }, []);

  /**
   * Drop the user's changes to a built-in rule
   */
  const resetToBuiltin = deleteRecallRule;

  const isBuiltin = useCallback((id: string) => isBuiltinRuleId(id), []);

  const isOverridden = useCallback(
    (id: string) => isBuiltinRuleId(id) && stored.some((rule) => rule.id === id),
    [stored],
  );

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
      await saveRules(newOrder);
      log.debug('[useRecallRules] Recall rules reordered');
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : t('options.errors.reorderRecallRules');
      setError(errorMessage);
      log.error('[useRecallRules] Failed to reorder recall rules:', err);
    }
  }, [saveRules]);

  // Load rules on mount
  useEffect(() => {
    loadRules();
  }, [loadRules]);

  // Set up storage change listeners for real-time updates
  useEffect(() => {
    const unsubscribe = recallRulesConfig.watch((newRules) => {
      log.debug('[useRecallRules] Recall rules changed:', newRules);
      setStored(newRules);
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
    isBuiltin,
    isOverridden,
    resetToBuiltin,
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
