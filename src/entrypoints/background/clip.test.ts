import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing';
import { templates } from '@/utils/storage';
import { formatLogseqDate } from '@/utils/utils';
import { backgroundClipFallback, clipToLogseq } from './clip';

const client = {
  getUserConfig: vi.fn(async () => ({ preferredDateFormat: 'yyyy-MM-dd' })),
  getCurrentPage: vi.fn(async (): Promise<{ name: string } | null> => null),
  appendBlock: vi.fn(async () => ({})),
};

vi.mock('./logseq/tool', () => ({
  getLogseqService: async () => ({ client }),
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
