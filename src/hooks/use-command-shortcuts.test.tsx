import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { fakeBrowser } from 'wxt/testing';
import { notifyCommandShortcutsChanged, useCommandShortcuts } from './use-command-shortcuts';

const commands = (clip: string) => [
  { name: 'clip', shortcut: clip, description: '' },
  { name: 'open-sidebar', shortcut: '', description: '' },
];

describe('useCommandShortcuts', () => {
  beforeEach(() => {
    fakeBrowser.reset();
    vi.stubGlobal('navigator', { ...navigator, platform: 'Win32', userAgentData: undefined });
  });

  it('lists the shortcuts of the browser, without the commands that have none', async () => {
    (fakeBrowser as any).commands = { getAll: vi.fn(async () => commands('Ctrl+Shift+U')) };
    const { result } = renderHook(() => useCommandShortcuts());
    await waitFor(() => expect(result.current).toEqual({ clip: 'Ctrl+Shift+U' }));
  });

  it('reads the commands again when the window gets focus back', async () => {
    const getAll = vi
      .fn()
      .mockResolvedValueOnce(commands('Ctrl+Shift+U'))
      .mockResolvedValue(commands(''));
    (fakeBrowser as any).commands = { getAll };
    const { result } = renderHook(() => useCommandShortcuts());
    await waitFor(() => expect(result.current.clip).toBe('Ctrl+Shift+U'));
    act(() => {
      window.dispatchEvent(new Event('focus'));
    });
    await waitFor(() => expect(result.current).toEqual({}));
  });

  it('is empty when the browser has no commands API, or reading fails', async () => {
    (fakeBrowser as any).commands = undefined;
    const first = renderHook(() => useCommandShortcuts());
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(first.result.current).toEqual({});
    first.unmount();

    (fakeBrowser as any).commands = { getAll: vi.fn(async () => Promise.reject(new Error('x'))) };
    const second = renderHook(() => useCommandShortcuts());
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(second.result.current).toEqual({});
  });

  it('drops a reading that finishes after the page is gone, and stops listening', async () => {
    let finish: (value: ReturnType<typeof commands>) => void = () => {};
    const getAll = vi.fn(() => new Promise<ReturnType<typeof commands>>((r) => (finish = r)));
    (fakeBrowser as any).commands = { getAll };
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { result, unmount } = renderHook(() => useCommandShortcuts());
    await waitFor(() => expect(getAll).toHaveBeenCalledTimes(1));
    unmount();
    await act(async () => finish(commands('Ctrl+Shift+U')));
    expect(result.current).toEqual({});

    // No reading after unmount: neither focus nor the change event asks again.
    window.dispatchEvent(new Event('focus'));
    notifyCommandShortcutsChanged();
    expect(getAll).toHaveBeenCalledTimes(1);
    expect(errors).not.toHaveBeenCalled();
  });

  it('reads the commands again when told a shortcut changed (Firefox)', async () => {
    const getAll = vi
      .fn()
      .mockResolvedValueOnce(commands('Ctrl+Shift+U'))
      .mockResolvedValue(commands('Alt+K'));
    (fakeBrowser as any).commands = { getAll };
    const { result } = renderHook(() => useCommandShortcuts());
    await waitFor(() => expect(result.current.clip).toBe('Ctrl+Shift+U'));
    act(() => notifyCommandShortcutsChanged());
    await waitFor(() => expect(result.current.clip).toBe('Alt+K'));
  });
});
