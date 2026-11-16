import { highlightToAnnotation, type LogseqLink } from '@/types/annotation';
import { setHighlightLink } from '@/utils/highlight-service';
import { highlights } from '@/utils/storage';
import { getLogseqService } from './logseq/tool';
import { syncAnnotationNote } from './logseq/note-sync';
import { runInOrder } from './page-queue';

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
 * was nothing to sync (no such highlight, or it has no link to a clip). Rejects
 * with a readable message when Logseq was not written; the local note stays.
 */
export const syncHighlightNote = (id: string): Promise<boolean> =>
  runInOrder(`highlight:${id}`, async () => {
    const highlight = (await highlights.getValue()).find((h) => h.id === id);
    if (!highlight?.logseq) return false;

    const annotation = highlightToAnnotation(highlight);
    const link = await syncAnnotationNote(annotation, await getLogseqService());
    if (link && !sameLink(link, highlight.logseq)) {
      await setHighlightLink(id, link);
    }
    return true;
  });
