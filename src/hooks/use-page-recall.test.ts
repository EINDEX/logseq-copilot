import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { LogseqSearchResult } from '@/types/logseqBlock';

const sendMessage = vi.hoisted(() => vi.fn());
vi.mock('@/types/messaging', () => ({ sendMessage }));

import { usePageRecall } from './use-page-recall';

const resultFor = (graph: string): LogseqSearchResult => ({
  graph,
  pages: [],
  blocks: [],
});

const ok = (graph: string) => ({ status: 200, msg: '', response: resultFor(graph) });

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

const searchedUrls = () =>
  sendMessage.mock.calls
    .filter(([type]) => type === 'logseq:urlSearch')
    .map(([, data]) => data.url);

describe('usePageRecall', () => {
  beforeEach(() => {
    sendMessage.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it('searches the page and gives its result', async () => {
    sendMessage.mockResolvedValue(ok('notes'));

    const { result } = renderHook(() => usePageRecall('https://one.example/'));

    expect(result.current.loading).toBe(true);
    expect(result.current.result).toBeNull();
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.result?.graph).toBe('notes');
    expect(result.current.error).toBeNull();
    expect(searchedUrls()).toEqual(['https://one.example/']);
  });

  it('searches again when the url changes', async () => {
    sendMessage.mockImplementation(async (_type, { url }) =>
      ok(url.includes('two') ? 'two' : 'one'),
    );

    const { result, rerender } = renderHook(({ url }) => usePageRecall(url), {
      initialProps: { url: 'https://one.example/' },
    });
    await waitFor(() => expect(result.current.result?.graph).toBe('one'));

    rerender({ url: 'https://two.example/' });

    // The result of the other page is gone at once.
    expect(result.current.result).toBeNull();
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.result?.graph).toBe('two'));
    expect(searchedUrls()).toEqual(['https://one.example/', 'https://two.example/']);
  });

  it('drops the result of a search that is no longer the latest', async () => {
    const first = deferred<ReturnType<typeof ok>>();
    const second = deferred<ReturnType<typeof ok>>();
    sendMessage.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);

    const { result, rerender } = renderHook(({ url }) => usePageRecall(url), {
      initialProps: { url: 'https://one.example/' },
    });
    rerender({ url: 'https://two.example/' });

    await act(async () => second.resolve(ok('two')));
    expect(result.current.result?.graph).toBe('two');

    await act(async () => first.resolve(ok('one')));
    expect(result.current.result?.graph).toBe('two');
    expect(result.current.loading).toBe(false);
  });

  it('gives the message of a failed search', async () => {
    sendMessage.mockResolvedValue({
      status: 500,
      msg: 'Cannot connect to Logseq',
      response: undefined,
    });

    const { result } = renderHook(() => usePageRecall('https://one.example/'));

    await waitFor(() => expect(result.current.error).toBe('Cannot connect to Logseq'));
    expect(result.current.loading).toBe(false);
    expect(result.current.result).toBeNull();
  });

  it('gives the message of a search that throws', async () => {
    sendMessage.mockRejectedValue(new Error('No background'));

    const { result } = renderHook(() => usePageRecall('https://one.example/'));

    await waitFor(() => expect(result.current.error).toBe('No background'));
  });

  it('searches the same page again on retry', async () => {
    sendMessage
      .mockResolvedValueOnce({ status: 500, msg: 'Cannot connect to Logseq', response: undefined })
      .mockResolvedValueOnce(ok('notes'));

    const { result } = renderHook(() => usePageRecall('https://one.example/'));
    await waitFor(() => expect(result.current.error).not.toBeNull());

    act(() => result.current.retry());

    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.result?.graph).toBe('notes'));
    expect(searchedUrls()).toEqual(['https://one.example/', 'https://one.example/']);
  });

  it('keeps showing the result on refresh until the new one is in', async () => {
    const again = deferred<ReturnType<typeof ok>>();
    sendMessage.mockResolvedValueOnce(ok('before')).mockReturnValueOnce(again.promise);

    const { result } = renderHook(() => usePageRecall('https://one.example/'));
    await waitFor(() => expect(result.current.result?.graph).toBe('before'));

    act(() => result.current.refresh());

    expect(result.current.loading).toBe(true);
    expect(result.current.result?.graph).toBe('before');
    await act(async () => again.resolve(ok('after')));
    expect(result.current).toMatchObject({ loading: false, error: null });
    expect(result.current.result?.graph).toBe('after');
    expect(searchedUrls()).toEqual(['https://one.example/', 'https://one.example/']);
  });

  it('does not keep the result of the last page when the url changes with a refresh', async () => {
    const two = deferred<ReturnType<typeof ok>>();
    sendMessage.mockResolvedValueOnce(ok('one')).mockReturnValueOnce(two.promise);

    const { result, rerender } = renderHook(({ url }) => usePageRecall(url), {
      initialProps: { url: 'https://one.example/' },
    });
    await waitFor(() => expect(result.current.result?.graph).toBe('one'));

    act(() => {
      result.current.refresh();
      rerender({ url: 'https://two.example/' });
    });

    expect(result.current.result).toBeNull();
    await act(async () => two.resolve(ok('two')));
    expect(result.current.result?.graph).toBe('two');
  });

  it('does not search without a url, and has no result', async () => {
    const { result } = renderHook(() => usePageRecall(null));

    expect(result.current).toMatchObject({ loading: false, error: null, result: null });
    act(() => result.current.retry());
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('drops the result of the last page once the url is gone', async () => {
    const first = deferred<ReturnType<typeof ok>>();
    sendMessage.mockReturnValueOnce(first.promise);

    const { result, rerender } = renderHook(({ url }) => usePageRecall(url), {
      initialProps: { url: 'https://one.example/' as string | null },
    });
    rerender({ url: null });
    await act(async () => first.resolve(ok('one')));

    expect(result.current).toMatchObject({ loading: false, error: null, result: null });
  });
});
