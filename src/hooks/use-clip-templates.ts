import { useEffect, useState } from 'react';
import { defaultTemplateIdItem, templates, type TemplateItemV1 } from '@/utils/storage';
import { resolveClipTemplate } from '@/utils/template-choice';
import log from '@/utils/logger';

/** What the clip buttons need of a template. */
export interface ClipTemplateOption {
  id: string;
  name: string;
  /** Put first by a rule of the page (not the default): the main buttons name it. */
  ruled?: true;
}

/**
 * The templates for a page: the one the clip buttons use first (the rule
 * winner, else the default), the others in the order of the settings.
 */
export const defaultFirst = (
  list: TemplateItemV1[],
  defaultId: string | null,
  url?: string | null,
): ClipTemplateOption[] => {
  const { template: first, ruled } = resolveClipTemplate(list, defaultId, url);
  return [
    ...(first ? [first] : []),
    ...list.filter((template) => template !== first),
  ].map(({ id, name }, index) => ({
    id,
    name,
    ...(index === 0 && ruled && { ruled: true as const }),
  }));
};

/**
 * What the main clip buttons name: the rule winner of the page, nothing
 * (the background's default) when no rule matched.
 */
export const ruledTemplateId = (templates: ClipTemplateOption[]): string | undefined =>
  templates[0]?.ruled ? templates[0].id : undefined;

/** The clip templates for `url`, the first the one the main buttons use (see `defaultFirst`). */
export function useClipTemplates(url?: string | null): ClipTemplateOption[] {
  const [list, setList] = useState<ClipTemplateOption[]>([]);

  useEffect(() => {
    let current = true;
    let all: TemplateItemV1[] = [];
    let defaultId: string | null = null;
    const show = () => {
      if (current) setList(defaultFirst(all, defaultId, url));
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
  }, [url]);

  return list;
}
