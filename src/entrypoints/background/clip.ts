import { renderClip } from '@/utils/clip-template';
import { formatLogseqDate } from '@/utils/logseq-format';
import { templates, type TemplateItemV1 } from '@/utils/storage';
import { TASK_TEMPLATE, TASK_TEMPLATE_ID } from '@/utils/default-templates';
import { getLogseqService } from './logseq/tool';
import { throwIfClientError } from './logseq/error';

/** What a clip records: the page, and the clipped text ('' for the page link only). */
export interface ClipSource {
  url?: string;
  title?: string;
  data: string;
  /** The template to clip with; the first one without it. */
  templateId?: string;
}

/**
 * The template for `templateId`. Without one, the first template. The Task
 * template comes back as the built-in when the user deleted it, any other
 * missing id falls back to the first template.
 */
export const resolveTemplate = (
  templateList: TemplateItemV1[],
  templateId?: string,
): TemplateItemV1 | undefined => {
  if (templateId === undefined) return templateList[0];
  const found = templateList.find((template) => template.id === templateId);
  if (found) return found;
  return templateId === TASK_TEMPLATE_ID ? TASK_TEMPLATE : templateList[0];
};

/** Where a clip went: the page, and the one top-level block it wrote. */
export interface ClipResult {
  page: string;
  rootUuid: string;
}

/**
 * Render `source` with its template (the first by default) and append it
 * where the template says: one root block with everything else below it, the
 * template's tag on the root. Throws when nothing was clipped, Logseq failures
 * as LogseqError (a readable message for the user).
 */
export const clipToLogseq = async (source: ClipSource): Promise<ClipResult> => {
  const template = resolveTemplate(
    await templates.getValue(),
    source.templateId,
  );

  if (!template) {
    throw new Error('No clip template found. Add one in the extension settings.');
  }

  const now = new Date();
  const logseqService = await getLogseqService();

  // The client turns failures into error objects: throw them instead of
  // rendering with them.
  const resp = throwIfClientError(await logseqService.client.getUserConfig());

  const blocks = renderClip(template.content, {
    url: source.url,
    title: source.title,
    data: source.data,
    preferredDateFormat: resp['preferredDateFormat'],
    time: now,
  });

  if (blocks.length === 0) {
    throw new Error(
      'The template made no block to clip. Check it in the extension settings.',
    );
  }
  // renderClip returns one root at most.
  const write = async (page: string): Promise<ClipResult> => {
    const { rootUuid } = await logseqService.clipBlocks(page, blocks[0], {
      tag: template.tag,
    });
    return { page, rootUuid };
  };

  const clipNoteLocation = template.clipNoteLocation || 'journal';
  const clipNoteCustomPage = template.clipNoteCustomPage || '';

  const journalPage = () => formatLogseqDate(now, resp['preferredDateFormat']);

  if (clipNoteLocation === 'customPage') {
    return await write(clipNoteCustomPage);
  } else if (clipNoteLocation === 'currentPage') {
    // Logseq has no current page on its home and All Journals views: clip to
    // today's journal there.
    const currentPage = throwIfClientError(
      await logseqService.client.getCurrentPage(),
    )?.name;
    return await write(currentPage || journalPage());
  }
  return await write(journalPage());
};

/**
 * The clip the background can make on its own when the content script of the
 * tab cannot take a clip command (the browser's PDF viewer, other pages
 * extensions cannot run in): only a context menu click on a selection brings
 * the selected text along. Undefined when there is nothing to clip without
 * the page.
 */
export const backgroundClipFallback = (
  info: { selectionText?: string; pageUrl?: string },
  tab?: { url?: string; title?: string },
  templateId?: string,
): ClipSource | undefined => {
  if (!info.selectionText?.trim()) return undefined;
  return {
    url: info.pageUrl || tab?.url,
    title: tab?.title,
    data: info.selectionText,
    ...(templateId && { templateId }),
  };
};
