import { useEffect, useRef, useState } from 'react';
import type { HighlightData } from '@/types/highlight';
import {
  deleteHighlight as deleteStoredHighlight,
  getHighlightsForUrl,
  updateHighlightNote,
  watchHighlights,
} from '@/utils/highlight-service';
import { sendMessage } from '@/types/messaging';
import { clipErrorMessage } from '@/utils/clip-feedback';

export interface PageHighlights {
  /** The highlights of the page, newest first; null while they are being read. */
  highlights: HighlightData[] | null;
  /**
   * Highlights whose clip was found deleted in Logseq while this page's
   * highlights were shown: they are no longer linked, and the list says so.
   */
  removedFromLogseq: ReadonlySet<string>;
  /** A message for the user about the last action, or null. */
  notice: string | null;
  setNotice: (notice: string | null) => void;
  /** Deletes a highlight; the list follows from storage. */
  deleteHighlight: (id: string) => Promise<void>;
  /** Saves a note. Rejects when it could not be saved, so the editor stays open. */
  updateNote: (id: string, note: string) => Promise<void>;
}

/**
 * The highlights saved for exactly `url`, kept up to date with storage
 * whichever extension context changes them, and the actions of the highlights
 * sidebar on them. Used by the browser sidebar (an extension page) and by the
 * one drawn on the page, so it must not import anything from the content
 * script entrypoint. A null `url` has no highlights.
 */
export function usePageHighlights(url: string | null): PageHighlights {
  const [highlights, setHighlights] = useState<HighlightData[] | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [removedFromLogseq, setRemoved] = useState<ReadonlySet<string>>(new Set());
  // The links already checked: a check is one round for the page, not one per render.
  const checked = useRef('');

  useEffect(() => {
    setHighlights(null);
    setNotice(null);
    setRemoved(new Set());
    checked.current = '';
    if (!url) return;

    let disposed = false;
    let latestLoad = 0;
    const load = async () => {
      const thisLoad = ++latestLoad;
      const pageHighlights = await getHighlightsForUrl(url);
      if (!disposed && thisLoad === latestLoad) setHighlights(pageHighlights);
    };

    // Watching comes first, so a change while loading is not missed.
    const unwatch = watchHighlights(() => void load());
    void load();

    return () => {
      disposed = true;
      unwatch();
    };
  }, [url]);

  useEffect(() => {
    if (!highlights) return;
    const linked = highlights.filter((h) => h.logseq);
    const key = linked.map((h) => `${h.id}:${h.logseq!.nodeUuid}`).sort().join('|');
    if (key === '' || key === checked.current) return;
    checked.current = key;
    // Nothing is known when Logseq cannot be asked: the links stay.
    sendMessage('logseq:checkHighlightLinks', { ids: linked.map((h) => h.id) })
      .then((ids) => {
        if (ids.length > 0) setRemoved((prev) => new Set([...prev, ...ids]));
      })
      .catch(() => {});
  }, [highlights]);

  const deleteHighlight = async (id: string) => {
    setNotice(null);
    const result = await deleteStoredHighlight(id);
    if (!result.success) setNotice("Couldn't delete the highlight");
  };

  const updateNote = async (id: string, note: string) => {
    setNotice(null);
    const before = highlights?.find((h) => h.id === id);
    const result = await updateHighlightNote(id, note);
    if (!result.success) {
      setNotice("Couldn't save the note");
      throw new Error(result.message);
    }
    // The note is saved here either way; a failure to sync it says why.
    if (before?.logseq && (before.note ?? '').trim() !== note.trim()) {
      try {
        // False: the clip is gone and the link was dropped, nothing to tell.
        if (!(await sendMessage('logseq:syncHighlightNote', { id }))) {
          setRemoved((prev) => new Set(prev).add(id));
        }
      } catch (error) {
        setNotice(clipErrorMessage(error));
      }
    }
  };

  return { highlights, removedFromLogseq, notice, setNotice, deleteHighlight, updateNote };
}
