import { useEffect, useState } from 'react';
import type { WxtStorageItem } from 'wxt/utils/storage';

/**
 * The value of a storage item, kept up to date with changes made anywhere
 * (the options page, another tab). Content scripts use it for settings that
 * must apply to open pages without a reload. `initial` is shown until the
 * stored value has been read; the watcher stops when the component unmounts
 * (a content script UI is removed when its context is invalidated).
 */
export function useStorageItem<T>(
  item: Pick<WxtStorageItem<T, Record<string, unknown>>, 'getValue' | 'watch'>,
  initial?: T,
): T | undefined {
  const [value, setValue] = useState<T | undefined>(initial);

  useEffect(() => {
    let changed = false;
    let disposed = false;
    // Watching comes first, so a change while reading is not missed.
    const unwatch = item.watch((next) => {
      changed = true;
      setValue(() => next);
    });
    item
      .getValue()
      .then((current) => {
        if (!disposed && !changed) setValue(() => current);
      })
      .catch(() => {});
    return () => {
      disposed = true;
      unwatch();
    };
  }, [item]);

  return value;
}
