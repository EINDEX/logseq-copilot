// Unit tests run in English whatever the machine's language: their
// assertions read the English copy. A test of another language switches with
// i18n.changeLanguage and switches back (see src/i18n/i18n.test.tsx).
import { vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';

// This file runs before WXT's own test setup, which stubs these too. The
// extension API modules read the global when they load, so stub it first and
// load i18n after.
vi.stubGlobal('chrome', fakeBrowser);
vi.stubGlobal('browser', fakeBrowser);

const { initI18n } = await import('@/i18n/react');
void initI18n({ language: 'en' });
