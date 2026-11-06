import type { ContentScriptContext } from 'wxt/utils/content-script-context';
import log from '@/utils/logger';

/** How long after mounting the card is put back when the page takes it out. */
export const FOLLOW_MS = 10_000;
/** How many times at most. */
export const MAX_REMOUNTS = 5;

export interface KeepOnPageOptions {
  /** A new container at the current mount point, null when there is none (yet). */
  place: () => Element | null;
  /** False when the card no longer belongs on the page (another query). */
  wanted: () => boolean;
  /** The card is out of the page for good: unmount it. */
  onLost: () => void;
  followMs?: number;
  maxRemounts?: number;
}

/**
 * Some result pages render their columns again after load and take the
 * search card with them. Brave Search did on CI: its Svelte app replaced
 * the server-rendered page when hydration failed. The card's host element
 * is then out of the document. A container can also be gone before the
 * card is mounted in it; WXT then mounts it there all the same.
 *
 * For `followMs` after mounting, put the host back when that happens, in a
 * new container at the current mount point. The host moves as it is, React
 * root and results included: no second search, never a second card. At most
 * `maxRemounts` times, so a page that keeps taking it out gets no tug of war.
 * When it is out for good (the limit, the time is up, another query),
 * `onLost` unmounts it. WXT's `autoMount` cannot do this: it watches whether
 * an element matches the anchor selector, and the page puts a new one there
 * in the same change that removes the old one.
 *
 * Returns a function that stops following.
 */
export function keepOnPage(
  ctx: Pick<ContentScriptContext, 'onInvalidated' | 'setTimeout'>,
  host: Element,
  {
    place,
    wanted,
    onLost,
    followMs = FOLLOW_MS,
    maxRemounts = MAX_REMOUNTS,
  }: KeepOnPageOptions,
): () => void {
  let container: Element | null = host.parentElement;
  let remounts = 0;
  let stopped = false;

  const check = () => {
    if (stopped || host.isConnected) return;
    if (remounts >= maxRemounts || !wanted()) return lose();
    const next = place();
    // Not on the page (yet): the next change tries again.
    if (!next) return;
    // The page took the card out of a container it left in place.
    if (container?.isConnected) container.remove();
    next.append(host);
    container = next;
    remounts += 1;
    log.debug(`[search card] put back on the page (${remounts}/${maxRemounts})`);
  };

  const observer = new MutationObserver(check);
  const stop = () => {
    if (stopped) return;
    stopped = true;
    observer.disconnect();
    clearTimeout(timer);
    removeInvalidatedListener();
  };
  const lose = () => {
    stop();
    onLost();
  };

  const timer = ctx.setTimeout(() => (host.isConnected ? stop() : lose()), followMs);
  // WXT removes the UI itself when the extension context goes away.
  const removeInvalidatedListener = ctx.onInvalidated(stop);
  observer.observe(document, { childList: true, subtree: true });
  check();
  return stop;
}
