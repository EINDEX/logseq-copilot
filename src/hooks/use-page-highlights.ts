import { useEffect, useState } from 'react';
import type { HighlightData } from '@/types/highlight';
import {
  deleteHighlight as deleteStoredHighlight,
  getHighlightsForUrl,
  updateHighlightNote,
  watchHighlights,
} from '@/utils/highlight-service';

export interface PageHighlights {
  /** The highlights of the page, newest first; null while they are being read. */
  highlights: HighlightData[] | null;
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

  useEffect(() => {
    setHighlights(null);
    setNotice(null);
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

  const deleteHighlight = async (id: string) => {
    setNotice(null);
    const result = await deleteStoredHighlight(id);
    if (!result.success) setNotice("Couldn't delete the highlight");
  };

  const updateNote = async (id: string, note: string) => {
    setNotice(null);
    const result = await updateHighlightNote(id, note);
    if (!result.success) {
      setNotice("Couldn't save the note");
      throw new Error(result.message);
    }
  };

  return { highlights, notice, setNotice, deleteHighlight, updateNote };
}
