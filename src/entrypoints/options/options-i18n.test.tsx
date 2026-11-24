import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { fakeBrowser } from 'wxt/testing';
import { i18n } from '@/i18n/react';
import { ClipNoteOptions } from './components/ClipNote';
import { ExperimentalOptions } from './components/ExperimentalOptions';
import CustomSearchEngineForm from './components/CustomSearchEngineForm';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const switchTo = (language: string) => act(() => i18n.changeLanguage(language));

describe('options page strings in Chinese', () => {
  beforeEach(() => {
    fakeBrowser.reset();
    (fakeBrowser.commands as any).getAll = async () => [];
  });
  afterEach(async () => {
    cleanup();
    await switchTo('en');
  });

  it.each([
    ['zh-CN', '剪藏备注', '悬浮按钮', '实验性功能', '把图片保存到 Logseq'],
    ['zh-TW', '剪存備註', '浮動按鈕', '實驗性功能', '把圖片儲存到 Logseq'],
  ])('shows the settings sections in %s', async (language, clip, floating, experimental, images) => {
    await switchTo(language);
    render(
      <>
        <ClipNoteOptions />
        <ExperimentalOptions />
      </>,
    );
    expect(screen.getByRole('heading', { name: clip })).toBeTruthy();
    expect(screen.getByText(floating)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: experimental }));
    expect(screen.getByRole('switch', { name: images })).toBeTruthy();
  });

  it.each([
    ['zh-CN', '添加自定义搜索引擎', '名称 *', '请填写名称'],
    ['zh-TW', '新增自訂搜尋引擎', '名稱 *', '請填寫名稱'],
  ])('shows the custom search engine form in %s', async (language, add, name, required) => {
    await switchTo(language);
    render(<CustomSearchEngineForm onSave={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: add }));
    expect(screen.getByText(name)).toBeTruthy();
    fireEvent.click(screen.getAllByRole('button', { name: /搜索引擎|搜尋引擎/ }).at(-1)!);
    expect(screen.getByText(required)).toBeTruthy();
  });
});
