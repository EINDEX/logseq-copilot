import type { HighlightData } from '@/types/highlight';
import log from './logger';

/**
 * In-memory event bus for the content script.
 *
 * Content-script modules must not talk to each other through DOM events on
 * `document`: page scripts share the DOM and can dispatch forged events
 * (e.g. a CustomEvent with attacker-chosen `detail`). This emitter lives in
 * the content script's isolated JS world, so page scripts cannot reach it.
 */
export type ContentEventMap = {
  highlightAdded: HighlightData;
  highlightRemoved: { highlightId: string };
  // A highlight was edited elsewhere (e.g. its note, in the browser sidebar).
  highlightUpdated: HighlightData;
  showHighlightComment: {
    highlightData: HighlightData;
    clickPosition: { x: number; y: number };
  };
  // Background commands relayed to QuickCapture by the content script entry.
  quickCapture: undefined;
  quickCaptureWithSelection: undefined;
  quickCapturePage: undefined;
};

type Listener<T> = (payload: T) => void;

export function createEmitter<Events extends Record<string, unknown>>() {
  const listeners = new Map<keyof Events, Set<Listener<any>>>();

  return {
    /** Subscribe to an event. Returns an unsubscribe function. */
    on<K extends keyof Events>(name: K, listener: Listener<Events[K]>) {
      let set = listeners.get(name);
      if (!set) {
        set = new Set();
        listeners.set(name, set);
      }
      set.add(listener);
      return () => {
        set!.delete(listener);
      };
    },
    emit<K extends keyof Events>(name: K, payload: Events[K]) {
      listeners.get(name)?.forEach((listener) => {
        try {
          listener(payload);
        } catch (error) {
          log.error(`[content-events] listener for ${String(name)} failed`, error);
        }
      });
    },
    clear() {
      listeners.clear();
    },
  };
}

export const contentEvents = createEmitter<ContentEventMap>();
