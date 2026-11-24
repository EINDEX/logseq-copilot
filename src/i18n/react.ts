// React binding of the UI strings (src/i18n/core.ts, same instance). Not for
// the background: it would bundle React there.
import { initReactI18next } from 'react-i18next';
import { i18n } from './core';

// Before initI18n: i18next initializes its plugins in init().
i18n.use(initReactI18next);

export { Trans, useTranslation } from 'react-i18next';
export * from './core';
