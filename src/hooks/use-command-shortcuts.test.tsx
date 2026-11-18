import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { fakeBrowser } from 'wxt/testing';
import { clipShortcutItem } from '@/utils/clip-shortcut';
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

  it('shows the shortcut recorded in the options instead, and follows changes', async () => {
    (fakeBrowser as any).commands = { getAll: vi.fn(async () => commands('Ctrl+Shift+U')) };
    const { result } = renderHook(() => useCommandShortcuts());
    await waitFor(() => expect(result.current.clip).toBe('Ctrl+Shift+U'));

    await act(() =>
      clipShortcutItem.setValue({ code: 'KeyK', ctrl: true, alt: true, shift: false, meta: false }),
    );
    await waitFor(() => expect(result.current.clip).toBe('Ctrl+Alt+K'));

    await act(() => clipShortcutItem.removeValue());
    await waitFor(() => expect(result.current.clip).toBe('Ctrl+Shift+U'));
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
