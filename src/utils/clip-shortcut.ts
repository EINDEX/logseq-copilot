/**
 * A key combination the user recorded. Matched on `code` (the physical key),
 * not `key`: with Shift or Alt held, `key` is another character ("U" becomes
 * "u", Alt+U on macOS becomes a dead key) while `code` stays `KeyU`.
 */
export interface KeyCombo {
  /** `KeyboardEvent.code` of the main key, e.g. `KeyU`, `Digit1`, `F5`. */
  code: string;
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  meta: boolean;
  /** What the key is printed as in the user's layout; display only. */
  label?: string;
}

/** The name of the clip command in the manifest. */
export const CLIP_COMMAND = 'clip';

/** `Ctrl+Shift+U` in the manifest; Chrome and Firefox read Ctrl as Command on macOS. */
export const DEFAULT_CLIP_COMBO_NON_MAC: KeyCombo = {
  code: 'KeyU',
  ctrl: true,
  alt: false,
  shift: true,
  meta: false,
};
export const DEFAULT_CLIP_COMBO_MAC: KeyCombo = {
  code: 'KeyU',
  ctrl: false,
  alt: false,
  shift: true,
  meta: true,
};

export const defaultClipCombo = (mac: boolean): KeyCombo =>
  mac ? DEFAULT_CLIP_COMBO_MAC : DEFAULT_CLIP_COMBO_NON_MAC;

export const isMacPlatform = (): boolean => {
  if (typeof navigator === 'undefined') return false;
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  return /mac|iphone|ipad/i.test(nav.userAgentData?.platform || nav.platform || '');
};

const MODIFIER_CODES = new Set([
  'ControlLeft',
  'ControlRight',
  'AltLeft',
  'AltRight',
  'ShiftLeft',
  'ShiftRight',
  'MetaLeft',
  'MetaRight',
  'OSLeft',
  'OSRight',
  'AltGraph',
  'CapsLock',
  'Fn',
  'FnLock',
]);

export const isModifierCode = (code: string): boolean => MODIFIER_CODES.has(code);

type KeyEventLike = Pick<
  KeyboardEvent,
  'code' | 'key' | 'ctrlKey' | 'altKey' | 'shiftKey' | 'metaKey'
>;

/** The combo a key press makes; null while only modifiers are held. */
export const comboFromEvent = (event: KeyEventLike): KeyCombo | null => {
  if (!event.code || isModifierCode(event.code)) return null;
  const combo: KeyCombo = {
    code: event.code,
    ctrl: event.ctrlKey,
    alt: event.altKey,
    shift: event.shiftKey,
    meta: event.metaKey,
  };
  // A printable `key` without Alt names the key in the user's layout (AZERTY's
  // `KeyQ` is printed "A"). With Alt it is often another character.
  if (!event.altKey && event.key.length === 1 && event.key !== ' ') {
    combo.label = event.key.toUpperCase();
  }
  return combo;
};

export const combosEqual = (
  a: KeyCombo | null | undefined,
  b: KeyCombo | null | undefined,
): boolean =>
  !!a &&
  !!b &&
  a.code === b.code &&
  a.ctrl === b.ctrl &&
  a.alt === b.alt &&
  a.shift === b.shift &&
  a.meta === b.meta;

const NAMED_CODES: Record<string, string> = {
  Space: 'Space',
  Comma: ',',
  Period: '.',
  Slash: '/',
  Backslash: '\\',
  Semicolon: ';',
  Quote: "'",
  Backquote: '`',
  BracketLeft: '[',
  BracketRight: ']',
  Minus: '-',
  Equal: '=',
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  Escape: 'Esc',
  Backspace: '⌫',
  Delete: 'Del',
  Enter: '↵',
  PageUp: 'PgUp',
  PageDown: 'PgDn',
};

/** The name of the main key as printed on it. */
export const keyName = (combo: KeyCombo): string => {
  if (combo.label) return combo.label;
  const { code } = combo;
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit\d$/.test(code)) return code.slice(5);
  if (/^Numpad\d$/.test(code)) return `Num ${code.slice(6)}`;
  return NAMED_CODES[code] ?? code;
};

/** The keys of a combo in display order, one string per keycap. */
export const comboKeys = (combo: KeyCombo, mac: boolean): string[] => {
  const key = keyName(combo);
  if (mac) {
    return [
      combo.ctrl && '⌃',
      combo.alt && '⌥',
      combo.shift && '⇧',
      combo.meta && '⌘',
      key,
    ].filter((part): part is string => !!part);
  }
  return [
    combo.ctrl && 'Ctrl',
    combo.alt && 'Alt',
    combo.shift && 'Shift',
    combo.meta && 'Win',
    key,
  ].filter((part): part is string => !!part);
};

/** `⇧⌘U` on macOS, `Ctrl+Shift+U` elsewhere. */
export const formatCombo = (combo: KeyCombo, mac: boolean): string =>
  comboKeys(combo, mac).join(mac ? '' : '+');

const WORD_KEYS: Record<string, string> = {
  space: 'Space',
  comma: 'Comma',
  period: 'Period',
  home: 'Home',
  end: 'End',
  pageup: 'PageUp',
  pagedown: 'PageDown',
  insert: 'Insert',
  delete: 'Delete',
  up: 'ArrowUp',
  down: 'ArrowDown',
  left: 'ArrowLeft',
  right: 'ArrowRight',
};

const SYMBOL_KEYS: Record<string, string> = {
  ',': 'Comma',
  '.': 'Period',
  '↑': 'ArrowUp',
  '↓': 'ArrowDown',
  '←': 'ArrowLeft',
  '→': 'ArrowRight',
};

const codeOfKeyName = (name: string): string | null => {
  if (/^[a-z]$/i.test(name)) return `Key${name.toUpperCase()}`;
  if (/^\d$/.test(name)) return `Digit${name}`;
  if (/^F([1-9]|1[0-2])$/i.test(name)) return name.toUpperCase();
  return WORD_KEYS[name.toLowerCase()] ?? SYMBOL_KEYS[name] ?? null;
};

/**
 * Reads the shortcut string of a browser command (`commands.getAll`): `⇧⌘U`
 * (Chrome on macOS), `Ctrl+Shift+U`, `Command+Shift+U`, `MacCtrl+Alt+Up`.
 * Null when it is none of these.
 */
export const parseBrowserShortcut = (
  text: string,
  mac: boolean,
): KeyCombo | null => {
  const source = text.trim();
  if (!source) return null;
  const combo: KeyCombo = {
    code: '',
    ctrl: false,
    alt: false,
    shift: false,
    meta: false,
  };

  let rest = source;
  if (!source.includes('+') || /^[⌃⌥⇧⌘]/.test(source)) {
    // Symbols, no separator; a "+" or a modifier name is no symbol form.
    while (rest && '⌃⌥⇧⌘'.includes(rest[0])) {
      if (rest[0] === '⌃') combo.ctrl = true;
      if (rest[0] === '⌥') combo.alt = true;
      if (rest[0] === '⇧') combo.shift = true;
      if (rest[0] === '⌘') combo.meta = true;
      rest = rest.slice(1);
    }
    const code = codeOfKeyName(rest);
    if (!code) return null;
    return { ...combo, code };
  }

  const parts = source.split('+').map((part) => part.trim());
  const key = parts.pop() ?? '';
  // "Ctrl++" (the plus key) leaves an empty last part: not supported.
  if (!key) return null;
  for (const part of parts) {
    switch (part.toLowerCase()) {
      case 'ctrl':
      case 'control':
        // The manifest's Ctrl is Command on macOS.
        if (mac) combo.meta = true;
        else combo.ctrl = true;
        break;
      case 'macctrl':
        combo.ctrl = true;
        break;
      case 'command':
      case 'cmd':
      case 'meta':
      case 'win':
        combo.meta = true;
        break;
      case 'alt':
      case 'option':
        combo.alt = true;
        break;
      case 'shift':
        combo.shift = true;
        break;
      default:
        return null;
    }
  }
  const code = codeOfKeyName(key);
  return code ? { ...combo, code } : null;
};

/**
 * The shortcut string `browser.commands.update` takes (Firefox). Ctrl is
 * Command on macOS there; MacCtrl is the Control key.
 */
export const toFirefoxShortcut = (combo: KeyCombo, mac: boolean): string => {
  const parts: string[] = [];
  if (mac ? combo.meta : combo.ctrl) parts.push('Ctrl');
  if (mac && combo.ctrl) parts.push('MacCtrl');
  if (combo.alt) parts.push('Alt');
  if (combo.shift) parts.push('Shift');
  return [...parts, firefoxKeyName(combo)].join('+');
};

const firefoxKeyName = (combo: KeyCombo): string => {
  const { code } = combo;
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit\d$/.test(code)) return code.slice(5);
  if (/^F\d{1,2}$/.test(code)) return code;
  const names: Record<string, string> = {
    Comma: 'Comma',
    Period: 'Period',
    Space: 'Space',
    Home: 'Home',
    End: 'End',
    PageUp: 'PageUp',
    PageDown: 'PageDown',
    Insert: 'Insert',
    Delete: 'Delete',
    ArrowUp: 'Up',
    ArrowDown: 'Down',
    ArrowLeft: 'Left',
    ArrowRight: 'Right',
  };
  return names[code] ?? code;
};

/** Keys Firefox accepts in a command shortcut (letters, digits, F1-F12, these). */
export const isFirefoxKey = (combo: KeyCombo): boolean =>
  /^(Key[A-Z]|Digit\d|F([1-9]|1[0-2]))$/.test(combo.code) ||
  [
    'Comma',
    'Period',
    'Space',
    'Home',
    'End',
    'PageUp',
    'PageDown',
    'Insert',
    'Delete',
    'ArrowUp',
    'ArrowDown',
    'ArrowLeft',
    'ArrowRight',
  ].includes(combo.code);

/** Keys with the primary modifier that the browser keeps for itself. */
const RESERVED_WITH_PRIMARY = new Set([
  'KeyT',
  'KeyW',
  'KeyN',
  'KeyQ',
  'KeyR',
  'KeyL',
  'Tab',
  'PageUp',
  'PageDown',
  ...Array.from({ length: 9 }, (_, i) => `Digit${i + 1}`),
]);

export type ComboProblem =
  | 'no-modifier'
  | 'no-key'
  | 'reserved'
  | 'unsupported-key';

export const COMBO_PROBLEM_TEXT: Record<ComboProblem, string> = {
  'no-modifier': 'Use Ctrl, Alt or ⌘ with a key',
  'no-key': 'Add a key that is not a modifier',
  reserved: 'The browser keeps this shortcut',
  'unsupported-key': 'This key cannot be used',
};

/**
 * Why a combo cannot be the clip shortcut, or null. Needs one of Ctrl/Alt/
 * Meta (Shift alone would fire while typing capital letters), a main key, and
 * none of the browser's own shortcuts.
 */
export const comboProblem = (
  combo: KeyCombo,
  mac: boolean,
): ComboProblem | null => {
  if (!combo.code || isModifierCode(combo.code)) return 'no-key';
  if (!combo.ctrl && !combo.alt && !combo.meta) return 'no-modifier';
  const primary = mac ? combo.meta : combo.ctrl;
  if (primary && !combo.alt && RESERVED_WITH_PRIMARY.has(combo.code)) {
    return 'reserved';
  }
  // Ctrl+Tab / Ctrl+Shift+Tab switch tabs on every platform.
  if (combo.ctrl && combo.code === 'Tab') return 'reserved';
  if (!mac && combo.alt && combo.code === 'F4') return 'reserved';
  if (mac && combo.meta && combo.code === 'Tab') return 'reserved';
  if (combo.code === 'Escape') return 'unsupported-key';
  return null;
};
