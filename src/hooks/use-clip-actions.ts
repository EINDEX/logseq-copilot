import { useCallback, useEffect, useRef, useState } from 'react';
import { clipErrorMessage } from '@/utils/clip-feedback';
import log from '@/utils/logger';

export type ClipAction = 'page' | 'selection';

export interface ClipActionsState {
  /** The clip on its way to Logseq. */
  clipping: ClipAction | null;
  /** The action that has just clipped, for a moment (DONE_MS). */
  done: ClipAction | null;
  /** Why the last clip clipped nothing, until the next one or another page. */
  error: { action: ClipAction; message: string } | null;
}

export interface ClipActions extends ClipActionsState {
  clipPage: () => void;
  clipSelection: () => void;
}

export interface ClipHandlers {
  /** Resolve once clipped; reject with the readable error (feedback: 'sender'). */
  clipPage: () => Promise<unknown>;
  clipSelection: () => Promise<unknown>;
  /** After a successful clip. */
  onClipped?: (action: ClipAction) => void;
  /** After every clip, successful or not. */
  onSettled?: (action: ClipAction) => void;
}

/** How long a button shows that it has clipped. */
export const DONE_MS = 1500;

const IDLE: ClipActionsState = { clipping: null, done: null, error: null };

/**
 * The two clip actions of the sidebar header, run by the host (`handlers`):
 * one at a time, the error of a failed one, and a moment of "done" after a
 * successful one. All of it is about `page`, and goes when it changes. Used
 * by both sidebars: no imports from the content script entrypoint.
 */
export function useClipActions(handlers: ClipHandlers, page: string | null): ClipActions {
  const [state, setState] = useState<ClipActionsState>(IDLE);
  const latest = useRef(handlers);
  latest.current = handlers;
  // Bumped by a new page: a clip still on its way may not show.
  const generation = useRef(0);
  const busy = useRef(false);

  useEffect(() => {
    generation.current++;
    busy.current = false;
    setState(IDLE);
  }, [page]);

  useEffect(() => {
    if (!state.done) return;
    const timer = setTimeout(
      () => setState((shown) => (shown.done ? { ...shown, done: null } : shown)),
      DONE_MS,
    );
    return () => clearTimeout(timer);
  }, [state.done]);

  const run = useCallback(async (action: ClipAction) => {
    if (busy.current) return;
    busy.current = true;
    const thisGeneration = generation.current;
    setState({ clipping: action, done: null, error: null });
    const handlers = latest.current;
    const current = () => thisGeneration === generation.current;
    try {
      await (action === 'page' ? handlers.clipPage() : handlers.clipSelection());
      if (current()) {
        setState({ clipping: null, done: action, error: null });
        handlers.onClipped?.(action);
      }
    } catch (error) {
      log.error('[useClipActions] Failed to clip:', error);
      if (current()) {
        setState({
          clipping: null,
          done: null,
          error: { action, message: clipErrorMessage(error) },
        });
      }
    } finally {
      if (current()) {
        busy.current = false;
        handlers.onSettled?.(action);
      }
    }
  }, []);

  const clipPage = useCallback(() => void run('page'), [run]);
  const clipSelection = useCallback(() => void run('selection'), [run]);

  return { ...state, clipPage, clipSelection };
}
