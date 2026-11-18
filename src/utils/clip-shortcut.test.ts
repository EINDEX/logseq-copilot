import { describe, expect, it } from 'vitest';
import {
  SHORTCUT_DEDUPE_MS,
  comboFromEvent,
  comboKeys,
  comboProblem,
  combosEqual,
  createShortcutDeduper,
  defaultClipCombo,
  formatCombo,
  isKeyCombo,
  matchesCombo,
  parseBrowserShortcut,
  toFirefoxShortcut,
  type KeyCombo,
} from './clip-shortcut';

const combo = (over: Partial<KeyCombo> = {}): KeyCombo => ({
  code: 'KeyU',
  ctrl: false,
  alt: false,
  shift: false,
  meta: false,
  ...over,
});

const press = (init: Partial<KeyboardEventInit> & { code: string }) =>
  new KeyboardEvent('keydown', init);

describe('comboFromEvent', () => {
  it('reads the code and the modifiers', () => {
    expect(
      comboFromEvent(press({ code: 'KeyU', key: 'U', ctrlKey: true, shiftKey: true })),
    ).toEqual({ code: 'KeyU', ctrl: true, alt: false, shift: true, meta: false, label: 'U' });
  });

  it('is null while only modifiers are held', () => {
    expect(comboFromEvent(press({ code: 'ShiftLeft', key: 'Shift', shiftKey: true }))).toBeNull();
    expect(comboFromEvent(press({ code: 'MetaRight', key: 'Meta', metaKey: true }))).toBeNull();
  });

  it('keeps no label for the character Alt makes (macOS: Alt+U is a dead key)', () => {
    const result = comboFromEvent(press({ code: 'KeyU', key: 'Dead', altKey: true, metaKey: true }));
    expect(result?.label).toBeUndefined();
    expect(result?.code).toBe('KeyU');
  });

  it('labels the key as printed on the keyboard layout (AZERTY)', () => {
    expect(comboFromEvent(press({ code: 'KeyQ', key: 'a', ctrlKey: true }))?.label).toBe('A');
  });
});

describe('matchesCombo', () => {
  const stored = combo({ ctrl: true, shift: true });

  it('matches the same physical key and modifiers', () => {
    expect(matchesCombo(press({ code: 'KeyU', key: 'U', ctrlKey: true, shiftKey: true }), stored)).toBe(true);
  });

  it('matches on code, although Shift and Alt change `key`', () => {
    expect(matchesCombo(press({ code: 'KeyU', key: 'u', ctrlKey: true, shiftKey: true }), stored)).toBe(true);
    const alt = combo({ alt: true, meta: true });
    expect(matchesCombo(press({ code: 'KeyU', key: 'Dead', altKey: true, metaKey: true }), alt)).toBe(true);
    expect(matchesCombo(press({ code: 'KeyU', key: 'ü', altKey: true, metaKey: true }), alt)).toBe(true);
  });

  it('does not match another key, with the same `key` text', () => {
    expect(matchesCombo(press({ code: 'KeyI', key: 'U', ctrlKey: true, shiftKey: true }), stored)).toBe(false);
  });

  it('needs exactly the modifiers: no extra, none missing', () => {
    expect(matchesCombo(press({ code: 'KeyU', ctrlKey: true }), stored)).toBe(false);
    expect(
      matchesCombo(press({ code: 'KeyU', ctrlKey: true, shiftKey: true, altKey: true }), stored),
    ).toBe(false);
  });

  it('tells macOS Command from Control', () => {
    const cmd = combo({ meta: true, shift: true });
    expect(matchesCombo(press({ code: 'KeyU', metaKey: true, shiftKey: true }), cmd)).toBe(true);
    expect(matchesCombo(press({ code: 'KeyU', ctrlKey: true, shiftKey: true }), cmd)).toBe(false);
    expect(matchesCombo(press({ code: 'KeyU', metaKey: true, shiftKey: true }), stored)).toBe(false);
  });

  it('matches nothing without a combo', () => {
    expect(matchesCombo(press({ code: 'KeyU', ctrlKey: true }), null)).toBe(false);
  });
});

describe('combosEqual and isKeyCombo', () => {
  it('ignores the label', () => {
    expect(combosEqual(combo({ label: 'U' }), combo())).toBe(true);
    expect(combosEqual(combo({ ctrl: true }), combo())).toBe(false);
    expect(combosEqual(null, combo())).toBe(false);
  });

  it('accepts a combo and rejects what else storage can hold', () => {
    expect(isKeyCombo(combo({ ctrl: true }))).toBe(true);
    expect(isKeyCombo(null)).toBe(false);
    expect(isKeyCombo('Ctrl+U')).toBe(false);
    expect(isKeyCombo({ code: 'KeyU' })).toBe(false);
    expect(isKeyCombo(combo({ code: 'ShiftLeft' }))).toBe(false);
    expect(isKeyCombo({ ...combo(), ctrl: 'yes' })).toBe(false);
  });
});

describe('formatting', () => {
  const clip = combo({ shift: true, meta: true });

  it('writes ⇧⌘U on macOS, in the order of the system', () => {
    expect(formatCombo(clip, true)).toBe('⇧⌘U');
    expect(formatCombo(combo({ ctrl: true, alt: true, shift: true, meta: true }), true)).toBe('⌃⌥⇧⌘U');
  });

  it('writes Ctrl+Shift+U elsewhere', () => {
    expect(formatCombo(combo({ ctrl: true, shift: true }), false)).toBe('Ctrl+Shift+U');
    expect(formatCombo(combo({ ctrl: true, alt: true }), false)).toBe('Ctrl+Alt+U');
  });

  it('gives one keycap per key', () => {
    expect(comboKeys(clip, true)).toEqual(['⇧', '⌘', 'U']);
    expect(comboKeys(combo({ ctrl: true, shift: true }), false)).toEqual(['Ctrl', 'Shift', 'U']);
  });

  it('names the keys that are no letters', () => {
    expect(formatCombo(combo({ code: 'Digit5', ctrl: true }), false)).toBe('Ctrl+5');
    expect(formatCombo(combo({ code: 'F7', alt: true }), false)).toBe('Alt+F7');
    expect(formatCombo(combo({ code: 'ArrowUp', alt: true }), false)).toBe('Alt+↑');
    expect(formatCombo(combo({ code: 'Comma', ctrl: true }), false)).toBe('Ctrl+,');
  });

  it('prefers the label of the layout', () => {
    expect(formatCombo(combo({ code: 'KeyQ', label: 'A', ctrl: true }), false)).toBe('Ctrl+A');
  });

  it('has the default of the manifest for each platform', () => {
    expect(formatCombo(defaultClipCombo(true), true)).toBe('⇧⌘U');
    expect(formatCombo(defaultClipCombo(false), false)).toBe('Ctrl+Shift+U');
  });
});

describe('parseBrowserShortcut', () => {
  it('reads the symbols Chrome shows on macOS', () => {
    expect(parseBrowserShortcut('⇧⌘U', true)).toEqual(combo({ shift: true, meta: true }));
    expect(parseBrowserShortcut('⌃⌥K', true)).toEqual(combo({ code: 'KeyK', ctrl: true, alt: true }));
  });

  it('reads Ctrl+Shift+U, where Ctrl is Command on macOS', () => {
    expect(parseBrowserShortcut('Ctrl+Shift+U', false)).toEqual(combo({ ctrl: true, shift: true }));
    expect(parseBrowserShortcut('Ctrl+Shift+U', true)).toEqual(combo({ meta: true, shift: true }));
    expect(parseBrowserShortcut('MacCtrl+Shift+U', true)).toEqual(combo({ ctrl: true, shift: true }));
    expect(parseBrowserShortcut('Command+Alt+Up', true)).toEqual(
      combo({ code: 'ArrowUp', meta: true, alt: true }),
    );
  });

  it('reads digits and function keys', () => {
    expect(parseBrowserShortcut('Alt+3', false)).toEqual(combo({ code: 'Digit3', alt: true }));
    expect(parseBrowserShortcut('Ctrl+F9', false)).toEqual(combo({ code: 'F9', ctrl: true }));
  });

  it('is null for what is no shortcut', () => {
    expect(parseBrowserShortcut('', false)).toBeNull();
    expect(parseBrowserShortcut('Hyper+U', false)).toBeNull();
    expect(parseBrowserShortcut('Ctrl+', false)).toBeNull();
    expect(parseBrowserShortcut('Not set', false)).toBeNull();
  });

  it('round-trips with the format of each platform', () => {
    const mac = combo({ shift: true, meta: true });
    expect(parseBrowserShortcut(formatCombo(mac, true), true)).toEqual(mac);
    const win = combo({ ctrl: true, alt: true, code: 'KeyK' });
    expect(parseBrowserShortcut(formatCombo(win, false), false)).toEqual(win);
  });
});

describe('toFirefoxShortcut', () => {
  it('writes Ctrl for Command on macOS and MacCtrl for Control', () => {
    expect(toFirefoxShortcut(combo({ shift: true, meta: true }), true)).toBe('Ctrl+Shift+U');
    expect(toFirefoxShortcut(combo({ ctrl: true, alt: true }), true)).toBe('MacCtrl+Alt+U');
    expect(toFirefoxShortcut(combo({ ctrl: true, shift: true }), false)).toBe('Ctrl+Shift+U');
  });

  it('names the keys as Firefox does', () => {
    expect(toFirefoxShortcut(combo({ code: 'ArrowLeft', alt: true }), false)).toBe('Alt+Left');
    expect(toFirefoxShortcut(combo({ code: 'Digit2', ctrl: true }), false)).toBe('Ctrl+2');
    expect(toFirefoxShortcut(combo({ code: 'F5', alt: true }), false)).toBe('Alt+F5');
  });
});

describe('comboProblem', () => {
  it('accepts the default and other combos with a modifier', () => {
    expect(comboProblem(defaultClipCombo(true), true)).toBeNull();
    expect(comboProblem(defaultClipCombo(false), false)).toBeNull();
    expect(comboProblem(combo({ alt: true }), false)).toBeNull();
    expect(comboProblem(combo({ ctrl: true, alt: true, code: 'KeyT' }), false)).toBeNull();
  });

  it('needs Ctrl, Alt or Meta: Shift alone, or no modifier, is not enough', () => {
    expect(comboProblem(combo({ shift: true }), false)).toBe('no-modifier');
    expect(comboProblem(combo(), true)).toBe('no-modifier');
  });

  it('needs a key that is no modifier', () => {
    expect(comboProblem(combo({ code: 'ShiftLeft', ctrl: true }), false)).toBe('no-key');
    expect(comboProblem(combo({ code: '', ctrl: true }), false)).toBe('no-key');
  });

  it.each(['KeyT', 'KeyW', 'KeyN', 'KeyQ', 'KeyR', 'KeyL', 'Tab', 'Digit1', 'PageUp'])(
    'rejects Ctrl+%s on Windows and Linux, with or without Shift',
    (code) => {
      expect(comboProblem(combo({ code, ctrl: true }), false)).toBe('reserved');
      expect(comboProblem(combo({ code, ctrl: true, shift: true }), false)).toBe('reserved');
    },
  );

  it.each(['KeyT', 'KeyW', 'KeyN', 'KeyQ', 'KeyR', 'KeyL'])(
    'rejects Command+%s on macOS',
    (code) => {
      expect(comboProblem(combo({ code, meta: true }), true)).toBe('reserved');
      expect(comboProblem(combo({ code, meta: true, shift: true }), true)).toBe('reserved');
    },
  );

  it('leaves Control+T alone on macOS, and Command+T alone off it', () => {
    expect(comboProblem(combo({ code: 'KeyT', ctrl: true }), true)).toBeNull();
    expect(comboProblem(combo({ code: 'KeyT', meta: true }), false)).toBeNull();
  });

  it('rejects Ctrl+Tab on every platform, and Alt+F4', () => {
    expect(comboProblem(combo({ code: 'Tab', ctrl: true }), true)).toBe('reserved');
    expect(comboProblem(combo({ code: 'F4', alt: true }), false)).toBe('reserved');
  });

  it('rejects Escape: it cancels the recorder', () => {
    expect(comboProblem(combo({ code: 'Escape', ctrl: true }), false)).toBe('unsupported-key');
  });
});

describe('createShortcutDeduper', () => {
  it('runs once when the page and the browser command both see one press', () => {
    let time = 1000;
    const once = createShortcutDeduper(() => time);
    const calls: string[] = [];
    once('page', () => calls.push('page'));
    time += 20;
    once('command', () => calls.push('command'));
    expect(calls).toEqual(['page']);
  });

  it('does the same when the command comes first', () => {
    let time = 1000;
    const once = createShortcutDeduper(() => time);
    const calls: string[] = [];
    once('command', () => calls.push('command'));
    time += 20;
    once('page', () => calls.push('page'));
    expect(calls).toEqual(['command']);
  });

  it('runs again for the next press, from the other source too', () => {
    let time = 1000;
    const once = createShortcutDeduper(() => time);
    const calls: string[] = [];
    once('page', () => calls.push('open'));
    time += SHORTCUT_DEDUPE_MS;
    once('command', () => calls.push('save'));
    expect(calls).toEqual(['open', 'save']);
  });

  it('never drops two presses seen by the same source', () => {
    let time = 1000;
    const once = createShortcutDeduper(() => time);
    const calls: string[] = [];
    once('command', () => calls.push('open'));
    time += 10;
    once('command', () => calls.push('save'));
    time += 10;
    once('page', () => calls.push('page'));
    expect(calls).toEqual(['open', 'save']);
  });

  it('returns what the run returns, and nothing for a duplicate', () => {
    const once = createShortcutDeduper(() => 5000);
    expect(once('page', () => 7)).toBe(7);
    expect(once('command', () => 8)).toBeUndefined();
  });
});
