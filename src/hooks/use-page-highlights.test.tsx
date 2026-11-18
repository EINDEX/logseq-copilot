import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { fakeBrowser } from 'wxt/testing';
import type { HighlightData } from '@/types/highlight';
import log from '@/utils/logger';
const sendMessage = vi.hoisted(() => vi.fn());
vi.mock('@/types/messaging', () => ({
  sendMessage: (...args: unknown[]) => sendMessage(...args),
}));

import { usePageHighlights } from './use-page-highlights';

const PAGE = 'https://one.example/page';
const OTHER = 'https://two.example/article';

const highlight = (
  id: string,
  overrides: Partial<HighlightData> = {},
): HighlightData => ({
  id,
  url: PAGE,
  title: 'Page one',
  hostname: 'one.example',
  range: {
    startContainerXPath: '/html/body[1]/p[1]',
    endContainerXPath: '/html/body[1]/p[1]',
    startOffset: 0,
    endOffset: 5,
    textContent: `text of ${id}`,
  },
  createdAt: 1,
  lastAccessedAt: 1,
  ...overrides,
});

const seed = (items: HighlightData[]) =>
  fakeBrowser.storage.local.set({ highlights: items });

const stored = async (): Promise<HighlightData[]> =>
  ((await fakeBrowser.storage.local.get('highlights')).highlights ??
    []) as HighlightData[];

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
};

const ids = (items: HighlightData[] | null) => items?.map((h) => h.id) ?? null;

describe('usePageHighlights', () => {
  beforeEach(() => {
    fakeBrowser.reset();
    sendMessage.mockReset().mockResolvedValue([]);
    vi.spyOn(log, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('reads the highlights of exactly this url, newest first', async () => {
    await seed([
      highlight('old', { createdAt: 1 }),
      highlight('new', { createdAt: 2 }),
      highlight('elsewhere', { url: OTHER }),
      highlight('other-hash', { url: `${PAGE}#intro` }),
    ]);

    const { result } = renderHook(() => usePageHighlights(PAGE));

    expect(result.current.highlights).toBeNull();
    await waitFor(() =>
      expect(ids(result.current.highlights)).toEqual(['new', 'old']),
    );
  });

  it('has none without a url', async () => {
    await seed([highlight('a')]);

    const { result } = renderHook(() => usePageHighlights(null));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(result.current.highlights).toBeNull();
  });

  it('follows storage changes from any context', async () => {
    await seed([highlight('a')]);
    const { result } = renderHook(() => usePageHighlights(PAGE));
    await waitFor(() => expect(ids(result.current.highlights)).toEqual(['a']));

    await act(() => seed([highlight('a'), highlight('b', { createdAt: 2 })]));

    await waitFor(() =>
      expect(ids(result.current.highlights)).toEqual(['b', 'a']),
    );
  });

  it('reads again for a new url, and drops the notice', async () => {
    await seed([highlight('a'), highlight('b', { url: OTHER })]);
    const { result, rerender } = renderHook(
      ({ url }) => usePageHighlights(url),
      { initialProps: { url: PAGE } },
    );
    await waitFor(() => expect(ids(result.current.highlights)).toEqual(['a']));
    act(() => result.current.setNotice('Something happened'));

    rerender({ url: OTHER });

    await waitFor(() => expect(ids(result.current.highlights)).toEqual(['b']));
    expect(result.current.notice).toBeNull();
  });

  it('ignores a slow read for the url it left', async () => {
    await seed([highlight('a'), highlight('b', { url: OTHER })]);
    const { result, rerender } = renderHook(
      ({ url }) => usePageHighlights(url),
      { initialProps: { url: PAGE } },
    );
    await waitFor(() => expect(ids(result.current.highlights)).toEqual(['a']));

    const slow = deferred<Record<string, unknown>>();
    vi.spyOn(fakeBrowser.storage.local, 'get').mockImplementationOnce(
      () => slow.promise as never,
    );
    await act(() =>
      seed([highlight('a'), highlight('a2'), highlight('b', { url: OTHER })]),
    );
    rerender({ url: OTHER });
    await waitFor(() => expect(ids(result.current.highlights)).toEqual(['b']));

    await act(async () =>
      slow.resolve({ highlights: [highlight('a'), highlight('a2')] }),
    );

    expect(ids(result.current.highlights)).toEqual(['b']);
  });

  it('deletes a highlight from storage', async () => {
    await seed([highlight('a'), highlight('b', { url: OTHER })]);
    const { result } = renderHook(() => usePageHighlights(PAGE));
    await waitFor(() => expect(ids(result.current.highlights)).toEqual(['a']));

    await act(() => result.current.deleteHighlight('a'));

    expect(ids(await stored())).toEqual(['b']);
    await waitFor(() => expect(ids(result.current.highlights)).toEqual([]));
    expect(result.current.notice).toBeNull();
  });

  it('says so when a highlight could not be deleted', async () => {
    await seed([highlight('a')]);
    const { result } = renderHook(() => usePageHighlights(PAGE));
    await waitFor(() => expect(ids(result.current.highlights)).toEqual(['a']));
    vi.spyOn(fakeBrowser.storage.local, 'set').mockRejectedValue(
      new Error('storage is full'),
    );

    await act(() => result.current.deleteHighlight('a'));

    expect(result.current.notice).toBe("Couldn't delete the highlight");
  });

  it('saves a note', async () => {
    await seed([highlight('a')]);
    const { result } = renderHook(() => usePageHighlights(PAGE));
    await waitFor(() => expect(ids(result.current.highlights)).toEqual(['a']));

    await act(() => result.current.updateNote('a', 'my thoughts'));

    expect((await stored())[0].note).toBe('my thoughts');
    expect(result.current.notice).toBeNull();
  });

  it('rejects, and says so, when a note could not be saved', async () => {
    await seed([highlight('a')]);
    const { result } = renderHook(() => usePageHighlights(PAGE));
    await waitFor(() => expect(ids(result.current.highlights)).toEqual(['a']));
    vi.spyOn(fakeBrowser.storage.local, 'set').mockRejectedValue(
      new Error('storage is full'),
    );

    await act(async () => {
      await expect(
        result.current.updateNote('a', 'my thoughts'),
      ).rejects.toThrow();
    });

    expect(result.current.notice).toBe("Couldn't save the note");
  });

  describe('clips deleted in Logseq', () => {
    const link = (node: string) => ({ logseq: { graph: 'notes', nodeUuid: node } });
    const checks = () =>
      sendMessage.mock.calls.filter(([type]) => type === 'logseq:checkHighlightLinks');

    it('asks once for all the linked highlights of the page, not for the others', async () => {
      await seed([
        highlight('a', link('n1')),
        highlight('b', link('n2')),
        highlight('c'),
        highlight('d', { url: OTHER, ...link('n3') }),
      ]);
      const { result } = renderHook(() => usePageHighlights(PAGE));
      await waitFor(() => expect(checks()).toHaveLength(1));
      expect([...checks()[0][1].ids].sort()).toEqual(['a', 'b']);

      // A render, or a change that leaves the links as they are, does not ask again.
      await act(() => seed([highlight('a', link('n1')), highlight('b', link('n2')), highlight('c', { note: 'x' })]));
      await waitFor(() => expect(result.current.highlights?.find((h) => h.id === 'c')?.note).toBe('x'));
      expect(checks()).toHaveLength(1);
    });

    it('does not ask without a linked highlight', async () => {
      await seed([highlight('a')]);
      const { result } = renderHook(() => usePageHighlights(PAGE));
      await waitFor(() => expect(ids(result.current.highlights)).toEqual(['a']));
      expect(sendMessage).not.toHaveBeenCalled();
    });

    it('lists the highlights that lost their link', async () => {
      sendMessage.mockResolvedValue(['a']);
      await seed([highlight('a', link('n1')), highlight('b', link('n1'))]);
      const { result } = renderHook(() => usePageHighlights(PAGE));
      await waitFor(() => expect([...result.current.removedFromLogseq]).toEqual(['a']));
      expect(result.current.notice).toBeNull();
    });

    it('lists nothing when Logseq could not be asked', async () => {
      sendMessage.mockRejectedValue(new Error('Cannot connect to Logseq.'));
      await seed([highlight('a', link('n1'))]);
      const { result } = renderHook(() => usePageHighlights(PAGE));
      await waitFor(() => expect(checks()).toHaveLength(1));
      expect(result.current.removedFromLogseq.size).toBe(0);
      expect(result.current.notice).toBeNull();
    });

    it('saves a note locally, with no notice, when the sync finds the clip gone', async () => {
      sendMessage.mockImplementation(async (type: string) =>
        type === 'logseq:syncHighlightNote' ? false : [],
      );
      await seed([highlight('a', link('n1'))]);
      const { result } = renderHook(() => usePageHighlights(PAGE));
      await waitFor(() => expect(ids(result.current.highlights)).toEqual(['a']));

      await act(() => result.current.updateNote('a', 'my thoughts'));

      expect((await stored())[0].note).toBe('my thoughts');
      expect(result.current.notice).toBeNull();
      expect([...result.current.removedFromLogseq]).toEqual(['a']);
    });
  });
});
