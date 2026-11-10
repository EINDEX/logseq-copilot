import { useCallback, useRef, useState } from 'react';
import type { LogseqSearchResult } from '@/types/logseqBlock';
import { sendMessage } from '@/types/messaging';

export interface LogseqSearchState {
  /** What is in the search box. */
  query: string;
  /**
   * The query of the search shown, from Enter until the box is cleared; null
   * when no search is shown (the sidebar shows the page).
   */
  submitted: string | null;
  /** True while `submitted` is being searched. */
  loading: boolean;
  /** Why the search failed, or null. */
  error: string | null;
  /** What Logseq found for `submitted`; null while loading or after an error. */
  result: LogseqSearchResult | null;
}

export interface LogseqSearch extends LogseqSearchState {
  /** Changes the box. Emptying it ends the search. */
  setQuery: (query: string) => void;
  /** Searches what is in the box (Enter); an empty box does nothing. */
  submit: () => void;
  /** Empties the box and ends the search (clear button, Escape). */
  clear: () => void;
  /** Searches `submitted` again. */
  retry: () => void;
}

const IDLE = { submitted: null, loading: false, error: null, result: null };

const FAILED = 'Search failed';

/**
 * A search of the Logseq graph (`logseq:search`) typed in the sidebar. It
 * does not depend on the page, so the result stays while the tab changes,
 * until the box is cleared. Only the latest search may show its result. Used
 * by both sidebars: no imports from the content script entrypoint.
 */
export function useLogseqSearch(): LogseqSearch {
  const [query, setQueryValue] = useState('');
  const [state, setState] = useState<Omit<LogseqSearchState, 'query'>>(IDLE);
  const latestSearch = useRef(0);

  const search = useCallback((submitted: string) => {
    const thisSearch = ++latestSearch.current;
    setState({ submitted, loading: true, error: null, result: null });
    const settle = (next: Omit<LogseqSearchState, 'query' | 'submitted'>) => {
      if (thisSearch === latestSearch.current) setState({ submitted, ...next });
    };
    sendMessage('logseq:search', submitted).then(
      (answer) => {
        if (answer.status !== 200 || !answer.response) {
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
  }, []);

  const clear = useCallback(() => {
    // A search still under way may not show.
    latestSearch.current++;
    setQueryValue('');
    setState(IDLE);
  }, []);

  const setQuery = useCallback(
    (next: string) => {
      if (next === '') clear();
      else setQueryValue(next);
    },
    [clear],
  );

  const submit = () => {
    const trimmed = query.trim();
    if (trimmed) search(trimmed);
  };

  const retry = () => {
    if (state.submitted !== null) search(state.submitted);
  };

  return { query, ...state, setQuery, submit, clear, retry };
}
