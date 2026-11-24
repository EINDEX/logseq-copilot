// The UI strings, without React: the background and non-React code use this
// module, React code uses ./react (same instance). See src/locales/README.md.
import { createInstance } from 'i18next';
import en from '@/locales/en.json';
import zhCN from '@/locales/zh-CN.json';
import zhTW from '@/locales/zh-TW.json';
import { uiLanguageItem } from './setting';
import log from '@/utils/logger';
import { intlLocale, resolveUiLanguage, type Language } from './language';

export const resources = {
  en: { translation: en },
  'zh-CN': { translation: zhCN },
  'zh-TW': { translation: zhTW },
};

/** The one i18next instance of this JS context. */
export const i18n = createInstance();

/** `i18n.t`, for code outside React components. Call it when the text is shown, not at module load. */
export const t: typeof i18n.t = i18n.t.bind(i18n);

/** The language the UI is shown in now. */
export const currentLanguage = (): Language => i18n.language as Language;

/** The `Intl` locale of the UI language: dates and relative times. */
export const currentLocale = (): string => intlLocale(i18n.language);

type ExtensionGlobals = {
  browser?: { i18n?: { getUILanguage?: () => string } };
  chrome?: { i18n?: { getUILanguage?: () => string } };
};

// From the global, not `wxt/browser`: components that render in unit tests
// import this module, and the mock of `wxt/browser` does not load under jsdom.
const browserLanguageTag = (): string | undefined => {
  const { browser, chrome } = globalThis as ExtensionGlobals;
  try {
    return (
      (browser ?? chrome)?.i18n?.getUILanguage?.() ??
      globalThis.navigator?.language
    );
  } catch {
    return globalThis.navigator?.language;
  }
};

let ready: Promise<void> | undefined;
// The setting changed before the first read of it came back: that read may be
// older than the change.
let settingChanged = false;

/** Switches to the language of a setting; true if the language changed. */
const applySetting = async (setting: unknown): Promise<boolean> => {
  const language = resolveUiLanguage(setting, browserLanguageTag());
  if (i18n.language === language) return false;
  await i18n.changeLanguage(language);
  return true;
};

/**
 * Starts i18n in this JS context. Synchronous: `t` works when it returns, in
 * the browser's UI language. The returned promise resolves once the stored
 * setting is applied (a no-op with `auto`); UI need not wait for it, it
 * re-renders on the change. Later calls return the same promise.
 *
 * `language` fixes the language and skips the stored setting (tests).
 */
export const initI18n = (
  options: { language?: Language } = {},
): Promise<void> => {
  if (ready) return ready;
  void i18n.init({
    resources,
    lng: options.language ?? resolveUiLanguage('auto', browserLanguageTag()),
    fallbackLng: 'en',
    // Resources are bundled: init (and changeLanguage) finish synchronously.
    initAsync: false,
    returnNull: false,
    returnEmptyString: false,
    // Every sink of t() is plain text: React text, menu titles, attributes.
    // Never put t() output into innerHTML (src/locales/README.md).
    interpolation: { escapeValue: false },
    react: { useSuspense: false },
  });
  ready = options.language
    ? Promise.resolve()
    : uiLanguageItem
        .getValue()
        .then(async (setting) => {
          if (!settingChanged) await applySetting(setting);
        })
        .catch((error) =>
          log.warn('[i18n] Failed to read the UI language', error),
        );
  return ready;
};

/**
 * Follows the UI language setting in this JS context: every context calls it
 * once, after initI18n. `onChange` runs after a change of language (the
 * background rebuilds its context menus). Register it synchronously at
 * startup in the background (an MV3 service worker). Returns the unwatch
 * function.
 */
export const watchUiLanguage = (
  onChange?: (language: Language) => void,
): (() => void) =>
  uiLanguageItem.watch(async (setting) => {
    settingChanged = true;
    try {
      if (await applySetting(setting)) onChange?.(currentLanguage());
    } catch (error) {
      log.warn('[i18n] Failed to change the UI language', error);
    }
  });

/**
 * Extension pages (options, sidebar): `<html lang>` follows the UI language,
 * so screen readers and CJK fonts get the right one. Not for content
 * scripts: that element is the host page's.
 */
export const followDocumentLanguage = (doc: Document = document): void => {
  const set = (language: string) => {
    doc.documentElement.lang = language;
  };
  set(i18n.language);
  i18n.on('languageChanged', set);
};
