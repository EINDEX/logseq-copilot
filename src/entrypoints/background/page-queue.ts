/**
 * Runs the writes to one page one after the other. Two clips of the same web
 * page in quick succession (a double shortcut press) would both find no block
 * to join and write two roots; in line, the second finds the first.
 */
const tails = new Map<string, Promise<unknown>>();

/** The key of a page: Logseq page names do not depend on case. */
export const pageKey = (page: string) => page.trim().toLowerCase();

/**
 * Runs `task` once every task queued for `page` before it has finished, and
 * answers with what it answers. A failed task does not hold up the ones behind
 * it.
 */
export const runOnPage = <T>(
  page: string,
  task: () => Promise<T>,
): Promise<T> => {
  const key = pageKey(page);
  const run = (tails.get(key) ?? Promise.resolve()).then(task, task);
  const tail = run.catch(() => undefined);
  tails.set(key, tail);
  // Forget the page once nothing waits behind this task.
  void tail.then(() => {
    if (tails.get(key) === tail) tails.delete(key);
  });
  return run;
};
