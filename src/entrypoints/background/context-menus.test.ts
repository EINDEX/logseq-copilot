import { describe, expect, it } from 'vitest';
import { buildClipMenus, parseClipMenuId } from './context-menus';

const t = (id: string, name: string) => ({ id, name, content: '' });

describe('buildClipMenus', () => {
  it('builds the two plain items with one template', () => {
    expect(buildClipMenus([t('default', 'Clip')]).map((m) => m.id)).toEqual([
      'clip-with-selection',
      'clip-page',
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
      ['open-highlights-sidebar', undefined, 'Open sidebar'],
    ]);
    expect(menus[1].contexts).toEqual(['selection']);
    expect(menus[4].contexts).toEqual(['page']);
  });

  it('names a template without a name Untitled', () => {
    const menus = buildClipMenus([t('a', ''), t('b', 'B')]);
    expect(menus[1].title).toBe('Untitled');
  });
});

describe('parseClipMenuId', () => {
  it.each([
    ['clip-page', { command: 'page' }],
    ['clip-with-selection', { command: 'selection' }],
    ['clip-page:task', { command: 'page', templateId: 'task' }],
    ['clip-with-selection:x:y', { command: 'selection', templateId: 'x:y' }],
    ['open-highlights-sidebar', undefined],
    ['clip-pages', undefined],
  ])('%s', (id, expected) => {
    expect(parseClipMenuId(id)).toEqual(expected);
  });
});
