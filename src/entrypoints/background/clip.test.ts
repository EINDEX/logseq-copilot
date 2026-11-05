import { describe, expect, it } from 'vitest';
import { backgroundClipFallback } from './clip';

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
