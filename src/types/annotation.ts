import type { ClipResult } from './clip';
import type { HighlightData, SerializableRange } from './highlight';

/**
 * Where an annotation points in the page. Sync code never looks inside an
 * anchor: it only needs the annotation's note and its Logseq link. A video
 * note anchored to a timestamp will be one more `kind` here
 * (`{ kind: 'media-time', ... }`); nothing in the sync has to change for it.
 */
export type AnnotationAnchor = { kind: 'text-range'; range: SerializableRange };

/** Where an annotation's clip is in Logseq, and what we wrote there for its note. */
export interface LogseqLink {
  /** The graph the clip went to. Nothing is written to any other graph. */
  graph: string;
  /** The node this clip added: a comment becomes its last child. */
  nodeUuid: string;
  /** The block that holds the note, when we wrote it. Absent when we did not. */
  noteUuid?: string;
  /** The text we wrote to `noteUuid`: the block is ours to change while it still has it. */
  syncedText?: string;
}

/** A note on a page, anchored somewhere in it, that can be synced to Logseq. */
export interface Annotation {
  id: string;
  url: string;
  title: string;
  anchor: AnnotationAnchor;
  /** The note as the user wrote it. Blank or absent: no note. */
  note?: string;
  /** Absent when the annotation has no clip in Logseq: it is never synced. */
  logseq?: LogseqLink;
}

/** A stored highlight as an annotation. */
export const highlightToAnnotation = (highlight: HighlightData): Annotation => ({
  id: highlight.id,
  url: highlight.url,
  title: highlight.title,
  anchor: { kind: 'text-range', range: highlight.range },
  ...(highlight.note !== undefined && { note: highlight.note }),
  ...(highlight.logseq && { logseq: highlight.logseq }),
});

/**
 * The link of a highlight to the clip that made it. Undefined when the clip
 * added no node of its own (a grouped clip that had nothing to add): there is
 * nothing to hang a comment on.
 */
export const linkFromClip = (clip: ClipResult): LogseqLink | undefined => {
  if (!clip.added || !clip.graph) return undefined;
  return {
    graph: clip.graph,
    nodeUuid: clip.rootUuid,
    ...(clip.noteBlockUuid !== undefined &&
      clip.noteBlockText !== undefined && {
        noteUuid: clip.noteBlockUuid,
        syncedText: clip.noteBlockText,
      }),
  };
};
