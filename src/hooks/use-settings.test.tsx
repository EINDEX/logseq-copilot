import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { fakeBrowser } from 'wxt/testing';
import { logseqHostNameItem, versionItem } from '@/utils/storage';
import { useSettings } from './use-settings';

// Storage rejects with something that is not an Error: the hook has its own
// words for that.
const FAILURE = 'storage is gone';

const mount = async () => {
  const hook = renderHook(() => useSettings());
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  return hook;
};

describe('useSettings errors', () => {
  beforeEach(() => {
    fakeBrowser.reset();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'debug').mockImplementation(() => {});
    vi.spyOn(console, 'info').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('says it could not load the settings', async () => {
    vi.spyOn(versionItem, 'getValue').mockRejectedValue(FAILURE);
    const { result } = await mount();
    expect(result.current.error).toBe('Failed to load settings');
    expect(result.current.settings).toBeNull();
  });

  it('keeps the message of an Error', async () => {
    vi.spyOn(versionItem, 'getValue').mockRejectedValue(new Error('quota'));
    const { result } = await mount();
    expect(result.current.error).toBe('quota');
  });

  it('keeps the message of an Error when resetting fails', async () => {
    const { result } = await mount();
    vi.spyOn(logseqHostNameItem, 'removeValue').mockRejectedValue(new Error('quota'));

    await act(() => result.current.resetSettings());

    expect(result.current.error).toBe('quota');
  });

  it('reloads the stored settings when saving fails', async () => {
    const { result } = await mount();
    const stored = result.current.settings!.logseqHostName;
    vi.spyOn(logseqHostNameItem, 'setValue').mockRejectedValue(FAILURE);

    await act(() => result.current.updateSettings({ logseqHostName: 'elsewhere' }));

    // The failure is shown, then the reload that undoes the optimistic update
    // clears it.
    expect(result.current.settings!.logseqHostName).toBe(stored);
    expect(logseqHostNameItem.setValue).toHaveBeenCalled();
  });

  it('reloads the stored settings when saving fails with an Error', async () => {
    const { result } = await mount();
    const stored = result.current.settings!.logseqHostName;
    vi.spyOn(logseqHostNameItem, 'setValue').mockRejectedValue(new Error('quota'));

    await act(() => result.current.updateSettings({ logseqHostName: 'elsewhere' }));

    expect(result.current.settings!.logseqHostName).toBe(stored);
  });

  it('says it could not reset the settings', async () => {
    const { result } = await mount();
    vi.spyOn(logseqHostNameItem, 'removeValue').mockRejectedValue(FAILURE);

    await act(() => result.current.resetSettings());

    expect(result.current.error).toBe('Failed to reset settings');
  });
});
