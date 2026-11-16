import type { TemplateItemV1 } from './storage';
import { matchTemplateRules } from './template-rules';

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
 * The templates the picker panel offers: the ones whose rules match the page
 * (the most specific first, see `matchTemplateRules`), then the default, then
 * the other pinned ones in the order of the list; none twice. A template that
 * matches is offered whether it is pinned or not. Nothing is pinned or ruled
 * until the user sets it, so without settings it is the default alone.
 */
export const pickerCandidates = (
  templateList: TemplateItemV1[],
  defaultId?: string | null,
  url?: string | URL | null,
): TemplateItemV1[] => {
  const matched = matchTemplateRules(url, templateList);
  const fallback = resolveDefaultTemplate(templateList, defaultId);
  const rest = fallback
    ? [fallback, ...templateList.filter((t) => t.id !== fallback.id && t.pinned === true)]
    : [];
  return [...matched, ...rest.filter((t) => !matched.some((m) => m.id === t.id))];
};

/**
 * The template the clip buttons that name none use for the page: the rule
 * winner, else the default. `ruled` tells which of the two it is.
 */
export const resolveClipTemplate = (
  templateList: TemplateItemV1[],
  defaultId?: string | null,
  url?: string | URL | null,
): { template: TemplateItemV1 | undefined; ruled: boolean } => {
  const [winner] = matchTemplateRules(url, templateList);
  return winner
    ? { template: winner, ruled: true }
    : { template: resolveDefaultTemplate(templateList, defaultId), ruled: false };
};

/**
 * Whether the clip is saved at once, with no panel: when the candidates (rule
 * matches, default and pinned, each once) are one template or none. A panel
 * with one row offers no choice. That one is the default, so the clip needs
 * to name no template.
 */
export const skipPicker = (candidates: readonly unknown[]): boolean =>
  candidates.length < 2;
