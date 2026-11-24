import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing';

// A fresh module for each test: the one the test setup started is in English
// for good.
const loadCore = async () => {
  vi.resetModules();
  return import('./core');
};

const browserLanguage = (tag: string) =>
  vi.spyOn(fakeBrowser.i18n, 'getUILanguage').mockReturnValue(tag);

describe('i18n core', () => {
  beforeEach(() => {
    fakeBrowser.reset();
    vi.restoreAllMocks();
  });

  it('starts synchronously in the browser language', async () => {
    browserLanguage('zh-TW');
    const { initI18n, t, currentLanguage } = await loadCore();
    void initI18n();
    expect(currentLanguage()).toBe('zh-TW');
    expect(t('options.settings.title')).toBe('設定');
  });

  it('then switches to the stored language', async () => {
    browserLanguage('en-US');
    await fakeBrowser.storage.local.set({ uiLanguage: 'zh-CN' });
    const { initI18n, t, currentLocale } = await loadCore();
    const ready = initI18n();
    expect(t('options.settings.title')).toBe('Settings');
    await ready;
    expect(t('options.settings.title')).toBe('设置');
    expect(currentLocale()).toBe('zh-CN');
  });

  it('stays in the browser language with auto', async () => {
    browserLanguage('zh-SG');
    await fakeBrowser.storage.local.set({ uiLanguage: 'auto' });
    const { initI18n, currentLanguage } = await loadCore();
    await initI18n();
    expect(currentLanguage()).toBe('zh-CN');
  });

  it('starts in English without a browser language API', async () => {
    const { initI18n, currentLanguage, currentLocale } = await loadCore();
    // fakeBrowser.i18n.getUILanguage throws: navigator.language (en-US).
    await initI18n();
    expect(currentLanguage()).toBe('en');
    expect(currentLocale()).toBe('en-US');
  });

  it('returns the same promise on a second init', async () => {
    const { initI18n } = await loadCore();
    expect(initI18n()).toBe(initI18n());
  });

  it('falls back to English for a key a translation lacks', async () => {
    const { i18n, initI18n, t } = await loadCore();
    await initI18n({ language: 'zh-CN' });
    i18n.addResource('en', 'translation', 'test.onlyEnglish', 'Only English');
    expect(t('test.onlyEnglish' as never)).toBe('Only English');
  });

  it('follows the setting, and reports only real changes', async () => {
    browserLanguage('en-US');
    const { initI18n, watchUiLanguage, currentLanguage } = await loadCore();
    await initI18n();
    const onChange = vi.fn();
    const unwatch = watchUiLanguage(onChange);

    await fakeBrowser.storage.local.set({ uiLanguage: 'zh-TW' });
    await vi.waitFor(() => expect(onChange).toHaveBeenCalledWith('zh-TW'));
    expect(currentLanguage()).toBe('zh-TW');

    // Back to auto: the browser is in English.
    await fakeBrowser.storage.local.set({ uiLanguage: 'auto' });
    await vi.waitFor(() => expect(currentLanguage()).toBe('en'));
    expect(onChange).toHaveBeenLastCalledWith('en');

    // English already: no change to report.
    onChange.mockClear();
    await fakeBrowser.storage.local.set({ uiLanguage: 'en' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(onChange).not.toHaveBeenCalled();

    unwatch();
    await fakeBrowser.storage.local.set({ uiLanguage: 'zh-CN' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(currentLanguage()).toBe('en');
  });

  it('keeps a change made while the stored setting was still being read', async () => {
    browserLanguage('en-US');
    await fakeBrowser.storage.local.set({ uiLanguage: 'zh-CN' });
    const { initI18n, watchUiLanguage, currentLanguage } = await loadCore();
    let release!: () => void;
    const get = fakeBrowser.storage.local.get.bind(fakeBrowser.storage.local);
    vi.spyOn(fakeBrowser.storage.local, 'get').mockImplementationOnce(
      async (...args: Parameters<typeof get>) => {
        const value = await get(...args);
        await new Promise<void>((resolve) => (release = resolve));
        return value;
      },
    );
    const ready = initI18n();
    watchUiLanguage();
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    await fakeBrowser.storage.local.set({ uiLanguage: 'zh-TW' });
    await vi.waitFor(() => expect(currentLanguage()).toBe('zh-TW'));
    release();
    await ready;
    expect(currentLanguage()).toBe('zh-TW');
  });
});
