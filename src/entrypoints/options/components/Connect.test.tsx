/**
 * Connection check in the options page.
 *
 * - Editing host/port/token must not hit Logseq once per keystroke, and an
 *   automatic check must not call showMsg (it pops a toast in Logseq).
 * - "Connect" tests the connection, keeps the user on the options page and
 *   offers an explicit "Open in Logseq" link instead of navigating away.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { LogseqCopliotConfig } from '@/utils/storage';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const service = vi.hoisted(() => ({
  showMsg: vi.fn(),
  getVersion: vi.fn(),
  getGraph: vi.fn(),
}));
const initial = vi.hoisted(() => ({
  config: {} as Record<string, unknown>,
}));

vi.mock('@/entrypoints/background/logseq/tool', () => ({
  getLogseqService: vi.fn(async () => service),
}));
// A plain stateful stand-in for the storage backed hook.
vi.mock('@/hooks/use-settings', async () => {
  const React = await import('react');
  return {
    useSettings: () => {
      const [settings, set] = React.useState(initial.config);
      return {
        settings,
        loading: false,
        error: null,
        updateSettings: async (updates: object) =>
          set((previous) => ({ ...previous, ...updates })),
        resetSettings: async () => {},
        refreshSettings: async () => {},
      };
    },
  };
});

import { LogseqConnectOptions } from './Connect';

const config = (overrides: Partial<LogseqCopliotConfig> = {}) => ({
  logseqHostName: 'localhost',
  logseqPort: 12315,
  logseqAuthToken: '',
  enableClipNoteFloatButton: false,
  ...overrides,
});

const advance = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });

const type = (placeholder: string, value: string) =>
  act(async () => {
    fireEvent.change(screen.getByPlaceholderText(placeholder), {
      target: { value },
    });
  });

describe('LogseqConnectOptions', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    service.showMsg.mockReset().mockResolvedValue({ status: 200, msg: 'success' });
    service.getVersion.mockReset().mockResolvedValue('0.10.9');
    service.getGraph.mockReset().mockResolvedValue('my graph');
    initial.config = config({ logseqAuthToken: 'token' });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  const mount = async () => {
    await act(async () => {
      render(<LogseqConnectOptions />);
    });
    await advance(2000);
  };

  it('checks the saved connection once on load, without showing a toast in Logseq', async () => {
    await mount();

    expect(service.getVersion).toHaveBeenCalledTimes(1);
    expect(service.showMsg).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /Connected to Logseq v0\.10\.9/ })).toBeTruthy();
  });

  it('checks once after typing stops, not once per keystroke', async () => {
    await mount();
    service.getVersion.mockClear();

    for (const token of ['n', 'ne', 'new', 'new-', 'new-t', 'new-to', 'new-tok']) {
      await type('Logseq Authorization Token', token);
      await advance(100);
    }
    expect(service.getVersion).not.toHaveBeenCalled();

    await advance(1000);
    expect(service.getVersion).toHaveBeenCalledTimes(1);
    expect(service.showMsg).not.toHaveBeenCalled();
  });

  it('does not contact Logseq while the host, port or token is invalid', async () => {
    initial.config = config({ logseqAuthToken: '' });
    await mount();
    expect(service.getVersion).not.toHaveBeenCalled();

    await type('Logseq Authorization Token', 'token');
    await type('Logseq Host', 'not a host');
    await advance(2000);
    expect(service.getVersion).not.toHaveBeenCalled();

    await type('Logseq Host', 'localhost');
    await type('Port', '0');
    await advance(2000);
    expect(service.getVersion).not.toHaveBeenCalled();

    await type('Port', '12315');
    await advance(2000);
    expect(service.getVersion).toHaveBeenCalledTimes(1);
  });

  it('shows the failure of an automatic check', async () => {
    service.getVersion.mockReset().mockRejectedValue(new Error('Token not correct'));
    await mount();

    expect(screen.getByRole('button', { name: /Token not correct/ })).toBeTruthy();
    expect(screen.queryByText(/Open .* in Logseq/)).toBeNull();
  });

  it('Connect tests the connection, stays on the options page and shows a success notice', async () => {
    const href = window.location.href;
    await mount();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Connected to Logseq/ }));
    });
    await advance(100);

    expect(service.showMsg).toHaveBeenCalledTimes(1);
    expect(window.location.href).toBe(href);
    expect(screen.getByRole('status').textContent).toMatch(/saved/i);
  });

  it('offers an explicit link to open the graph in Logseq', async () => {
    await mount();

    const link = screen.getByRole('link', { name: /Open .* in Logseq/ });
    expect(link.getAttribute('href')).toBe('logseq://graph/my graph');
  });
});
