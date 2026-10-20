/**
 * Storage behaviour of HighlightService against fakeBrowser storage
 * (local:highlights). Range restoration (XPath lookup) is not covered here:
 * happy-dom has no XPathResult.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing';
import { HighlightService } from './highlight-service';
import type { HighlightData } from '@/types/highlight';

const highlight = (
  id: string,
  overrides: Partial<HighlightData> = {},
): HighlightData => ({
  id,
  url: 'https://a.example/page',
  title: 'A',
  hostname: 'a.example',
  range: {
    startContainerXPath: '/html/body[1]/p[1]',
    endContainerXPath: '/html/body[1]/p[1]',
    startOffset: 0,
    endOffset: 1,
    textContent: id,
  },
  createdAt: 1,
  lastAccessedAt: 1,
  ...overrides,
});

const stored = async (): Promise<HighlightData[]> =>
  ((await fakeBrowser.storage.local.get('highlights')).highlights ??
    []) as HighlightData[];

const seed = (items: HighlightData[]) =>
  fakeBrowser.storage.local.set({ highlights: items });

beforeEach(() => {
  fakeBrowser.reset();
  document.body.innerHTML = '';
});

describe('HighlightService storage', () => {
  it('returns an empty list when nothing is stored', async () => {
    expect(await HighlightService.getHighlights()).toEqual([]);
  });

  it('saves a highlight for the current page', async () => {
    document.title = 'Doc';
    document.body.innerHTML = '<p id="p">hello world</p>';
    const range = document.createRange();
    range.selectNodeContents(document.getElementById('p')!);

    const result = await HighlightService.saveHighlight(range, 'a note');

    expect(result.success).toBe(true);
    const [saved] = await stored();
    expect(saved).toMatchObject({
      url: window.location.href,
      hostname: window.location.hostname,
      title: 'Doc',
      note: 'a note',
      color: 'yellow',
    });
    expect(saved.range.textContent).toBe('hello world');
    expect(result.data).toEqual(saved);
  });

  it('appends to existing highlights', async () => {
    await seed([highlight('old')]);
    document.body.innerHTML = '<p id="p">x</p>';
    const range = document.createRange();
    range.selectNodeContents(document.getElementById('p')!);

    await HighlightService.saveHighlight(range);

    expect((await stored()).map((h) => h.id)[0]).toBe('old');
    expect(await stored()).toHaveLength(2);
  });

  it('filters by url, hostname and tags', async () => {
    await seed([
      highlight('a', { tags: ['x'] }),
      highlight('b', { url: 'https://b.example/', hostname: 'b.example' }),
      highlight('c', { tags: ['y'] }),
    ]);

    const ids = (items: HighlightData[]) => items.map((h) => h.id).sort();
    expect(ids(await HighlightService.getHighlights({ url: 'https://b.example/' }))).toEqual(['b']);
    expect(ids(await HighlightService.getHighlights({ hostname: 'a.example' }))).toEqual(['a', 'c']);
    expect(ids(await HighlightService.getHighlights({ tags: ['y'] }))).toEqual(['c']);
  });

  it('sorts (desc by createdAt by default) and limits', async () => {
    await seed([
      highlight('old', { createdAt: 1, lastAccessedAt: 30 }),
      highlight('new', { createdAt: 3, lastAccessedAt: 10 }),
      highlight('mid', { createdAt: 2, lastAccessedAt: 20 }),
    ]);

    expect((await HighlightService.getHighlights()).map((h) => h.id)).toEqual([
      'new',
      'mid',
      'old',
    ]);
    expect(
      (
        await HighlightService.getHighlights({
          sortBy: 'lastAccessedAt',
          sortOrder: 'asc',
          limit: 2,
        })
      ).map((h) => h.id),
    ).toEqual(['new', 'mid']);
  });

  it('getCurrentPageHighlights only returns highlights of this URL', async () => {
    await seed([
      highlight('here', { url: window.location.href }),
      highlight('elsewhere', { url: 'https://other.example/' }),
    ]);

    const result = await HighlightService.getCurrentPageHighlights();

    expect(result.map((h) => h.id)).toEqual(['here']);
  });

  it('deletes a highlight by id and reports unknown ids', async () => {
    await seed([highlight('a'), highlight('b')]);

    expect((await HighlightService.deleteHighlight('a')).success).toBe(true);
    expect((await stored()).map((h) => h.id)).toEqual(['b']);

    expect(await HighlightService.deleteHighlight('missing')).toMatchObject({
      success: false,
      message: 'Highlight not found',
    });
    expect(await stored()).toHaveLength(1);
  });

  it('updates note/tags/color and bumps lastAccessedAt', async () => {
    await seed([highlight('a'), highlight('b')]);

    const result = await HighlightService.updateHighlight('a', {
      note: 'new note',
      tags: ['t'],
    });

    expect(result.success).toBe(true);
    const [a, b] = await stored();
    expect(a).toMatchObject({ id: 'a', note: 'new note', tags: ['t'] });
    expect(a.lastAccessedAt).toBeGreaterThan(1);
    expect(b).toEqual(highlight('b'));

    expect((await HighlightService.updateHighlight('missing', { note: 'x' })).success).toBe(false);
  });

  it('clears all highlights, or only the matching ones', async () => {
    await seed([
      highlight('a'),
      highlight('b', { hostname: 'b.example' }),
    ]);

    await HighlightService.clearHighlights({ hostname: 'a.example' });
    expect((await stored()).map((h) => h.id)).toEqual(['b']);

    await HighlightService.clearHighlights();
    expect(await stored()).toEqual([]);
  });
});
