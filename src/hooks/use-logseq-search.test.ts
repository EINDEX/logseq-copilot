import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { LogseqSearchResult } from '@/types/logseqBlock';

const sendMessage = vi.hoisted(() => vi.fn());
vi.mock('@/types/messaging', () => ({ sendMessage }));

import { useLogseqSearch } from './use-logseq-search';

const resultFor = (graph: string): LogseqSearchResult => ({
  graph,
  pages: [],
  blocks: [],
});

const ok = (graph: string) => ({ status: 200, msg: '', response: resultFor(graph) });

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
};

const searched = () =>
  sendMessage.mock.calls
    .filter(([type]) => type === 'logseq:search')
    .map(([, query]) => query);

/** Types `query` and presses Enter. */
const searchFor = (result: { current: ReturnType<typeof useLogseqSearch> }, query: string) => {
  act(() => result.current.setQuery(query));
  act(() => result.current.submit());
};

describe('useLogseqSearch', () => {
  beforeEach(() => {
    sendMessage.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it('searches nothing while typing, only on submit', async () => {
    sendMessage.mockResolvedValue(ok('notes'));
    const { result } = renderHook(() => useLogseqSearch());

    act(() => result.current.setQuery('reading'));

    expect(result.current).toMatchObject({ query: 'reading', submitted: null, loading: false });
    expect(sendMessage).not.toHaveBeenCalled();

    act(() => result.current.submit());

    expect(result.current).toMatchObject({ submitted: 'reading', loading: true, result: null });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.result?.graph).toBe('notes');
    expect(result.current.error).toBeNull();
    expect(searched()).toEqual(['reading']);
  });

  it('searches the trimmed query, and not a blank one', () => {
    sendMessage.mockResolvedValue(ok('notes'));
    const { result } = renderHook(() => useLogseqSearch());

    searchFor(result, '   ');
    expect(result.current.submitted).toBeNull();
    expect(sendMessage).not.toHaveBeenCalled();

    searchFor(result, '  reading  ');
    expect(searched()).toEqual(['reading']);
  });

  it('ends the search when the box is emptied', async () => {
    sendMessage.mockResolvedValue(ok('notes'));
    const { result } = renderHook(() => useLogseqSearch());
    searchFor(result, 'reading');
    await waitFor(() => expect(result.current.result).not.toBeNull());

    act(() => result.current.setQuery(''));

    expect(result.current).toMatchObject({
      query: '',
      submitted: null,
      loading: false,
      error: null,
      result: null,
    });
  });

  it('ends the search on clear, and drops the answer still on its way', async () => {
    const answer = deferred<ReturnType<typeof ok>>();
    sendMessage.mockReturnValueOnce(answer.promise);
    const { result } = renderHook(() => useLogseqSearch());
    searchFor(result, 'reading');

    act(() => result.current.clear());
    await act(async () => answer.resolve(ok('late')));

    expect(result.current).toMatchObject({ query: '', submitted: null, result: null, loading: false });
  });

  it('keeps the shown search while the box is edited, until the next submit', async () => {
    sendMessage.mockResolvedValue(ok('notes'));
    const { result } = renderHook(() => useLogseqSearch());
    searchFor(result, 'reading');
    await waitFor(() => expect(result.current.result).not.toBeNull());

    act(() => result.current.setQuery('reading list'));

    expect(result.current.submitted).toBe('reading');
    expect(result.current.result).not.toBeNull();
    expect(searched()).toEqual(['reading']);
  });

  it('shows only the latest of two searches', async () => {
    const first = deferred<ReturnType<typeof ok>>();
    const second = deferred<ReturnType<typeof ok>>();
    sendMessage.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const { result } = renderHook(() => useLogseqSearch());

    searchFor(result, 'one');
    searchFor(result, 'two');
    await act(async () => second.resolve(ok('two')));
    await act(async () => first.resolve(ok('one')));

    expect(result.current.submitted).toBe('two');
    expect(result.current.result?.graph).toBe('two');
  });

  it('gives the message of a failed search, and searches it again on retry', async () => {
    sendMessage
      .mockResolvedValueOnce({ status: 500, msg: 'Cannot connect to Logseq', response: undefined })
      .mockResolvedValueOnce(ok('notes'));
    const { result } = renderHook(() => useLogseqSearch());
    searchFor(result, 'reading');
    await waitFor(() => expect(result.current.error).toBe('Cannot connect to Logseq'));
    expect(result.current.result).toBeNull();

    // Even after the box was edited: the search shown is the one retried.
    act(() => result.current.setQuery('reading list'));
    act(() => result.current.retry());

    expect(result.current).toMatchObject({ loading: true, error: null });
    await waitFor(() => expect(result.current.result?.graph).toBe('notes'));
    expect(searched()).toEqual(['reading', 'reading']);
  });

  it('gives the message of a search that throws', async () => {
    sendMessage.mockRejectedValue(new Error('No background'));
    const { result } = renderHook(() => useLogseqSearch());

    searchFor(result, 'reading');

    await waitFor(() => expect(result.current.error).toBe('No background'));
  });
});
