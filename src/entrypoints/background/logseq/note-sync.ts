import type { Annotation, LogseqLink } from '@/types/annotation';
import { neutraliseNote } from '@/utils/clip-template';
import type { NoteBlockApi } from './note-blocks';
import { t } from '@/i18n/core';

/**
 * Syncs the note of an annotation to the clip it was made with in Logseq.
 * It does not know what the annotation points at (`anchor`): a text range
 * today, a media time later.
 *
 * The comment is one child block, the last one, of the node the clip added.
 * The block is ours only while it still has the text we wrote
 * (`logseq.syncedText`): a block the user changed in Logseq is never
 * overwritten or removed, and one with blocks below it is never removed. A
 * node that is gone is never recreated: it is a NodeGoneError (the link is
 * dropped). A comment block that is gone while its node is there counts as no
 * comment block: the link forgets it and a comment is written as a new block
 * (a blank comment writes nothing). That is what the user editing the comment
 * asked for; a block they changed is still never touched.
 */

/** A sync that did not write what the user asked for: the message is for them. */
export class NoteSyncError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NoteSyncError';
  }
}

/**
 * The node the clip added is gone from Logseq: the highlight no longer has a
 * clip to sync to. Whoever syncs drops the link, and the user is told nothing.
 */
export class NodeGoneError extends NoteSyncError {
  constructor() {
    super(t('background.sync.clipGone'));
    this.name = 'NodeGoneError';
  }
}

/** The same text, whatever the whitespace around it. */
const sameText = (a: string, b: string) => a.trim() === b.trim();

/** The link without the note block: nothing is tracked any more. */
const untracked = ({ graph, nodeUuid }: LogseqLink): LogseqLink => ({
  graph,
  nodeUuid,
});

const tracked = (link: LogseqLink, noteUuid: string, syncedText: string): LogseqLink => ({
  ...link,
  noteUuid,
  syncedText,
});

/**
 * Makes Logseq match the note of `annotation`. Resolves with the link to keep
 * for it (the one it has when nothing changed), or undefined when it has no
 * link: it is not synced. Rejects with a NoteSyncError, or the error of
 * Logseq, when it could not write; nothing was written then.
 */
export const syncAnnotationNote = async (
  annotation: Annotation,
  api: NoteBlockApi,
): Promise<LogseqLink | undefined> => {
  const link = annotation.logseq;
  if (!link) return undefined;
  // The comment keeps the user's Logseq syntax; only what would break the
  // block tree is neutralised, as for the note of a clip.
  const comment = neutraliseNote(annotation.note ?? '');

  const graph = await api.getGraph();
  if (graph !== link.graph) {
    throw new NoteSyncError(
      t('background.sync.graphMismatch', { clipped: link.graph, open: graph }),
    );
  }

  /** A new comment block under the node, which must still be there. */
  const addComment = async (): Promise<LogseqLink> => {
    if ((await api.readBlock(link.nodeUuid)) === null) {
      throw new NodeGoneError();
    }
    const { uuid } = await api.insertChildBlock(link.nodeUuid, comment);
    return tracked(link, uuid, comment);
  };

  if (link.noteUuid === undefined || link.syncedText === undefined) {
    return comment === '' ? link : await addComment();
  }

  const block = await api.readBlock(link.noteUuid);
  if (block === null) {
    // The comment block goes with its node: tell which of the two is gone.
    if ((await api.readBlock(link.nodeUuid)) === null) throw new NodeGoneError();
    return comment === '' ? untracked(link) : await addComment();
  }
  const written = link.syncedText;
  const unchanged = block.texts.some((text) => sameText(text, written));

  if (comment === '') {
    // A block with blocks below it is not removed: they are not ours (the user's,
    // or the clip itself when the note is the node of a grouped clip).
    if (unchanged && !block.hasChildren) await api.removeBlock(link.noteUuid);
    return untracked(link);
  }
  if (!unchanged) return await addComment();
  if (sameText(comment, written)) return link;
  await api.updateBlockText(link.noteUuid, comment);
  return tracked(link, link.noteUuid, comment);
};
