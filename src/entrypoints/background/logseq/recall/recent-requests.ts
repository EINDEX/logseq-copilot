/**
 * Share the answer of a request with identical requests made shortly after
 * (in flight or done). Failed requests are not kept.
 *
 * Used for `logseq:recall`: Bing loads a result page, then navigates the same
 * tab again to the same results with `&rdr=1&rdrig=…` about a second later.
 * The content script runs in both documents and would search Logseq twice.
 *
 * `clear()` forgets every answer, in flight or done, so the next request runs
 * again. Call it when an input of the answer changes (settings, rules).
 */
export const recentRequests = <T>(ttlMs: number, now = () => Date.now()) => {
  const entries = new Map<string, { at: number; value: Promise<T> }>();
  const share = (key: string, run: () => Promise<T>): Promise<T> => {
    const time = now();
    for (const [k, entry] of entries) {
      if (time - entry.at > ttlMs) entries.delete(k);
    }
    const cached = entries.get(key);
    if (cached) return cached.value;
    const value = run();
    const entry = { at: time, value };
    entries.set(key, entry);
    value.catch(() => {
      if (entries.get(key) === entry) entries.delete(key);
    });
    return value;
  };
  return Object.assign(share, { clear: () => entries.clear() });
};

/** Same query on the same results page; query string and hash ignored. */
export const recallRequestKey = (query: string, url: string) => {
  const { origin, pathname } = new URL(url);
  return `${origin}${pathname}\n${query.trim()}`;
};
