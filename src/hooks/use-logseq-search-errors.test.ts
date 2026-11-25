import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';

const sendMessage = vi.hoisted(() => vi.fn());
vi.mock('@/types/messaging', () => ({ sendMessage }));

import { useLogseqSearch } from './use-logseq-search';

const searchFor = async (query: string) => {
  const hook = renderHook(() => useLogseqSearch());
  act(() => hook.result.current.setQuery(query));
  act(() => hook.result.current.submit());
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  return hook.result;
};

describe('useLogseqSearch fallback messages', () => {
  beforeEach(() => {
    sendMessage.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it('says the search failed when the answer has no message', async () => {
    sendMessage.mockResolvedValue({ status: 500, msg: '', response: undefined });
    const result = await searchFor('reading');
    expect(result.current.error).toBe('Search failed');
    expect(result.current.result).toBeNull();
  });

  it('says the search failed when it throws something that is not an Error', async () => {
    sendMessage.mockRejectedValue('gone');
    const result = await searchFor('reading');
    expect(result.current.error).toBe('Search failed');
  });

  it('says the search failed when it throws an Error without a message', async () => {
    sendMessage.mockRejectedValue(new Error(''));
    const result = await searchFor('reading');
    expect(result.current.error).toBe('Search failed');
  });

  it('gives the message of an Error it throws', async () => {
    sendMessage.mockRejectedValue(new Error('No background'));
    const result = await searchFor('reading');
    expect(result.current.error).toBe('No background');
  });
});
