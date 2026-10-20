import { useState, useEffect, useCallback } from 'react';
import { templates, TemplateItemV1 } from '@/utils/storage';
import { log } from '@/utils';

export interface UseTemplatesReturn {
  templates: TemplateItemV1[];
  loading: boolean;
  error: string | null;
  addTemplate: (template: Omit<TemplateItemV1, 'id'>) => Promise<void>;
  updateTemplate: (
    id: string,
    updates: Partial<TemplateItemV1>,
  ) => Promise<void>;
  deleteTemplate: (id: string) => Promise<void>;
  getTemplate: (id: string) => TemplateItemV1 | undefined;
  reorderTemplates: (newOrder: TemplateItemV1[]) => Promise<void>;
  refreshTemplates: () => Promise<void>;
}

/**
 * Custom hook for managing templates using WXT storage
 *
 * @returns {UseTemplatesReturn} Object containing templates, loading state, and utility functions
 *
 * @example
 * ```tsx
 * const { templates, loading, addTemplate, updateTemplate } = useTemplates();
 *
 * if (loading) return <div>Loading...</div>;
 *
 * const handleAddTemplate = () => {
 *   addTemplate({
 *     name: 'New Template',
 *     content: 'Template content',
 *     clipNoteLocation: 'journal',
 *     clipNoteCustomPage: ''
 *   });
 * };
 * ```
 */
export function useTemplates(): UseTemplatesReturn {
  const [templateList, setTemplateList] = useState<TemplateItemV1[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /**
   * Load templates from storage
   */
  const loadTemplates = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const templateData = await templates.getValue();
      setTemplateList(templateData);
      log.debug('[useTemplates] Templates loaded:', templateData);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to load templates';
      setError(errorMessage);
      log.error('[useTemplates] Failed to load templates:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Add a new template
   */
  const addTemplate = useCallback(
    async (template: Omit<TemplateItemV1, 'id'>) => {
      try {
        setError(null);
        const currentTemplates = await templates.getValue();
        const newTemplate: TemplateItemV1 = {
          ...template,
          id: `template-${Date.now()}-${Math.random()
            .toString(36)
            .substr(2, 9)}`,
        };

        const updatedTemplates = [newTemplate, ...currentTemplates];
        await templates.setValue(updatedTemplates);
        setTemplateList(updatedTemplates);

        log.debug('[useTemplates] Template added:', newTemplate);
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : 'Failed to add template';
        setError(errorMessage);
        log.error('[useTemplates] Failed to add template:', err);
      }
    },
    [],
  );

  /**
   * Update an existing template
   */
  const updateTemplate = useCallback(
    async (id: string, updates: Partial<TemplateItemV1>) => {
      try {
        setError(null);
        const currentTemplates = await templates.getValue();
        const updatedTemplates = currentTemplates.map((template) =>
          template.id === id ? { ...template, ...updates } : template,
        );

        await templates.setValue(updatedTemplates);
        setTemplateList(updatedTemplates);

        log.debug('[useTemplates] Template updated:', { id, updates });
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : 'Failed to update template';
        setError(errorMessage);
        log.error('[useTemplates] Failed to update template:', err);
      }
    },
    [],
  );

  /**
   * Delete a template
   */
  const deleteTemplate = useCallback(async (id: string) => {
    try {
      setError(null);
      const currentTemplates = await templates.getValue();
      const updatedTemplates = currentTemplates.filter(
        (template) => template.id !== id,
      );

      await templates.setValue(updatedTemplates);
      setTemplateList(updatedTemplates);

      log.debug('[useTemplates] Template deleted:', id);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to delete template';
      setError(errorMessage);
      log.error('[useTemplates] Failed to delete template:', err);
    }
  }, []);

  /**
   * Get a specific template by ID
   */
  const getTemplate = useCallback(
    (id: string): TemplateItemV1 | undefined => {
      return templateList.find((template) => template.id === id);
    },
    [templateList],
  );

  /**
   * Reorder templates
   */
  const reorderTemplates = useCallback(async (newOrder: TemplateItemV1[]) => {
    try {
      setError(null);
      await templates.setValue(newOrder);
      setTemplateList(newOrder);

      log.debug('[useTemplates] Templates reordered');
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to reorder templates';
      setError(errorMessage);
      log.error('[useTemplates] Failed to reorder templates:', err);
    }
  }, []);

  /**
   * Refresh templates from storage
   */
  const refreshTemplates = useCallback(async () => {
    await loadTemplates();
  }, [loadTemplates]);

  // Load templates on mount
  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  // Set up storage change listeners for real-time updates
  useEffect(() => {
    const unsubscribe = templates.watch((newTemplates) => {
      log.debug('[useTemplates] Templates changed:', newTemplates);
      setTemplateList(newTemplates);
    });

    return unsubscribe;
  }, []);

  return {
    templates: templateList,
    loading,
    error,
    addTemplate,
    updateTemplate,
    deleteTemplate,
    getTemplate,
    reorderTemplates,
    refreshTemplates,
  };
}

/**
 * Hook for managing a specific template
 *
 * @param id - The ID of the template to manage
 * @returns Object with the template data and update function
 *
 * @example
 * ```tsx
 * const { template, updateTemplate, loading } = useTemplate('template-123');
 * ```
 */
export function useTemplate(id: string) {
  const { templates, loading, updateTemplate, getTemplate } = useTemplates();

  const template = getTemplate(id);

  const updateThisTemplate = useCallback(
    (updates: Partial<TemplateItemV1>) => {
      return updateTemplate(id, updates);
    },
    [id, updateTemplate],
  );

  return {
    template,
    updateTemplate: updateThisTemplate,
    loading,
  };
}
