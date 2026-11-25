import { describe, expect, it } from 'vitest';
import {
  intlLocale,
  languageForBrowser,
  parseUiLanguage,
  resolveUiLanguage,
} from './language';

describe('languageForBrowser', () => {
  it.each([
    ['zh-CN', 'zh-CN'],
    ['zh-SG', 'zh-CN'],
    ['zh-Hans', 'zh-CN'],
    ['zh-Hans-CN', 'zh-CN'],
    ['zh-Hans-HK', 'zh-CN'],
    ['zh-TW', 'zh-TW'],
    ['zh-HK', 'zh-TW'],
    ['zh-MO', 'zh-TW'],
    ['zh-Hant', 'zh-TW'],
    ['zh-Hant-TW', 'zh-TW'],
    ['zh-Hant-CN', 'zh-TW'],
    // Case and separator.
    ['zh_CN', 'zh-CN'],
    ['ZH-cn', 'zh-CN'],
    ['zh_tw', 'zh-TW'],
    ['zh_hant_hk', 'zh-TW'],
    [' zh-TW ', 'zh-TW'],
    // Everything else is English, a bare zh too.
    ['zh', 'en'],
    ['zh-', 'en'],
    ['zh-US', 'en'],
    ['en', 'en'],
    ['en-US', 'en'],
    ['ja', 'en'],
    ['fr-FR', 'en'],
    ['', 'en'],
    [undefined, 'en'],
    [null, 'en'],
  ])('%s → %s', (tag, language) => {
    expect(languageForBrowser(tag)).toBe(language);
  });
});

describe('parseUiLanguage', () => {
  it.each(['auto', 'en', 'zh-CN', 'zh-TW'])('keeps %s', (value) => {
    expect(parseUiLanguage(value)).toBe(value);
  });

  it.each([undefined, null, '', 'zh', 'zh-cn', 'de', 42])(
    'reads %s as auto',
    (value) => {
      expect(parseUiLanguage(value)).toBe('auto');
    },
  );
});

describe('resolveUiLanguage', () => {
  it('follows the browser with auto', () => {
    expect(resolveUiLanguage('auto', 'zh-HK')).toBe('zh-TW');
    expect(resolveUiLanguage('auto', 'de-DE')).toBe('en');
  });

  it('takes a chosen language over the browser', () => {
    expect(resolveUiLanguage('en', 'zh-CN')).toBe('en');
    expect(resolveUiLanguage('zh-CN', 'en-US')).toBe('zh-CN');
  });

  it('follows the browser with a value that is no setting', () => {
    expect(resolveUiLanguage('klingon', 'zh-CN')).toBe('zh-CN');
  });
});

describe('intlLocale', () => {
  it('formats English as before, en-US', () => {
    expect(intlLocale('en')).toBe('en-US');
    expect(intlLocale(undefined)).toBe('en-US');
  });

  it('keeps the Chinese languages', () => {
    expect(intlLocale('zh-CN')).toBe('zh-CN');
    expect(intlLocale('zh-TW')).toBe('zh-TW');
  });
});
