import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing';
import { templates } from '@/utils/storage';
import { formatLogseqDate } from '@/utils/utils';
import { backgroundClipFallback, clipToLogseq, resolveTemplate } from './clip';

const client = {
  getUserConfig: vi.fn(async () => ({ preferredDateFormat: 'yyyy-MM-dd' })),
  getCurrentPage: vi.fn(async (): Promise<{ name: string } | null> => null),
  appendBlock: vi.fn(async (_page: string, _content: string) => ({})),
};

vi.mock('./logseq/tool', () => ({
  getLogseqService: async () => ({
    client,
    clipBlock: (page: string, content: string) =>
      client.appendBlock(page, content),
  }),
}));

describe('clipToLogseq', () => {
  const useLocation = (clipNoteLocation: string) =>
    templates.setValue([
      {
        name: 'Default',
        content: '{{content}}',
        clipNoteLocation,
        clipNoteCustomPage: 'Inbox',
      },
    ] as never);

  const appendedTo = () => (client.appendBlock.mock.calls[0] as unknown[])[0];
  const today = () => formatLogseqDate(new Date(), 'yyyy-MM-dd');

  beforeEach(() => {
    fakeBrowser.reset();
    vi.clearAllMocks();
  });

  it('clips to the page open in Logseq', async () => {
    await useLocation('currentPage');
    client.getCurrentPage.mockResolvedValueOnce({ name: 'reading list' });
    await clipToLogseq({ data: 'a quote' });
    expect(appendedTo()).toBe('reading list');
  });

  it("clips to today's journal when no page is open (Journals home)", async () => {
    await useLocation('currentPage');
    client.getCurrentPage.mockResolvedValueOnce(null);
    await clipToLogseq({ data: 'a quote' });
    expect(appendedTo()).toBe(today());
  });

  it("clips to today's journal", async () => {
    await useLocation('journal');
    await clipToLogseq({ data: 'a quote' });
    expect(appendedTo()).toBe(today());
    expect(client.getCurrentPage).not.toHaveBeenCalled();
  });

  it('clips to the custom page', async () => {
    await useLocation('customPage');
    await clipToLogseq({ data: 'a quote' });
    expect(appendedTo()).toBe('Inbox');
  });
});

describe('clipping with a template', () => {
  const list = [
    { id: 'default', name: 'Clip', content: 'A {{content}}' },
    { id: 'mine', name: 'Mine', content: 'B {{content}}' },
  ];
  const clippedText = () => (client.appendBlock.mock.calls[0] as unknown[])[1];

  beforeEach(() => {
    fakeBrowser.reset();
    vi.clearAllMocks();
  });

  it('resolves no template id to the first template', () => {
    expect(resolveTemplate(list)).toBe(list[0]);
  });

  it('resolves a template id to that template', () => {
    expect(resolveTemplate(list, 'mine')).toBe(list[1]);
  });

  it('falls back to the built-in Task when the user deleted it', () => {
    expect(resolveTemplate(list, 'task')).toMatchObject({
      id: 'task',
      content: 'TODO [{{title}}]({{url}})\n{{content}}',
    });
  });

  it('falls back to the first template for any other missing id', () => {
    expect(resolveTemplate(list, 'gone')).toBe(list[0]);
  });

  it('clips with the first template without a template id', async () => {
    await templates.setValue(list);
    await clipToLogseq({ data: 'x' });
    expect(clippedText()).toBe('A x');
  });

  it('clips with the template named by id', async () => {
    await templates.setValue(list);
    await clipToLogseq({ data: 'x', templateId: 'mine' });
    expect(clippedText()).toBe('B x');
  });

  it('saves the page as a task with the built-in Task template', async () => {
    await clipToLogseq({
      url: 'https://example.com/a',
      title: 'Example',
      data: '',
      templateId: 'task',
    });
    expect(clippedText()).toBe('TODO [Example](https://example.com/a)');
  });
});

describe('backgroundClipFallback', () => {
  const tab = { url: 'https://example.com/paper.pdf', title: 'paper.pdf' };

  it('clips the selected text the menu click reports, on the page it was made on', () => {
    expect(
      backgroundClipFallback(
        { selectionText: 'a quote', pageUrl: 'https://example.com/paper.pdf#page=2' },
        tab,
      ),
    ).toEqual({
      url: 'https://example.com/paper.pdf#page=2',
      title: 'paper.pdf',
      data: 'a quote',
    });
  });

  it('carries the template id', () => {
    expect(
      backgroundClipFallback({ selectionText: 'q', pageUrl: 'https://a.b/' }, tab, 'task'),
    ).toMatchObject({ data: 'q', templateId: 'task' });
  });

  it('takes the tab URL when the click has no page URL', () => {
    expect(backgroundClipFallback({ selectionText: 'a quote' }, tab)).toEqual({
      url: 'https://example.com/paper.pdf',
      title: 'paper.pdf',
      data: 'a quote',
    });
  });

  it('works without a tab', () => {
    expect(
      backgroundClipFallback({ selectionText: 'a quote', pageUrl: 'https://example.com/' }),
    ).toEqual({ url: 'https://example.com/', title: undefined, data: 'a quote' });
  });

  it.each([
    ['no selection (the clip shortcut, Clip page link)', {}],
    ['an empty selection', { selectionText: '' }],
    ['a blank selection', { selectionText: ' \n ' }],
  ])('has nothing to clip with %s', (_, info) => {
    expect(backgroundClipFallback({ pageUrl: tab.url, ...info }, tab)).toBeUndefined();
  });
});
