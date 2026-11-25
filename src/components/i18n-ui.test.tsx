import { afterEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { i18n } from '@/i18n/react';
import { HighlightList } from './HighlightList';
import { LogseqBlockRow } from './LogseqBlock';
import type { HighlightData } from '@/types/highlight';
import type { LogseqBlockType } from '@/types/logseqBlock';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const highlight: HighlightData = {
  id: 'h1',
  url: 'https://example.com/',
  title: 'Example',
  hostname: 'example.com',
  range: {
    startContainerXPath: '/html',
    endContainerXPath: '/html',
    startOffset: 0,
    endOffset: 5,
    textContent: 'hello',
  },
  createdAt: Date.now(),
  lastAccessedAt: 1,
};

const block = {
  uuid: 'b1',
  html: '<p>buy milk</p>',
  marker: 'TODO',
  page: { name: 'inbox' },
} as unknown as LogseqBlockType;

const switchTo = (language: string) => act(() => i18n.changeLanguage(language));

describe('UI strings in Chinese', () => {
  afterEach(async () => {
    cleanup();
    await switchTo('en');
  });

  it.each([
    ['zh-CN', '编辑备注', '删除高亮', '刚刚'],
    ['zh-TW', '編輯備註', '刪除醒目標示', '剛剛'],
  ])('shows the highlight list in %s', async (language, edit, remove, now) => {
    await switchTo(language);
    render(
      <HighlightList
        highlights={[highlight]}
        onSelect={() => {}}
        onDelete={() => {}}
        onUpdateNote={() => {}}
      />,
    );
    expect(screen.getByRole('button', { name: edit })).toBeTruthy();
    expect(screen.getByRole('button', { name: remove })).toBeTruthy();
    expect(screen.getByText(now)).toBeTruthy();
  });

  it.each([
    ['zh-CN', '标记为 DONE', '在 Logseq 中打开块'],
    ['zh-TW', '標記為 DONE', '在 Logseq 中開啟區塊'],
  ])('shows a result block in %s', async (language, mark, open) => {
    await switchTo(language);
    render(
      <ul>
        <LogseqBlockRow graph="notes" block={block} />
      </ul>,
    );
    expect(screen.getByRole('checkbox', { name: mark })).toBeTruthy();
    expect(screen.getByRole('link', { name: open })).toBeTruthy();
  });
});
