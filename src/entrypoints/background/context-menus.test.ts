import { afterEach, describe, expect, it } from 'vitest';
import { i18n } from '@/i18n/core';
import { buildClipMenus, parseClipMenuId } from './context-menus';

const t = (id: string, name: string) => ({ id, name, content: '' });

describe('buildClipMenus', () => {
  it('builds the three plain items with one template', () => {
    expect(buildClipMenus([t('default', 'Clip')]).map((m) => m.id)).toEqual([
      'clip-with-selection',
      'clip-page',
      'clip-image',
      'open-highlights-sidebar',
    ]);
  });

  it('builds a parent with a child per template with several', () => {
    const menus = buildClipMenus([t('default', 'Clip'), t('task', 'Task')]);
    expect(menus.map((m) => [m.id, m.parentId, m.title])).toEqual([
      ['clip-with-selection', undefined, 'Clip "%s"'],
      ['clip-with-selection:default', 'clip-with-selection', 'Clip'],
      ['clip-with-selection:task', 'clip-with-selection', 'Task'],
      ['clip-page', undefined, 'Clip page link'],
      ['clip-page:default', 'clip-page', 'Clip'],
      ['clip-page:task', 'clip-page', 'Task'],
      ['clip-image', undefined, 'Clip image'],
      ['clip-image:default', 'clip-image', 'Clip'],
      ['clip-image:task', 'clip-image', 'Task'],
      ['open-highlights-sidebar', undefined, 'Open sidebar'],
    ]);
    expect(menus[1].contexts).toEqual(['selection']);
    expect(menus[4].contexts).toEqual(['page']);
    expect(menus[7].contexts).toEqual(['image']);
  });

  it('names a template without a name Untitled', () => {
    const menus = buildClipMenus([t('a', ''), t('b', 'B')]);
    expect(menus[1].title).toBe('Untitled');
  });

  describe('in Chinese', () => {
    afterEach(() => i18n.changeLanguage('en'));

    it('titles the items in the UI language, and keeps the template names', async () => {
      await i18n.changeLanguage('zh-TW');
      const menus = buildClipMenus([t('a', ''), t('task', 'Task')]);
      expect(menus.map((m) => m.title)).toEqual([
        '剪存「%s」',
        '未命名',
        'Task',
        '剪存頁面連結',
        '未命名',
        'Task',
        '剪存圖片',
        '未命名',
        'Task',
        '開啟側邊欄',
      ]);
    });
  });
});

describe('parseClipMenuId', () => {
  it.each([
    ['clip-page', { command: 'page' }],
    ['clip-with-selection', { command: 'selection' }],
    ['clip-page:task', { command: 'page', templateId: 'task' }],
    ['clip-image', { command: 'image' }],
    ['clip-image:task', { command: 'image', templateId: 'task' }],
    ['clip-with-selection:x:y', { command: 'selection', templateId: 'x:y' }],
    ['open-highlights-sidebar', undefined],
    ['clip-pages', undefined],
  ])('%s', (id, expected) => {
    expect(parseClipMenuId(id)).toEqual(expected);
  });
});
