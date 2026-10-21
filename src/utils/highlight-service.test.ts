/**
 * Storage behaviour of HighlightService against fakeBrowser storage
 * (local:highlights). Range restoration (XPath lookup) is not covered here:
 * happy-dom has no XPathResult.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing';
import {
  HighlightService,
  deleteHighlight,
  getHighlightsForUrl,
  updateHighlightNote,
  watchHighlights,
} from './highlight-service';
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

describe('storage functions that do not depend on the page', () => {
  it('getHighlightsForUrl matches the URL exactly, newest first', async () => {
    await seed([
      highlight('old', { createdAt: 1 }),
      highlight('new', { createdAt: 3 }),
      highlight('mid', { createdAt: 2 }),
      // Not the same page: no normalization of the trailing slash, the query
      // or the fragment.
      highlight('slash', { url: 'https://a.example/page/' }),
      highlight('query', { url: 'https://a.example/page?x=1' }),
      highlight('hash', { url: 'https://a.example/page#top' }),
      highlight('elsewhere', { url: 'https://b.example/page' }),
    ]);

    const result = await getHighlightsForUrl('https://a.example/page');

    expect(result.map((h) => h.id)).toEqual(['new', 'mid', 'old']);
    expect(
      await getHighlightsForUrl('https://a.example/page/#nothing'),
    ).toEqual([]);
  });

  it('getHighlightsForUrl leaves the stored order alone', async () => {
    await seed([
      highlight('old', { createdAt: 1 }),
      highlight('new', { createdAt: 2 }),
    ]);

    await getHighlightsForUrl('https://a.example/page');

    expect((await stored()).map((h) => h.id)).toEqual(['old', 'new']);
  });

  it('deleteHighlight deletes by id and does not write for an unknown id', async () => {
    await seed([highlight('a'), highlight('b')]);
    const set = vi.spyOn(fakeBrowser.storage.local, 'set');

    expect((await deleteHighlight('a')).success).toBe(true);
    expect((await stored()).map((h) => h.id)).toEqual(['b']);

    set.mockClear();
    expect(await deleteHighlight('missing')).toMatchObject({
      success: false,
      message: 'Highlight not found',
    });
    expect(set).not.toHaveBeenCalled();
  });

  it('updateHighlightNote sets the note and leaves the rest alone', async () => {
    await seed([highlight('a', { tags: ['t'] }), highlight('b')]);

    const result = await updateHighlightNote('a', '  a new note ');

    expect(result.success).toBe(true);
    const [a, b] = await stored();
    expect(a).toMatchObject({ id: 'a', note: 'a new note', tags: ['t'] });
    expect(result.data).toEqual(a);
    expect(b).toEqual(highlight('b'));
    expect((await updateHighlightNote('missing', 'x')).success).toBe(false);
  });

  it('updateHighlightNote removes the note when it is blank', async () => {
    await seed([highlight('a', { note: 'old note' })]);

    await updateHighlightNote('a', '   ');

    expect((await stored())[0].note).toBeUndefined();
  });

  it('writes on top of what is stored when it writes, not of an earlier read', async () => {
    await seed([highlight('a')]);
    const earlier = await getHighlightsForUrl('https://a.example/page');
    expect(earlier).toHaveLength(1);

    // Another context (the options page, a content script) saves one meanwhile.
    await seed([highlight('a'), highlight('b'), highlight('c')]);

    await updateHighlightNote('a', 'note');
    expect((await stored()).map((h) => h.id)).toEqual(['a', 'b', 'c']);

    await seed([highlight('a'), highlight('b'), highlight('d')]);
    await deleteHighlight('a');
    expect((await stored()).map((h) => h.id)).toEqual(['b', 'd']);

    await seed([highlight('b'), highlight('e')]);
    await HighlightService.updateHighlight('b', { color: 'blue' });
    await HighlightService.updateLastAccessed('b');
    expect((await stored()).map((h) => h.id)).toEqual(['b', 'e']);

    await seed([highlight('b'), highlight('f')]);
    document.body.innerHTML = '<p id="p">x</p>';
    const range = document.createRange();
    range.selectNodeContents(document.getElementById('p')!);
    await HighlightService.saveHighlight(range);
    expect((await stored()).map((h) => h.id).slice(0, 2)).toEqual(['b', 'f']);
    expect(await stored()).toHaveLength(3);
  });

  it('updateLastAccessed touches several highlights in one write', async () => {
    await seed([highlight('a'), highlight('b'), highlight('c')]);
    const set = vi.spyOn(fakeBrowser.storage.local, 'set');

    await HighlightService.updateLastAccessed(['a', 'c', 'missing']);

    expect(set).toHaveBeenCalledTimes(1);
    const [a, b, c] = await stored();
    expect(a.lastAccessedAt).toBeGreaterThan(1);
    expect(b.lastAccessedAt).toBe(1);
    expect(c.lastAccessedAt).toBeGreaterThan(1);
  });

  it('updateLastAccessed writes nothing when no id is stored', async () => {
    await seed([highlight('a')]);
    const set = vi.spyOn(fakeBrowser.storage.local, 'set');

    await HighlightService.updateLastAccessed(['missing']);

    expect(set).not.toHaveBeenCalled();
  });

  describe('watchHighlights', () => {
    it('reports the new and the previous highlights, from any writer', async () => {
      await seed([highlight('a')]);
      const callback = vi.fn();
      watchHighlights(callback);

      await updateHighlightNote('a', 'note');
      expect(callback).toHaveBeenCalledTimes(1);
      const [current, previous] = callback.mock.calls[0];
      expect(current[0].note).toBe('note');
      expect(previous[0].note).toBeUndefined();

      await seed([]);
      expect(callback).toHaveBeenLastCalledWith([], expect.any(Array));
    });

    it('reports an empty list when the highlights are removed from storage', async () => {
      await seed([highlight('a')]);
      const callback = vi.fn();
      watchHighlights(callback);

      await fakeBrowser.storage.local.remove('highlights');

      expect(callback).toHaveBeenCalledWith([], [highlight('a')]);
    });

    it('stops when the returned function is called', async () => {
      await seed([highlight('a')]);
      const callback = vi.fn();
      const unwatch = watchHighlights(callback);

      unwatch();
      await seed([]);

      expect(callback).not.toHaveBeenCalled();
    });

    it('ignores changes to other storage keys', async () => {
      const callback = vi.fn();
      watchHighlights(callback);

      await fakeBrowser.storage.local.set({ somethingElse: 1 });

      expect(callback).not.toHaveBeenCalled();
    });
  });
});
