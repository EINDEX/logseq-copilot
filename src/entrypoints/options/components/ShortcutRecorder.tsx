import { useCallback, useEffect, useMemo, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { browser } from 'wxt/browser';
import { Button } from '@/components/ui/button';
import { notifyCommandShortcutsChanged } from '@/hooks/use-command-shortcuts';
import {
  CLIP_COMMAND,
  COMBO_PROBLEM_TEXT,
  clipShortcutItem,
  combosEqual,
  comboFromEvent,
  comboKeys,
  comboProblem,
  defaultClipCombo,
  isFirefoxKey,
  isKeyCombo,
  isMacPlatform,
  parseBrowserShortcut,
  toFirefoxShortcut,
  type KeyCombo,
} from '@/utils/clip-shortcut';

const FIREFOX = import.meta.env.FIREFOX;
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
 * Records the clip shortcut. Firefox changes the real command. Chrome and
 * Edge cannot, so the combo is stored and listened for in pages
 * (src/entrypoints/content/clip-shortcut.ts), beside the browser's own.
 */
export const ShortcutRecorder = () => {
  const mac = useMemo(isMacPlatform, []);
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState('');
  // The shortcut of the browser's command (`clip`).
  const [browserShortcut, setBrowserShortcut] = useState('');
  // The combo recorded for pages (Chrome, Edge).
  const [inPage, setInPage] = useState<KeyCombo | null>(null);

  const refresh = useCallback(() => {
    readBrowserShortcut()
      .then(setBrowserShortcut)
      .catch(() => {});
  }, []);

  useEffect(() => {
    refresh();
    clipShortcutItem
      .getValue()
      .then((value) => setInPage(isKeyCombo(value) ? value : null))
      .catch(() => {});
    const unwatch = clipShortcutItem.watch((value) =>
      setInPage(isKeyCombo(value) ? value : null),
    );
    // The browser's shortcut page is a tab away.
    window.addEventListener('focus', refresh);
    return () => {
      unwatch();
      window.removeEventListener('focus', refresh);
    };
  }, [refresh]);

  const commit = useCallback(
    async (combo: KeyCombo) => {
      const problem = comboProblem(combo, mac);
      if (problem) return setError(COMBO_PROBLEM_TEXT[problem]);
      if (FIREFOX) {
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
      } else {
        await clipShortcutItem.setValue(combo);
      }
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
    if (FIREFOX) {
      try {
        await firefoxCommands().reset(CLIP_COMMAND);
      } catch (err) {
        return setError(err instanceof Error ? err.message : String(err));
      }
      refresh();
      notifyCommandShortcutsChanged();
    } else {
      await clipShortcutItem.removeValue();
    }
  };

  const browserCombo = parseBrowserShortcut(browserShortcut, mac);
  const shown = FIREFOX ? browserCombo : (inPage ?? browserCombo);
  const keys = FIREFOX
    ? keysOfBrowserShortcut(browserShortcut, mac)
    : inPage
      ? comboKeys(inPage, mac)
      : keysOfBrowserShortcut(browserShortcut, mac);
  const changed = FIREFOX
    ? !combosEqual(shown, defaultClipCombo(mac))
    : inPage !== null;

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
      {!FIREFOX && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>Browser</span>
          {browserShortcut ? (
            <Keycaps keys={keysOfBrowserShortcut(browserShortcut, mac)} />
          ) : (
            <span>Not set</span>
          )}
          <button
            type="button"
            className="text-primary hover:underline"
            onClick={() => void browser.tabs.create({ url: SHORTCUTS_URL })}
          >
            Change
          </button>
        </div>
      )}
    </div>
  );
};
