import { expect, test } from './fixtures';
import { googleUrl } from './pages';

/**
 * The UI language setting (options page) switches every context at once:
 * the options page itself and the UI a content script drew on a page that
 * was already open. The other specs run in English (the default, `auto`, in
 * an English browser).
 */
test.describe('UI language', () => {
  test('switching to Simplified Chinese translates the options page and an open page', async ({
    page,
    ext,
  }) => {
    await ext.connect();
    // A query no note mentions: the card says there is nothing.
    await page.goto(googleUrl('zzqxnomatch'));
    const card = page.locator('#rhs logseq-copilot-search-engine');
    await expect(card.getByText('No related notes in Logseq')).toBeVisible();

    const options = await ext.openPage('options.html#/settings');
    await options.expectText('Language');
    await options.click('#ui-language-zh-CN');

    await expect.poll(() => ext.getStorage('uiLanguage')).toBe('zh-CN');
    await options.expectText('管理 Logseq Copilot 扩展的各项设置。');
    await options.expectText('语言');
    // The open page switched without a reload.
    await expect(card.getByText('Logseq 中没有相关笔记')).toBeVisible();
    await expect(card.getByText('No related notes in Logseq')).toHaveCount(0);
  });
});
