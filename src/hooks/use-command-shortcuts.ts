import { useEffect, useState } from 'react';
import { browser } from 'wxt/browser';

const changed = new EventTarget();

/** Tells the hooks of this page that a command's shortcut was changed. */
export const notifyCommandShortcutsChanged = () =>
  changed.dispatchEvent(new Event('change'));

/**
 * The shortcut the browser has for each command of the extension, by command
 * name. A command without one is left out.
 */
export function useCommandShortcuts(): Record<string, string> {
  const [shortcuts, setShortcuts] = useState<Record<string, string>>({});

  useEffect(() => {
    let current = true;
    const read = () => {
      Promise.resolve()
        .then(() => browser.commands?.getAll?.())
        .catch(() => undefined)
        .then((commands) => {
          if (!current) return;
          setShortcuts(
            Object.fromEntries(
              (commands ?? [])
                .filter((command) => command.name && command.shortcut)
                .map((command) => [command.name!, command.shortcut!]),
            ),
          );
        });
    };
    read();
    changed.addEventListener('change', read);
    // The browser's shortcut page is a tab away.
    window.addEventListener('focus', read);
    return () => {
      current = false;
      changed.removeEventListener('change', read);
      window.removeEventListener('focus', read);
    };
  }, []);

  return shortcuts;
}
