import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { fakeBrowser } from 'wxt/testing';
import { searchEngineConfig } from '@/utils/storage';
import { useSearchEngines } from './use-search-engines';

// Storage rejects with something that is not an Error: the hook has its own
// words for that.
const FAILURE = 'storage is gone';

const mount = async () => {
  const hook = renderHook(() => useSearchEngines());
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  return hook;
};

describe('useSearchEngines errors', () => {
  beforeEach(() => {
    fakeBrowser.reset();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'debug').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('says it could not load the search engines', async () => {
    vi.spyOn(searchEngineConfig, 'getValue').mockRejectedValue(FAILURE);
    const { result } = await mount();
    expect(result.current.error).toBe('Failed to load search engine config');
  });

  it('says why updating, adding and removing failed', async () => {
    const { result } = await mount();
    vi.spyOn(searchEngineConfig, 'getValue').mockRejectedValue(FAILURE);

    await act(() => result.current.updateSearchEngine('google', { enabled: false }));
    expect(result.current.error).toBe('Failed to update search engine');

    await act(() =>
      result.current.addCustomSearchEngine({ name: 'x', url: 'https://x/?q={query}' } as never),
    );
    expect(result.current.error).toBe('Failed to add custom search engine');

    await act(() => result.current.removeSearchEngine('custom-1'));
    expect(result.current.error).toBe('Failed to remove search engine');
  });

  it('keeps the message of an Error', async () => {
    vi.spyOn(searchEngineConfig, 'getValue').mockRejectedValue(new Error('quota'));
    const { result } = await mount();
    expect(result.current.error).toBe('quota');

    await act(() => result.current.updateSearchEngine('google', { enabled: false }));
    expect(result.current.error).toBe('quota');

    await act(() =>
      result.current.addCustomSearchEngine({ name: 'x', url: 'https://x/?q={query}' } as never),
    );
    expect(result.current.error).toBe('quota');

    await act(() => result.current.removeSearchEngine('custom-1'));
    expect(result.current.error).toBe('quota');
  });

  it('does not remove a built-in search engine', async () => {
    const { result } = await mount();
    const builtin = result.current.searchEngines.find((e) => !e.isCustom);
    expect(builtin).toBeDefined();

    await act(() => result.current.removeSearchEngine(builtin!.id));

    expect(result.current.error).toBe('Cannot remove built-in search engines');
    expect((await searchEngineConfig.getValue()).some((e) => e.id === builtin!.id)).toBe(true);
  });
});
