import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing';
import { enableClipNoteFloatButtonItem } from '@/utils/storage';
import { useStorageItem } from './use-storage-item';

describe('useStorageItem', () => {
  beforeEach(() => fakeBrowser.reset());

  it('shows the initial value, then the stored one', async () => {
    await fakeBrowser.storage.local.set({ enableClipNoteFloatButton: true });
    const { result } = renderHook(() => useStorageItem(enableClipNoteFloatButtonItem, false));
    expect(result.current).toBe(false);
    await act(async () => {});
    expect(result.current).toBe(true);
  });

  it('follows changes made elsewhere', async () => {
    const { result } = renderHook(() => useStorageItem(enableClipNoteFloatButtonItem));
    await act(async () => {});
    expect(result.current).toBe(false);
    await act(async () => {
      await fakeBrowser.storage.local.set({ enableClipNoteFloatButton: true });
    });
    expect(result.current).toBe(true);
    await act(async () => {
      await fakeBrowser.storage.local.set({ enableClipNoteFloatButton: false });
    });
    expect(result.current).toBe(false);
  });

  it('stops watching when unmounted', async () => {
    const { result, unmount } = renderHook(() => useStorageItem(enableClipNoteFloatButtonItem));
    await act(async () => {});
    unmount();
    await act(async () => {
      await fakeBrowser.storage.local.set({ enableClipNoteFloatButton: true });
    });
    expect(result.current).toBe(false);
  });
});
