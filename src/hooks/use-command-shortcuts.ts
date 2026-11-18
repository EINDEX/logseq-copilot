import { useEffect, useState } from 'react';
import { browser } from 'wxt/browser';
import {
  CLIP_COMMAND,
  clipShortcutItem,
  formatCombo,
  isKeyCombo,
  isMacPlatform,
} from '@/utils/clip-shortcut';

const changed = new EventTarget();

/** Tells the hooks of this page that a command's shortcut was changed. */
export const notifyCommandShortcutsChanged = () =>
  changed.dispatchEvent(new Event('change'));

/**
 * The shortcut the user has set for each command of the extension, by command
 * name. A command without one is left out. `clip` is the shortcut recorded in
 * the options (Chrome, Edge: it works in pages beside the browser's own) when
 * there is one.
 */
export function useCommandShortcuts(): Record<string, string> {
  const [shortcuts, setShortcuts] = useState<Record<string, string>>({});

  useEffect(() => {
    let current = true;
    const read = () => {
      Promise.all([
        Promise.resolve()
          .then(() => browser.commands?.getAll?.())
          .catch(() => undefined),
        clipShortcutItem.getValue().catch(() => null),
      ]).then(([commands, recorded]) => {
        if (!current) return;
        const next = Object.fromEntries(
          (commands ?? [])
            .filter((command) => command.name && command.shortcut)
            .map((command) => [command.name!, command.shortcut!]),
        );
        if (isKeyCombo(recorded)) {
          next[CLIP_COMMAND] = formatCombo(recorded, isMacPlatform());
        }
        setShortcuts(next);
      });
    };
    read();
    const unwatch = clipShortcutItem.watch(read);
    changed.addEventListener('change', read);
    // The browser's shortcut page is a tab away.
    window.addEventListener('focus', read);
    return () => {
      current = false;
      unwatch();
      changed.removeEventListener('change', read);
      window.removeEventListener('focus', read);
    };
  }, []);

  return shortcuts;
}
