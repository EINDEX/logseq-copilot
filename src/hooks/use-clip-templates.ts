import { useEffect, useState } from 'react';
import { defaultTemplateIdItem, templates, type TemplateItemV1 } from '@/utils/storage';
import { resolveDefaultTemplate } from '@/utils/template-choice';
import log from '@/utils/logger';

/** What the clip buttons need of a template. */
export interface ClipTemplateOption {
  id: string;
  name: string;
}

/** The templates with the default one first, the others in the order of the settings. */
export const defaultFirst = (
  list: TemplateItemV1[],
  defaultId: string | null,
): ClipTemplateOption[] => {
  const fallback = resolveDefaultTemplate(list, defaultId);
  return [
    ...(fallback ? [fallback] : []),
    ...list.filter((template) => template !== fallback),
  ].map(({ id, name }) => ({ id, name }));
};

/** The clip templates, the default first (see `resolveDefaultTemplate`). */
export function useClipTemplates(): ClipTemplateOption[] {
  const [list, setList] = useState<ClipTemplateOption[]>([]);

  useEffect(() => {
    let current = true;
    let all: TemplateItemV1[] = [];
    let defaultId: string | null = null;
    const show = () => {
      if (current) setList(defaultFirst(all, defaultId));
    };
    const fail = (error: unknown) =>
      log.debug('[useClipTemplates] Failed to read the templates', error);
    templates.getValue().then((value) => {
      all = value ?? [];
      show();
    }, fail);
    defaultTemplateIdItem.getValue().then((value) => {
      defaultId = value;
      show();
    }, fail);
    const stopTemplates = templates.watch((value) => {
      all = value ?? [];
      show();
    });
    const stopDefault = defaultTemplateIdItem.watch((value) => {
      defaultId = value;
      show();
    });
    return () => {
      current = false;
      stopTemplates();
      stopDefault();
    };
  }, []);

  return list;
}
