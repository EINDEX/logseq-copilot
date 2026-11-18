import { isTreeTemplate, renderClip } from '@/utils/clip-template';
import { runOnPage } from './page-queue';
import { formatLogseqDate } from '@/utils/logseq-format';
import { imageMarkdown } from '@/utils/utils';
import {
  defaultTemplateIdItem,
  templates,
  type TemplateItemV1,
} from '@/utils/storage';
import { resolveDefaultTemplate } from '@/utils/template-choice';
import type { ClipResult } from '@/types/clip';
import { TASK_TEMPLATE, TASK_TEMPLATE_ID } from '@/utils/default-templates';
import { getLogseqService } from './logseq/tool';
import { throwIfClientError } from './logseq/error';

/** What a clip records: the page, and the clipped text ('' for the page link only). */
export interface ClipSource {
  url?: string;
  title?: string;
  data: string;
  /** The template to clip with; the default one without it. */
  templateId?: string;
  /** What the user typed in the picker panel: `{{note}}` of the template. */
  note?: string;
}

/**
 * The template for `templateId`. Without one, the default template (see
 * `resolveDefaultTemplate`). The Task template comes back as the built-in when
 * the user deleted it, any other missing id falls back to the default.
 */
export const resolveTemplate = (
  templateList: TemplateItemV1[],
  templateId?: string,
  defaultId?: string | null,
): TemplateItemV1 | undefined => {
  if (templateId === undefined) {
    return resolveDefaultTemplate(templateList, defaultId);
  }
  const found = templateList.find((template) => template.id === templateId);
  if (found) return found;
  return templateId === TASK_TEMPLATE_ID
    ? TASK_TEMPLATE
    : resolveDefaultTemplate(templateList, defaultId);
};

/**
 * Render `source` with its template (the default one without a choice) and append it
 * where the template says: one root block with everything else below it, the
 * template's tag on the root. Throws when nothing was clipped, Logseq failures
 * as LogseqError (a readable message for the user).
 */
export const clipToLogseq = async (source: ClipSource): Promise<ClipResult> => {
  const template = resolveTemplate(
    await templates.getValue(),
    source.templateId,
    await defaultTemplateIdItem.getValue(),
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
    note: source.note,
  });

  if (blocks.length === 0) {
    throw new Error(
      'The template made no block to clip. Check it in the extension settings.',
    );
  }
  // Only an outline template has a header (the root) apart from the content
  // (its children), so only it joins an earlier clip of the same page. A flat
  // template writes a new block every time.
  const group =
    source.url && isTreeTemplate(template.content) ? { url: source.url } : undefined;

  // renderClip returns one root at most. Writes to a page go one at a time.
  const write = (page: string): Promise<ClipResult> =>
    runOnPage(page, async () => {
      // Read before writing: a clip that is in Logseq must not fail afterwards.
      const graph = await logseqService.getGraph();
      const { rootUuid, added, noteUuid, noteText } = await logseqService.clipBlocks(
        page,
        blocks[0],
        { tag: template.tag, group },
      );
      return {
        page,
        graph,
        templateId: template.id,
        rootUuid,
        added,
        ...(noteUuid !== undefined && {
          noteBlockUuid: noteUuid,
          noteBlockText: noteText,
        }),
      };
    });

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
 * the selected text along, and a click on an image its URL. Undefined when
 * there is nothing to clip without the page.
 */
export const backgroundClipFallback = (
  info: { selectionText?: string; pageUrl?: string; srcUrl?: string },
  tab?: { url?: string; title?: string },
  templateId?: string,
): ClipSource | undefined => {
  const data = info.srcUrl
    ? imageMarkdown('', info.srcUrl)
    : info.selectionText?.trim() && info.selectionText;
  if (!data) return undefined;
  return {
    url: info.pageUrl || tab?.url,
    title: tab?.title,
    data,
    ...(templateId && { templateId }),
  };
};
