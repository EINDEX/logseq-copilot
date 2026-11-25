import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { EditorView } from '@codemirror/view';
import { currentCompletions, startCompletion } from '@codemirror/autocomplete';
import { fakeBrowser } from 'wxt/testing';
import { i18n } from '@/i18n/react';
import { templates } from '@/utils/storage';

const sendMessage = vi.hoisted(() => vi.fn());
vi.mock('@/types/messaging', () => ({ sendMessage }));

import TemplatesIndexPage from './pages/templates-index-page';
import TemplateEditPage from './pages/template-edit-page';
import { ClipPreview } from './components/clip-preview';
import { RulesField } from './components/rules-field';
import { TemplateEditor } from './components/template-editor';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const switchTo = (language: string) => act(() => i18n.changeLanguage(language));

const editorView = () =>
  EditorView.findFromDOM(document.querySelector('.cm-editor') as HTMLElement)!;

describe('TemplatesIndexPage', () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });
  afterEach(() => {
    cleanup();
  });

  const renderIndex = () =>
    render(
      <MemoryRouter initialEntries={['/templates']}>
        <Routes>
          <Route path="/templates" element={<TemplatesIndexPage />} />
          <Route path="/template/:id" element={<div>editor</div>} />
        </Routes>
      </MemoryRouter>,
    );

  it('says there are no templates and offers to create one', async () => {
    await templates.setValue([]);
    renderIndex();
    expect(screen.getByText('Loading templates...')).toBeTruthy();
    expect(
      await screen.findByText(
        'You have no clip templates yet. Create one to start clipping.',
      ),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Create template' }));
    await waitFor(async () => {
      expect((await templates.getValue()).map((item) => item.name)).toEqual([
        'New Template 1',
      ]);
    });
  });

  it('opens the first template', async () => {
    await templates.setValue([{ id: 'a', name: 'Alpha', content: 'x' }]);
    renderIndex();
    expect(await screen.findByText('editor')).toBeTruthy();
  });
});

describe('template pages and editor in Chinese', () => {
  beforeEach(async () => {
    fakeBrowser.reset();
    sendMessage.mockReset();
    sendMessage.mockImplementation(async (type: string) =>
      type === 'logseq:graphKind' ? null : [],
    );
    await templates.setValue([
      {
        id: 'a',
        name: 'Alpha',
        content: '- [{{title}}]({{url}})',
        clipNoteLocation: 'customPage',
        clipNoteCustomPage: 'Inbox',
        rules: ['github.com'],
      },
    ]);
  });
  afterEach(async () => {
    cleanup();
    await switchTo('en');
  });

  it.each([
    [
      'zh-CN',
      {
        title: '编辑模板',
        name: '名称',
        saveTo: '保存到',
        journal: '日志',
        pageName: '页面名称',
        rules: '网页规则',
        content: '内容',
        variable: '网页标题',
        remove: '移除 github.com',
        preview: '预览',
      },
    ],
    [
      'zh-TW',
      {
        title: '編輯範本',
        name: '名稱',
        saveTo: '儲存到',
        journal: '日誌',
        pageName: '頁面名稱',
        rules: '網頁規則',
        content: '內容',
        variable: '網頁標題',
        remove: '移除 github.com',
        preview: '預覽',
      },
    ],
  ])('shows the template editing page in %s', async (language, text) => {
    await switchTo(language);
    render(
      <MemoryRouter initialEntries={['/template/a']}>
        <Routes>
          <Route path="/template/:id" element={<TemplateEditPage />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByLabelText(text.name)).toBeTruthy();
    expect(screen.getByRole('heading', { name: text.title })).toBeTruthy();
    expect(screen.getByText(text.saveTo)).toBeTruthy();
    expect(screen.getByRole('button', { name: text.journal })).toBeTruthy();
    expect(screen.getByLabelText(text.pageName)).toBeTruthy();
    expect(screen.getByText(text.rules)).toBeTruthy();
    expect(screen.getByText(text.content)).toBeTruthy();
    expect(screen.getByTitle(text.variable)).toBeTruthy();
    expect(screen.getByRole('button', { name: text.remove })).toBeTruthy();
    expect(screen.getByText(text.preview)).toBeTruthy();
  });

  it.each([
    ['zh-CN', '输入 {{ 添加变量', '+ 属性', '添加属性', '新建 #Zzz', '新建 zz', '大纲', '文本', '只能有一个顶层块'],
    ['zh-TW', '輸入 {{ 新增變數', '+ 屬性', '新增屬性', '新增 #Zzz', '新增 zz', '大綱', '文字', '只能有一個頂層區塊'],
  ])(
    'shows the editor texts in %s',
    async (language, placeholder, addProperty, addPropertyLabel, newTag, newProperty, outline, text, oneRoot) => {
      await switchTo(language);
      const graph = { kind: 'db' as const, properties: [], tags: [] };
      render(<TemplateEditor value="" onChange={() => {}} graph={graph} />);
      expect(document.querySelector('.cm-tpl-placeholder')?.textContent).toBe(placeholder);
      expect(screen.getByRole('button', { name: outline })).toBeTruthy();
      expect(screen.getByRole('button', { name: text })).toBeTruthy();

      cleanup();
      render(
        <TemplateEditor
          value={'- a\n  source:: x\n  - b'}
          onChange={() => {}}
          graph={graph}
        />,
      );
      const button = document.querySelector('.cm-tpl-add-prop');
      expect(button?.textContent).toBe(addProperty);
      expect(button?.getAttribute('aria-label')).toBe(addPropertyLabel);

      const type = async (insert: string) => {
        const head = editorView().state.selection.main.head;
        act(() => {
          editorView().dispatch({
            changes: { from: head, insert },
            selection: { anchor: head + insert.length },
            userEvent: 'input.type',
          });
        });
        await act(async () => {
          await new Promise((resolve) => setTimeout(resolve, 250));
        });
        return currentCompletions(editorView().state).map((option) => option.label);
      };
      expect(await type(' #Zzz')).toEqual([newTag]);
      await type('\n  zz');
      act(() => {
        startCompletion(editorView());
      });
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 250));
      });
      expect(
        currentCompletions(editorView().state).map((option) => option.label),
      ).toContain(newProperty);

      cleanup();
      render(<TemplateEditor value={'- a\n- b'} onChange={() => {}} />);
      expect(screen.getByRole('alert').textContent).toBe(oneRoot);
    },
  );

  it.each([
    ['zh-CN', '没有块', '示例剪藏', '有选中内容', '仅网页'],
    ['zh-TW', '沒有區塊', '範例剪存', '有選取內容', '僅網頁'],
  ])('shows the clip preview in %s', async (language, none, group, withSelection, pageOnly) => {
    await switchTo(language);
    render(<ClipPreview template="- {{content}}" />);
    expect(screen.getByRole('group', { name: group })).toBeTruthy();
    expect(screen.getByRole('button', { name: withSelection })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: pageOnly }));
    expect(screen.getByRole('button', { name: pageOnly }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText(none)).toBeTruthy();
  });

  it.each([
    ['zh-CN', '添加网址模式', '网址模式', '移除 a.com', '不能包含空格'],
    ['zh-TW', '新增網址模式', '網址模式', '移除 a.com', '不能包含空格'],
  ])('shows the page rules field in %s', async (language, add, patterns, remove, invalid) => {
    await switchTo(language);
    render(<RulesField value={['a.com']} onChange={() => {}} />);
    expect(screen.getByRole('list', { name: patterns })).toBeTruthy();
    expect(screen.getByRole('button', { name: remove })).toBeTruthy();
    expect((screen.getByRole('button', { name: add }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'a b' } });
    expect(screen.getByRole('alert').textContent).toBe(invalid);
  });
});
