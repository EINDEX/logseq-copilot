import type { TemplateItemV1 } from './storage';

/** The content of the built-in Clip template. */
export const DEFAULT_TEMPLATE_CONTENT = `#[[Clip]] [{{title}}]({{url}})
{{content}}`;

export const TASK_TEMPLATE_CONTENT = `TODO [{{title}}]({{url}})
{{content}}`;

export const CLIP_TEMPLATE_ID = 'default';
export const TASK_TEMPLATE_ID = 'task';

/** The first template, and what a clip without a template choice uses. */
export const CLIP_TEMPLATE: TemplateItemV1 = {
  id: CLIP_TEMPLATE_ID,
  name: 'Clip',
  content: DEFAULT_TEMPLATE_CONTENT,
  clipNoteLocation: 'journal',
  clipNoteCustomPage: '',
};

/** Saves the page (or the selection) as a task. */
export const TASK_TEMPLATE: TemplateItemV1 = {
  id: TASK_TEMPLATE_ID,
  name: 'Task',
  content: TASK_TEMPLATE_CONTENT,
  clipNoteLocation: 'journal',
  clipNoteCustomPage: '',
};

export const BUILT_IN_TEMPLATES: TemplateItemV1[] = [
  CLIP_TEMPLATE,
  TASK_TEMPLATE,
];
