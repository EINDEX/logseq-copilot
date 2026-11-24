import { useCallback, useEffect, useMemo, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { browser } from 'wxt/browser';
import { Button } from '@/components/ui/button';
import { notifyCommandShortcutsChanged } from '@/hooks/use-command-shortcuts';
import {
  CLIP_COMMAND,
  COMBO_PROBLEM_TEXT,
  combosEqual,
  comboFromEvent,
  comboKeys,
  comboProblem,
  defaultClipCombo,
  isFirefoxKey,
  isMacPlatform,
  parseBrowserShortcut,
  toFirefoxShortcut,
  type KeyCombo,
} from '@/utils/clip-shortcut';

const FIREFOX = import.meta.env.FIREFOX;
const SAFARI = import.meta.env.SAFARI;
const EDGE = /\bEdg\//.test(navigator.userAgent);
const SHORTCUTS_URL = EDGE
  ? 'edge://extensions/shortcuts'
  : 'chrome://extensions/shortcuts';

export const Keycaps = ({ keys }: { keys: string[] }) => (
  <span className="inline-flex items-center gap-1">
    {keys.map((key, index) => (
      <kbd
        key={index}
        className="inline-flex h-6 min-w-6 items-center justify-center rounded border border-b-2 bg-muted px-1.5 font-sans text-xs font-medium text-foreground"
      >
        {key}
      </kbd>
    ))}
  </span>
);

/** `commands.update` and `reset` exist in Firefox only (not in the Chrome typings). */
const firefoxCommands = () =>
  browser.commands as unknown as {
    update: (detail: { name: string; shortcut: string }) => Promise<void>;
    reset: (name: string) => Promise<void>;
  };

const readBrowserShortcut = async (): Promise<string> => {
  const commands = await browser.commands?.getAll?.();
  return commands?.find((command) => command.name === CLIP_COMMAND)?.shortcut ?? '';
};

/** The keycaps of a shortcut string of the browser: parsed, or as it is. */
const keysOfBrowserShortcut = (text: string, mac: boolean): string[] => {
  const combo = parseBrowserShortcut(text, mac);
  return combo ? comboKeys(combo, mac) : text ? [text] : [];
};

/**
 * The clip shortcut row. Firefox changes the real command from here. Chrome,
 * Edge and Brave cannot, so the row shows the browser's shortcut and opens the
 * browser's own shortcuts page. Safari has no such page, so the row only says so.
 */
export const ShortcutRecorder = () => (FIREFOX ? <FirefoxRecorder /> : <BrowserShortcut />);

const BrowserShortcut = () => {
  const mac = useMemo(isMacPlatform, []);
  const [shortcut, setShortcut] = useState('');

  const refresh = useCallback(() => {
    readBrowserShortcut()
      .then(setShortcut)
      .catch(() => {});
  }, []);

  useEffect(() => {
    refresh();
    // The browser's shortcut page is a tab away.
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, [refresh]);

  const keys = keysOfBrowserShortcut(shortcut, mac);

  return (
    <div className="flex items-center gap-3">
      <span id="clip-shortcut" className="inline-flex min-h-8 items-center">
        {keys.length > 0 ? (
          <Keycaps keys={keys} />
        ) : (
          <span className="text-sm text-muted-foreground">Not set</span>
        )}
      </span>
      {SAFARI ? (
        <span className="text-sm text-muted-foreground">
          Safari doesn’t let you change shortcuts.
        </span>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void browser.tabs.create({ url: SHORTCUTS_URL })}
        >
          Change
        </Button>
      )}
    </div>
  );
};

const FirefoxRecorder = () => {
  const mac = useMemo(isMacPlatform, []);
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState('');
  const [browserShortcut, setBrowserShortcut] = useState('');

  const refresh = useCallback(() => {
    readBrowserShortcut()
      .then(setBrowserShortcut)
      .catch(() => {});
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const commit = useCallback(
    async (combo: KeyCombo) => {
      const problem = comboProblem(combo, mac);
      if (problem) return setError(COMBO_PROBLEM_TEXT[problem]);
      if (!isFirefoxKey(combo)) return setError(COMBO_PROBLEM_TEXT['unsupported-key']);
      try {
        await firefoxCommands().update({
          name: CLIP_COMMAND,
          shortcut: toFirefoxShortcut(combo, mac),
        });
      } catch (err) {
        return setError(err instanceof Error ? err.message : String(err));
      }
      refresh();
      notifyCommandShortcutsChanged();
      setError('');
      setRecording(false);
    },
    [mac, refresh],
  );

  useEffect(() => {
    if (!recording) return;
    const onKeydown = (event: KeyboardEvent) => {
      // The keys are the recorder's, not the page's or the browser's.
      event.preventDefault();
      event.stopPropagation();
      if (event.repeat) return;
      if (event.key === 'Escape') {
        setError('');
        setRecording(false);
        return;
      }
      const combo = comboFromEvent(event);
      if (combo) void commit(combo);
    };
    window.addEventListener('keydown', onKeydown, true);
    return () => window.removeEventListener('keydown', onKeydown, true);
  }, [recording, commit]);

  const reset = async () => {
    setError('');
    setRecording(false);
    try {
      await firefoxCommands().reset(CLIP_COMMAND);
    } catch (err) {
      return setError(err instanceof Error ? err.message : String(err));
    }
    refresh();
    notifyCommandShortcutsChanged();
  };

  const keys = keysOfBrowserShortcut(browserShortcut, mac);
  const changed = !combosEqual(
    parseBrowserShortcut(browserShortcut, mac),
    defaultClipCombo(mac),
  );

  return (
    <div className="flex flex-col items-start gap-2">
      <div className="flex items-center gap-1">
        <Button
          id="clip-shortcut"
          type="button"
          variant="outline"
          className={
            recording
              ? 'min-w-48 justify-start border-primary ring-[3px] ring-primary/30'
              : 'min-w-48 justify-start'
          }
          aria-invalid={error ? true : undefined}
          onClick={() => {
            setError('');
            setRecording(true);
          }}
          onBlur={() => {
            setRecording(false);
            setError('');
          }}
        >
          {recording ? (
            <span className="text-muted-foreground">Press keys…</span>
          ) : keys.length > 0 ? (
            <Keycaps keys={keys} />
          ) : (
            <span className="text-muted-foreground">Not set</span>
          )}
        </Button>
        {changed && !recording && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Reset shortcut"
            // The blur of the recorder button runs first; keep the click.
            onClick={() => void reset()}
          >
            <RotateCcw />
          </Button>
        )}
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
};
