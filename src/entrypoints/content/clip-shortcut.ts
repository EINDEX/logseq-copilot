import {
  clipShortcutItem,
  createShortcutDeduper,
  isKeyCombo,
  matchesCombo,
  type KeyCombo,
} from '@/utils/clip-shortcut';
import log from '@/utils/logger';

/**
 * The clip shortcut reaches the page twice when it is also the browser's
 * command: as a key press here, and as a message from the background. One
 * deduper for both, so the picker opened by the first is not confirmed by the
 * second. Two presses seen by one source are two presses.
 */
export const onceForClipShortcut = createShortcutDeduper();

/**
 * Chrome and Edge cannot change a command's shortcut from an extension, so
 * the shortcut the user records in the options is listened for here, in the
 * page, and does what the browser command does. Changes of the setting apply
 * at once, in every open tab. Firefox changes the real command instead and
 * never stores one.
 *
 * Returns a function that stops listening.
 */
export const startClipShortcut = (
  run: () => unknown,
  win: Pick<Window, 'addEventListener' | 'removeEventListener'> = window,
): (() => void) => {
  let combo: KeyCombo | null = null;
  const use = (value: unknown) => {
    combo = isKeyCombo(value) ? value : null;
  };

  const onKeydown = (event: KeyboardEvent) => {
    if (!combo || event.repeat || event.isComposing) return;
    if (!matchesCombo(event, combo)) return;
    // The page and the picker panel never see it, like a browser command.
    event.preventDefault();
    event.stopImmediatePropagation();
    void Promise.resolve(onceForClipShortcut('page', run)).catch((error) =>
      log.error('[content] The clip shortcut failed', error),
    );
  };
  // Capture phase: before the page's own handlers (and the picker's).
  win.addEventListener('keydown', onKeydown as EventListener, true);

  clipShortcutItem
    .getValue()
    .then(use)
    .catch((error) => log.error('[content] Cannot read the clip shortcut', error));
  const unwatch = clipShortcutItem.watch(use);

  return () => {
    win.removeEventListener('keydown', onKeydown as EventListener, true);
    unwatch();
  };
};
