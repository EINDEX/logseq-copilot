import type { TemplateItemV1 } from './storage';

/**
 * The default template: the one `defaultId` names, else the first. `defaultId`
 * is `null` until the user chooses, and may name a template that was deleted.
 * Everything that used to take the first template as the default asks here.
 */
export const resolveDefaultTemplate = <T extends { id: string }>(
  templateList: T[],
  defaultId?: string | null,
): T | undefined =>
  (defaultId != null
    ? templateList.find((template) => template.id === defaultId)
    : undefined) ?? templateList[0];

/** The default template is always pinned; the others when the user pinned them. */
export const isPinned = (
  template: Pick<TemplateItemV1, 'id' | 'pinned'>,
  templateList: Pick<TemplateItemV1, 'id'>[],
  defaultId?: string | null,
): boolean =>
  template.id === resolveDefaultTemplate(templateList, defaultId)?.id ||
  template.pinned === true;

/**
 * The templates the picker panel offers: the default first, then the other
 * pinned ones in the order of the list. Nothing is pinned until the user pins
 * a template, so without settings it is the default alone.
 */
export const pickerCandidates = (
  templateList: TemplateItemV1[],
  defaultId?: string | null,
): TemplateItemV1[] => {
  const fallback = resolveDefaultTemplate(templateList, defaultId);
  if (!fallback) return [];
  return [
    fallback,
    ...templateList.filter(
      (template) => template.id !== fallback.id && template.pinned === true,
    ),
  ];
};

/**
 * Whether the clip is saved at once, with no panel: when the candidates are
 * one template or none. Takes the candidate list, so that rules (a page that
 * has its own template) can narrow it before the check.
 */
export const skipPicker = (candidates: readonly unknown[]): boolean =>
  candidates.length < 2;
