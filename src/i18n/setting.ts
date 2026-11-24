import { storage } from '#imports';
import type { UiLanguage } from './language';

/**
 * The language of the extension UI (options page): `auto` follows the
 * browser's UI language (./language.ts). Every context switches when it
 * changes (watchUiLanguage in ./core.ts). Re-exported by src/utils/storage.ts.
 */
export const uiLanguageItem = storage.defineItem<UiLanguage>(
  'local:uiLanguage',
  {
    fallback: 'auto',
  },
);
