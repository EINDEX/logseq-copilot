import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { LogseqError, TokenNotCurrect, UnknownIssues } from '@/entrypoints/background/logseq/error';
import log from '@/utils/logger';
import { DONE_MS, useClipActions, type ClipHandlers } from './use-clip-actions';

const deferred = () => {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

const handlersWith = (over: Partial<ClipHandlers> = {}): ClipHandlers => ({
  clipPage: vi.fn(async () => {}),
  clipSelection: vi.fn(async () => {}),
  onClipped: vi.fn(),
  onSettled: vi.fn(),
  ...over,
});

const render = (handlers: ClipHandlers, page: string | null = 'https://one.example/') =>
  renderHook(({ page }) => useClipActions(handlers, page), { initialProps: { page } });

describe('useClipActions', () => {
  beforeEach(() => {
    vi.spyOn(log, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('runs the clip of each action', async () => {
    const handlers = handlersWith();
    const { result } = render(handlers);

    await act(async () => result.current.clipPage());
    await act(async () => result.current.clipSelection());

    expect(handlers.clipPage).toHaveBeenCalledTimes(1);
    expect(handlers.clipSelection).toHaveBeenCalledTimes(1);
  });

  it('says which action is clipping, and runs one at a time', async () => {
    const page = deferred();
    const handlers = handlersWith({ clipPage: vi.fn(() => page.promise) });
    const { result } = render(handlers);

    act(() => result.current.clipPage());

    expect(result.current.clipping).toBe('page');
    act(() => result.current.clipSelection());
    act(() => result.current.clipPage());
    expect(handlers.clipSelection).not.toHaveBeenCalled();
    expect(handlers.clipPage).toHaveBeenCalledTimes(1);

    await act(async () => page.resolve());
    expect(result.current.clipping).toBeNull();
  });

  it('shows done for a moment after a clip, and tells the host', async () => {
    vi.useFakeTimers();
    const handlers = handlersWith();
    const { result } = render(handlers);

    await act(async () => result.current.clipSelection());

    expect(result.current).toMatchObject({ clipping: null, done: 'selection', error: null });
    expect(handlers.onClipped).toHaveBeenCalledWith('selection');
    expect(handlers.onSettled).toHaveBeenCalledWith('selection');

    act(() => vi.advanceTimersByTime(DONE_MS));
    expect(result.current.done).toBeNull();
  });

  it('gives the readable reason of a failed clip, on its action, until the next clip', async () => {
    const handlers = handlersWith({
      clipPage: vi
        .fn()
        .mockRejectedValueOnce(new LogseqError(TokenNotCurrect))
        .mockResolvedValueOnce(undefined),
    });
    const { result } = render(handlers);

    await act(async () => result.current.clipPage());

    expect(result.current.error).toEqual({ action: 'page', message: TokenNotCurrect.msg });
    expect(result.current.done).toBeNull();
    expect(handlers.onClipped).not.toHaveBeenCalled();
    expect(handlers.onSettled).toHaveBeenCalledWith('page');

    await act(async () => result.current.clipPage());

    expect(result.current.error).toBeNull();
    expect(result.current.done).toBe('page');
  });

  it('gives the generic reason of a failure without a message', async () => {
    const handlers = handlersWith({ clipSelection: vi.fn().mockRejectedValue({}) });
    const { result } = render(handlers);

    await act(async () => result.current.clipSelection());

    expect(result.current.error).toEqual({ action: 'selection', message: UnknownIssues.msg });
  });

  it('forgets the error on another page, and drops a clip that ends after it', async () => {
    const late = deferred();
    const handlers = handlersWith({
      clipPage: vi.fn().mockRejectedValueOnce(new Error('No')).mockReturnValueOnce(late.promise),
    });
    const { result, rerender } = render(handlers);
    await act(async () => result.current.clipPage());
    expect(result.current.error).not.toBeNull();

    rerender({ page: 'https://two.example/' });
    expect(result.current.error).toBeNull();

    act(() => result.current.clipPage());
    rerender({ page: 'https://three.example/' });
    await act(async () => late.resolve());

    expect(result.current).toMatchObject({ clipping: null, done: null, error: null });
    expect(handlers.onClipped).not.toHaveBeenCalled();
    // The new page can be clipped at once.
    await act(async () => result.current.clipSelection());
    expect(handlers.clipSelection).toHaveBeenCalledTimes(1);
  });
});
