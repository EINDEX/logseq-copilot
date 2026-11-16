import { useEffect, useState } from 'react';
import { browser } from 'wxt/browser';

/**
 * The shortcut the user has set for each command of the extension, by command
 * name. A command without one is left out.
 */
export function useCommandShortcuts(): Record<string, string> {
  const [shortcuts, setShortcuts] = useState<Record<string, string>>({});

  useEffect(() => {
    let current = true;
    Promise.resolve()
      .then(() => browser.commands?.getAll?.())
      .then((commands) => {
        if (!current || !commands) return;
        setShortcuts(
          Object.fromEntries(
            commands
              .filter((command) => command.name && command.shortcut)
              .map((command) => [command.name!, command.shortcut!]),
          ),
        );
      })
      .catch(() => {});
    return () => {
      current = false;
    };
  }, []);

  return shortcuts;
}
