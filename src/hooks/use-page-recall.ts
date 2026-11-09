import { useCallback, useEffect, useRef, useState } from 'react';
import type { LogseqSearchResult } from '@/types/logseqBlock';
import { sendMessage } from '@/types/messaging';

export interface PageRecallState {
  /** True while the page is being searched. */
  loading: boolean;
  /** Why the last search failed (Logseq not reachable, ...), or null. */
  error: string | null;
  /** What Logseq has about the page; null while loading, after an error, or without a page. */
  result: LogseqSearchResult | null;
}

export interface PageRecall extends PageRecallState {
  /** Searches the same page again. */
  retry: () => void;
}

const IDLE: PageRecallState = { loading: false, error: null, result: null };

const FAILED = "Couldn't search Logseq";

/**
 * What the Logseq graph has about `url` (`logseq:urlSearch`: the background
 * applies the recall rules and their scope depth), searched again whenever
 * `url` changes. Only the latest search may show its result. Used by the
 * browser sidebar (an extension page) and by the one drawn on the page, so it
 * must not import anything from the content script entrypoint. A null `url`
 * is not searched and has no result.
 */
export function usePageRecall(url: string | null): PageRecall {
  const [state, setState] = useState<PageRecallState>(IDLE);
  const [attempt, setAttempt] = useState(0);
  const latestSearch = useRef(0);

  useEffect(() => {
    const thisSearch = ++latestSearch.current;
    if (!url) {
      setState(IDLE);
      return;
    }
    setState({ loading: true, error: null, result: null });

    const settle = (next: PageRecallState) => {
      if (thisSearch === latestSearch.current) setState(next);
    };
    sendMessage('logseq:urlSearch', { url }).then(
      (answer) => {
        if (answer.status !== 200) {
          settle({ loading: false, error: answer.msg || FAILED, result: null });
        } else {
          settle({ loading: false, error: null, result: answer.response });
        }
      },
      (error) => {
        settle({
          loading: false,
          error: error instanceof Error && error.message ? error.message : FAILED,
          result: null,
        });
      },
    );

    return () => {
      // A newer search, or none after unmount: this one may not show.
      latestSearch.current++;
    };
  }, [url, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  return { ...state, retry };
}
