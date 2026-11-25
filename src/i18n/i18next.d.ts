import 'i18next';
import type en from '@/locales/en.json';

// Typed keys: t('…') only takes keys of the English file, so `pnpm typecheck`
// fails on a misspelled or missing key.
declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation';
    resources: { translation: typeof en };
    returnNull: false;
    returnEmptyString: false;
  }
}
