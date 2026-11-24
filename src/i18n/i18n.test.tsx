// The UI in Chinese: the language selector and copy of each context.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { fakeBrowser } from 'wxt/testing';
import { LanguageOptions } from '@/entrypoints/options/components/LanguageOptions';
import { RecallCard } from '@/components/recall/RecallCard';
import { i18n, watchUiLanguage } from './react';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const radio = (name: string) => screen.findByRole('radio', { name });

describe('the UI in Chinese', () => {
  beforeEach(() => fakeBrowser.reset());

  afterEach(async () => {
    cleanup();
    await act(() => i18n.changeLanguage('en'));
  });

  it('shows the language selector in English, each language named in itself', async () => {
    render(<LanguageOptions />);
    expect(await radio('Auto')).toBeTruthy();
    expect(screen.getByText('Language')).toBeTruthy();
    for (const name of ['English', '简体中文', '繁體中文']) {
      expect(await radio(name)).toBeTruthy();
    }
    expect((await radio('Auto')).getAttribute('aria-checked')).toBe('true');
  });

  it.each([
    ['zh-CN', '语言', '自动'],
    ['zh-TW', '語言', '自動'],
  ])('shows the language selector in %s', async (language, label, auto) => {
    await act(() => i18n.changeLanguage(language));
    render(<LanguageOptions />);
    expect(screen.getByText(label)).toBeTruthy();
    expect(await radio(auto)).toBeTruthy();
    // The names do not change with the language.
    for (const name of ['English', '简体中文', '繁體中文']) {
      expect(await radio(name)).toBeTruthy();
    }
    expect(screen.getByText('简体中文').getAttribute('lang')).toBe('zh-CN');
  });

  it('saves the choice, and the UI switches to it', async () => {
    const unwatch = watchUiLanguage();
    render(<LanguageOptions />);
    const traditional = await radio('繁體中文');
    // The selector is disabled until the stored setting is read.
    await waitFor(() => expect(traditional.hasAttribute('disabled')).toBe(false));
    await act(async () => {
      fireEvent.click(traditional);
    });
    await screen.findByText('語言');
    expect((await fakeBrowser.storage.local.get('uiLanguage')).uiLanguage).toBe(
      'zh-TW',
    );
    expect(traditional.getAttribute('aria-checked')).toBe('true');
    unwatch();
  });

  it.each([
    ['zh-CN', 'Logseq 中没有相关笔记', '无法连接到 Logseq。', '检查连接'],
    ['zh-TW', 'Logseq 中沒有相關筆記', '無法連線到 Logseq。', '檢查連線'],
  ])('shows the search card in %s', async (language, empty, failed, check) => {
    await act(() => i18n.changeLanguage(language));
    const props = { terms: [], onOpenOptions: () => {} };
    const { rerender } = render(<RecallCard state="success" {...props} />);
    expect(screen.getByRole('status').textContent).toBe(empty);
    rerender(<RecallCard state="error" {...props} />);
    expect(screen.getByRole('status').textContent).toContain(failed);
    expect(screen.getByRole('button', { name: check })).toBeTruthy();
  });

  it('switches a shown card when the language changes', async () => {
    render(<RecallCard state="success" terms={[]} onOpenOptions={() => {}} />);
    expect(screen.getByRole('status').textContent).toBe(
      'No related notes in Logseq',
    );
    await act(() => i18n.changeLanguage('zh-TW'));
    expect(screen.getByRole('status').textContent).toBe(
      'Logseq 中沒有相關筆記',
    );
  });
});
