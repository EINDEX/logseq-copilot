import { highlightToAnnotation, type LogseqLink } from '@/types/annotation';
import { clearHighlightLinks, setHighlightLink } from '@/utils/highlight-service';
import { highlights } from '@/utils/storage';
import { getLogseqService } from './logseq/tool';
import { NodeGoneError, syncAnnotationNote } from './logseq/note-sync';
import { runInOrder } from './page-queue';
import log from '@/utils/logger';

const sameLink = (a: LogseqLink, b: LogseqLink) =>
  a.graph === b.graph &&
  a.nodeUuid === b.nodeUuid &&
  a.noteUuid === b.noteUuid &&
  a.syncedText === b.syncedText;

/**
 * Makes the comment of the stored highlight `id` match Logseq, and keeps the
 * link to what was written (see note-sync.ts). Syncs one highlight at a time:
 * a second call waits for the first and then reads the highlight again, so
 * quick edits do not race and the last note wins. Resolves false when there
 * was nothing to sync (no such highlight, or it has no link to a clip, or the
 * clip is gone from Logseq: the link is dropped then, see checkHighlightLinks).
 * Rejects with a readable message when Logseq was not written; the local note
 * stays.
 */
export const syncHighlightNote = (id: string): Promise<boolean> =>
  runInOrder(`highlight:${id}`, async () => {
    const highlight = (await highlights.getValue()).find((h) => h.id === id);
    if (!highlight?.logseq) return false;

    const annotation = highlightToAnnotation(highlight);
    let link: LogseqLink | undefined;
    try {
      link = await syncAnnotationNote(annotation, await getLogseqService());
    } catch (error) {
      if (!(error instanceof NodeGoneError)) throw error;
      await clearHighlightLinks([[id, highlight.logseq.nodeUuid]]);
      return false;
    }
    if (link && !sameLink(link, highlight.logseq)) {
      await setHighlightLink(id, link);
    }
    return true;
  });

/**
 * Drops the link of the stored highlights `ids` whose clip node was deleted in
 * Logseq: the highlight and its note stay, they are just no longer synced.
 * Nothing is ever written to Logseq. One read per node, whatever the number of
 * highlights. A highlight is left as it is when its graph is not the open one,
 * or when Logseq cannot be asked (not running, an error): nothing is known
 * then. Resolves with the ids that lost their link.
 */
export const checkHighlightLinks = async (ids: string[]): Promise<string[]> => {
  const wanted = new Set(ids);
  const linked = (await highlights.getValue()).filter(
    (h) => wanted.has(h.id) && h.logseq,
  );
  if (linked.length === 0) return [];

  try {
    const service = await getLogseqService();
    const openGraph = await service.getGraph();
    const nodes = new Set(
      linked.filter((h) => h.logseq!.graph === openGraph).map((h) => h.logseq!.nodeUuid),
    );
    const goneNodes = new Set<string>();
    await Promise.all(
      [...nodes].map(async (node) => {
        try {
          if ((await service.readBlock(node)) === null) goneNodes.add(node);
        } catch (error) {
          log.debug('[highlight-links] could not read a clip node:', error);
        }
      }),
    );
    if (goneNodes.size === 0) return [];
    return await clearHighlightLinks(
      linked
        .filter((h) => h.logseq!.graph === openGraph && goneNodes.has(h.logseq!.nodeUuid))
        .map((h) => [h.id, h.logseq!.nodeUuid] as const),
    );
  } catch (error) {
    log.debug('[highlight-links] Logseq could not be asked:', error);
    return [];
  }
};
