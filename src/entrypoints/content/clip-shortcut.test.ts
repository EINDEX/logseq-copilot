import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing';
import { clipShortcutItem } from '@/utils/clip-shortcut';
import { onceForClipShortcut, startClipShortcut } from './clip-shortcut';

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const press = (init: KeyboardEventInit & { code: string }, target: EventTarget = window) => {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event;
};

// The deduper is module state: every test starts later than the last press.
let clock = 0;

describe('the in-page clip shortcut', () => {
  let stop: (() => void) | undefined;

  beforeEach(() => {
    fakeBrowser.reset();
    vi.useFakeTimers({ toFake: ['Date'] });
    clock += 100_000;
    vi.setSystemTime(clock);
  });
  afterEach(() => {
    stop?.();
    stop = undefined;
    vi.useRealTimers();
  });

  const start = async (run = vi.fn()) => {
    stop = startClipShortcut(run);
    await flush();
    return run;
  };

  const recorded = { code: 'KeyK', ctrl: true, alt: false, shift: true, meta: false };

  it('does nothing until a shortcut is recorded', async () => {
    const run = await start();
    const event = press({ code: 'KeyK', ctrlKey: true, shiftKey: true });
    expect(run).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it('runs the clip on the recorded shortcut, and keeps the key from the page', async () => {
    await clipShortcutItem.setValue(recorded);
    const run = await start();
    const pageHandler = vi.fn();
    document.body.addEventListener('keydown', pageHandler);
    const event = press({ code: 'KeyK', key: 'K', ctrlKey: true, shiftKey: true }, document.body);
    document.body.removeEventListener('keydown', pageHandler);
    expect(run).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
    expect(pageHandler).not.toHaveBeenCalled();
  });

  it('ignores other keys, and a held key repeating', async () => {
    await clipShortcutItem.setValue(recorded);
    const run = await start();
    press({ code: 'KeyJ', ctrlKey: true, shiftKey: true });
    press({ code: 'KeyK', ctrlKey: true });
    press({ code: 'KeyK', ctrlKey: true, shiftKey: true, repeat: true });
    expect(run).not.toHaveBeenCalled();
  });

  it('follows a change of the setting at once, without a reload', async () => {
    const run = await start();
    await clipShortcutItem.setValue(recorded);
    await flush();
    press({ code: 'KeyK', ctrlKey: true, shiftKey: true });
    expect(run).toHaveBeenCalledTimes(1);

    vi.setSystemTime(clock + 20_000);
    await clipShortcutItem.setValue({ ...recorded, code: 'KeyM' });
    await flush();
    press({ code: 'KeyK', ctrlKey: true, shiftKey: true });
    expect(run).toHaveBeenCalledTimes(1);
    press({ code: 'KeyM', ctrlKey: true, shiftKey: true });
    expect(run).toHaveBeenCalledTimes(2);

    vi.setSystemTime(clock + 30_000);
    await clipShortcutItem.removeValue();
    await flush();
    press({ code: 'KeyM', ctrlKey: true, shiftKey: true });
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('runs once when the browser command and the page both see one press', async () => {
    await clipShortcutItem.setValue(recorded);
    const run = await start();
    // The page sees the key; the background's message follows at once.
    press({ code: 'KeyK', ctrlKey: true, shiftKey: true });
    const fromBackground = vi.fn();
    onceForClipShortcut('command', fromBackground);
    expect(run).toHaveBeenCalledTimes(1);
    expect(fromBackground).not.toHaveBeenCalled();
  });

  it('lets the next press through: the second press saves', async () => {
    await clipShortcutItem.setValue(recorded);
    const run = await start();
    press({ code: 'KeyK', ctrlKey: true, shiftKey: true });
    vi.setSystemTime(clock + 1500);
    press({ code: 'KeyK', ctrlKey: true, shiftKey: true });
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('ignores a stored value that is no combo', async () => {
    await fakeBrowser.storage.local.set({ clipShortcut: 'Ctrl+K' });
    const run = await start();
    press({ code: 'KeyK', ctrlKey: true });
    expect(run).not.toHaveBeenCalled();
  });

  it('stops listening', async () => {
    await clipShortcutItem.setValue(recorded);
    const run = await start();
    stop?.();
    stop = undefined;
    press({ code: 'KeyK', ctrlKey: true, shiftKey: true });
    expect(run).not.toHaveBeenCalled();
  });
});
