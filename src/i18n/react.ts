// React binding of the UI strings (src/i18n/core.ts, same instance). Not for
// the background: it would bundle React there.
import { initReactI18next } from 'react-i18next';
import { i18n } from './core';

// core.ts initializes the instance at load, before this runs, so register the
// binding by hand (what `i18n.use(initReactI18next)` does inside init()).
initReactI18next.init(i18n);

export { Trans, useTranslation } from 'react-i18next';
export * from './core';
