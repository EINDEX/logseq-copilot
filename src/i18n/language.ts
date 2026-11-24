/** A language the extension UI is translated into. */
export type Language = 'en' | 'zh-CN' | 'zh-TW';

/** The UI language setting: a language, or the browser's. */
export type UiLanguage = 'auto' | Language;

export const LANGUAGES: readonly Language[] = ['en', 'zh-CN', 'zh-TW'];

export const UI_LANGUAGES: readonly UiLanguage[] = ['auto', ...LANGUAGES];

/**
 * Each language's name in that language, for the language selector. Not
 * translated: a reader finds their language by its own name.
 */
export const LANGUAGE_NAMES: Record<Language, string> = {
  en: 'English',
  'zh-CN': '简体中文',
  'zh-TW': '繁體中文',
};

/**
 * The language for a browser UI language tag (`browser.i18n.getUILanguage()`,
 * `navigator.language`): Simplified Chinese for China and Singapore, and any
 * `zh-Hans`; Traditional Chinese for Taiwan, Hong Kong and Macau, and any
 * `zh-Hant`; English for everything else, a bare `zh` too. Case and `_` or
 * `-` do not matter.
 */
export const languageForBrowser = (
  tag: string | undefined | null,
): Language => {
  const parts = (tag ?? '').trim().toLowerCase().split(/[-_]/);
  if (parts[0] !== 'zh' || parts.length < 2) return 'en';
  const rest = parts.slice(1);
  if (rest.includes('hant')) return 'zh-TW';
  if (rest.includes('hans')) return 'zh-CN';
  const region = rest[0];
  if (region === 'cn' || region === 'sg') return 'zh-CN';
  if (region === 'tw' || region === 'hk' || region === 'mo') return 'zh-TW';
  return 'en';
};

/** A stored setting, or `auto` for anything that is not one. */
export const parseUiLanguage = (value: unknown): UiLanguage =>
  UI_LANGUAGES.includes(value as UiLanguage) ? (value as UiLanguage) : 'auto';

/** The language a setting asks for, given the browser's UI language tag. */
export const resolveUiLanguage = (
  setting: unknown,
  browserTag: string | undefined | null,
): Language => {
  const parsed = parseUiLanguage(setting);
  return parsed === 'auto' ? languageForBrowser(browserTag) : parsed;
};

/**
 * The BCP 47 locale for `Intl` and `toLocale*String` in a language. English
 * is `en-US`: dates read as they did before the UI was translated.
 */
export const intlLocale = (language: string | undefined): string =>
  language === 'zh-CN' || language === 'zh-TW' ? language : 'en-US';
