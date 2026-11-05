import { blockRending, formatLogseqDate } from '@/utils/utils';
import { templates } from '@/utils/storage';
import { getLogseqService } from './logseq/tool';
import { throwIfClientError } from './logseq/error';

/** What a clip records: the page, and the clipped text ('' for the page link only). */
export interface ClipSource {
  url?: string;
  title?: string;
  data: string;
}

/**
 * Render `source` with the default template and append it where the template
 * says. Throws when nothing was clipped, Logseq failures as LogseqError (a
 * readable message for the user).
 */
export const clipToLogseq = async (source: ClipSource) => {
  // Get the first template (default template) from the templates list
  const templateList = await templates.getValue();
  const defaultTemplate = templateList[0];

  if (!defaultTemplate) {
    throw new Error('No clip template found. Add one in the extension settings.');
  }

  const now = new Date();
  const logseqService = await getLogseqService();

  // The client turns failures into error objects: throw them instead of
  // rendering with them.
  const resp = throwIfClientError(await logseqService.client.getUserConfig());

  const block = blockRending({
    url: source.url,
    title: source.title,
    data: source.data,
    clipNoteTemplate: defaultTemplate.content,
    preferredDateFormat: resp['preferredDateFormat'],
    time: now,
  });

  const clipNoteLocation = defaultTemplate.clipNoteLocation || 'journal';
  const clipNoteCustomPage = defaultTemplate.clipNoteCustomPage || '';

  if (clipNoteLocation === 'customPage') {
    await logseqService.client.appendBlock(clipNoteCustomPage, block);
  } else if (clipNoteLocation === 'currentPage') {
    const currentPage = throwIfClientError(
      await logseqService.client.getCurrentPage(),
    )?.name;
    if (!currentPage) throw new Error('No page is open in Logseq to clip to.');
    await logseqService.client.appendBlock(currentPage, block);
  } else {
    const journalPage = formatLogseqDate(now, resp['preferredDateFormat']);
    await logseqService.client.appendBlock(journalPage, block);
  }
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
): ClipSource | undefined => {
  if (!info.selectionText?.trim()) return undefined;
  return {
    url: info.pageUrl || tab?.url,
    title: tab?.title,
    data: info.selectionText,
  };
};
