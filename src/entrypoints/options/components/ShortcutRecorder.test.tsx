import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { fakeBrowser } from 'wxt/testing';

const commandList = (clip: string) => [
  { name: 'clip', shortcut: clip, description: '' },
  { name: 'open-sidebar', shortcut: '', description: '' },
];

/** The component reads FIREFOX and the user agent when the module loads. */
const load = async ({ firefox, edge = false }: { firefox: boolean; edge?: boolean }) => {
  vi.resetModules();
  // Env values are strings: an empty one is falsy, as in the Chromium build.
  vi.stubEnv('FIREFOX', firefox ? '1' : '');
  vi.stubGlobal('navigator', {
    ...navigator,
    platform: 'Win32',
    userAgentData: undefined,
    userAgent: edge ? 'Mozilla/5.0 Chrome/120 Edg/120' : 'Mozilla/5.0 Chrome/120',
  });
  return (await import('./ShortcutRecorder')).ShortcutRecorder;
};

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('ShortcutRecorder on Chromium', () => {
  let getAll: ReturnType<typeof vi.fn>;
  let create: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fakeBrowser.reset();
    getAll = vi.fn(async () => commandList('Ctrl+Shift+U'));
    (fakeBrowser as any).commands = { getAll };
    create = vi.fn(async () => ({}));
    (fakeBrowser.tabs as any).create = create;
  });

  it('shows the browser shortcut as keycaps, without a recorder or reset', async () => {
    const ShortcutRecorder = await load({ firefox: false });
    const { container } = render(<ShortcutRecorder />);
    await waitFor(() =>
      expect([...container.querySelectorAll('kbd')].map((k) => k.textContent)).toEqual([
        'Ctrl',
        'Shift',
        'U',
      ]),
    );
    expect(screen.queryByRole('button', { name: 'Reset shortcut' })).toBeNull();
    expect(screen.queryByText('Press keys…')).toBeNull();
  });

  it('says Not set when the browser has none, and reads again when the window gets focus', async () => {
    getAll.mockResolvedValue(commandList(''));
    const ShortcutRecorder = await load({ firefox: false });
    const { container } = render(<ShortcutRecorder />);
    await waitFor(() => expect(screen.getByText('Not set')).toBeTruthy());
    expect(container.querySelectorAll('kbd')).toHaveLength(0);

    getAll.mockResolvedValue(commandList('Alt+Shift+K'));
    act(() => {
      window.dispatchEvent(new Event('focus'));
    });
    await waitFor(() =>
      expect([...container.querySelectorAll('kbd')].map((k) => k.textContent)).toEqual([
        'Alt',
        'Shift',
        'K',
      ]),
    );
    expect(screen.queryByText('Not set')).toBeNull();
  });

  it('shows Not set, not a crash, when the commands cannot be read', async () => {
    getAll.mockRejectedValue(new Error('no commands'));
    const ShortcutRecorder = await load({ firefox: false });
    render(<ShortcutRecorder />);
    await waitFor(() => expect(getAll).toHaveBeenCalled());
    expect(screen.getByText('Not set')).toBeTruthy();
  });

  it('shows a shortcut it cannot parse as it is', async () => {
    getAll.mockResolvedValue(commandList('Ctrl+Plus'));
    const ShortcutRecorder = await load({ firefox: false });
    render(<ShortcutRecorder />);
    await waitFor(() => expect(screen.getByText('Ctrl+Plus')).toBeTruthy());
  });

  it('Change opens the Chrome shortcuts page', async () => {
    const ShortcutRecorder = await load({ firefox: false });
    render(<ShortcutRecorder />);
    fireEvent.click(screen.getByRole('button', { name: 'Change' }));
    expect(create).toHaveBeenCalledWith({ url: 'chrome://extensions/shortcuts' });
  });

  it('Change opens the Edge shortcuts page in Edge', async () => {
    const ShortcutRecorder = await load({ firefox: false, edge: true });
    render(<ShortcutRecorder />);
    fireEvent.click(screen.getByRole('button', { name: 'Change' }));
    expect(create).toHaveBeenCalledWith({ url: 'edge://extensions/shortcuts' });
  });
});

describe('ShortcutRecorder on Firefox', () => {
  let getAll: ReturnType<typeof vi.fn>;
  let update: ReturnType<typeof vi.fn>;
  let reset: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fakeBrowser.reset();
    getAll = vi.fn(async () => commandList('Ctrl+Shift+U'));
    update = vi.fn(async () => {});
    reset = vi.fn(async () => {});
    (fakeBrowser as any).commands = { getAll, update, reset };
  });

  const recorder = () => screen.getByRole('button', { name: /U|Not set|Press keys/ });
  const startRecording = async () => {
    const ShortcutRecorder = await load({ firefox: true });
    const view = render(<ShortcutRecorder />);
    const button = view.container.querySelector('#clip-shortcut') as HTMLButtonElement;
    await waitFor(() => expect(button.textContent).toContain('U'));
    fireEvent.click(button);
    expect(button.textContent).toContain('Press keys');
    return { button, view };
  };
  const press = (init: KeyboardEventInit & { code: string }) =>
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }));
    });

  it('has the recorder and no Change button', async () => {
    const ShortcutRecorder = await load({ firefox: true });
    render(<ShortcutRecorder />);
    await waitFor(() => expect(recorder().textContent).toContain('U'));
    expect(screen.queryByRole('button', { name: 'Change' })).toBeNull();
    // The default shortcut: nothing to reset.
    expect(screen.queryByRole('button', { name: 'Reset shortcut' })).toBeNull();
  });

  it('records a combo, sets the command, and shows the new shortcut', async () => {
    const { button } = await startRecording();
    getAll.mockResolvedValue(commandList('Alt+Shift+K'));
    press({ code: 'KeyK', key: 'K', altKey: true, shiftKey: true });

    await waitFor(() =>
      expect(update).toHaveBeenCalledWith({ name: 'clip', shortcut: 'Alt+Shift+K' }),
    );
    await waitFor(() => expect(button.textContent).not.toContain('Press keys'));
    await waitFor(() => expect(button.textContent).toContain('K'));
    expect(screen.queryByRole('alert')).toBeNull();
    // Changed from the default: it can be reset now.
    expect(screen.getByRole('button', { name: 'Reset shortcut' })).toBeTruthy();
  });

  it('refuses a combo the browser keeps, and keeps recording', async () => {
    const { button } = await startRecording();
    press({ code: 'KeyT', key: 't', ctrlKey: true });
    expect((await screen.findByRole('alert')).textContent).toBe('The browser keeps this shortcut');
    expect(update).not.toHaveBeenCalled();
    expect(button.textContent).toContain('Press keys');
  });

  it('refuses a key Firefox does not take', async () => {
    const { button } = await startRecording();
    press({ code: 'Tab', key: 'Tab', altKey: true });
    expect((await screen.findByRole('alert')).textContent).toBe('This key cannot be used');
    expect(update).not.toHaveBeenCalled();
    expect(button.textContent).toContain('Press keys');
  });

  it('shows the error when commands.update fails, and keeps recording', async () => {
    update.mockRejectedValue(new Error('Shortcut already in use'));
    const { button } = await startRecording();
    press({ code: 'KeyK', key: 'k', altKey: true });
    expect((await screen.findByRole('alert')).textContent).toBe('Shortcut already in use');
    expect(button.textContent).toContain('Press keys');
  });

  it('shows a thrown value that is not an Error as text', async () => {
    update.mockRejectedValue('nope');
    await startRecording();
    press({ code: 'KeyK', key: 'k', altKey: true });
    expect((await screen.findByRole('alert')).textContent).toBe('nope');
  });

  it('ignores held keys and modifier-only presses', async () => {
    await startRecording();
    press({ code: 'KeyK', key: 'k', altKey: true, repeat: true });
    press({ code: 'AltLeft', key: 'Alt', altKey: true });
    expect(update).not.toHaveBeenCalled();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('Escape cancels the recording without changing anything', async () => {
    const { button } = await startRecording();
    press({ code: 'Escape', key: 'Escape' });
    await waitFor(() => expect(button.textContent).not.toContain('Press keys'));
    expect(update).not.toHaveBeenCalled();
  });

  it('losing focus stops the recording and clears the error', async () => {
    const { button } = await startRecording();
    press({ code: 'KeyT', key: 't', ctrlKey: true });
    await screen.findByRole('alert');
    fireEvent.blur(button);
    await waitFor(() => expect(button.textContent).not.toContain('Press keys'));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('the reset button sets the manifest default back with commands.reset', async () => {
    getAll.mockResolvedValue(commandList('Alt+Shift+K'));
    const ShortcutRecorder = await load({ firefox: true });
    render(<ShortcutRecorder />);
    const resetButton = await screen.findByRole('button', { name: 'Reset shortcut' });

    getAll.mockResolvedValue(commandList('Ctrl+Shift+U'));
    fireEvent.click(resetButton);
    await waitFor(() => expect(reset).toHaveBeenCalledWith('clip'));
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Reset shortcut' })).toBeNull(),
    );
  });

  it('shows the error when commands.reset fails', async () => {
    getAll.mockResolvedValue(commandList('Alt+Shift+K'));
    reset.mockRejectedValue(new Error('Cannot reset'));
    const ShortcutRecorder = await load({ firefox: true });
    render(<ShortcutRecorder />);
    fireEvent.click(await screen.findByRole('button', { name: 'Reset shortcut' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Cannot reset');
    // Still the changed shortcut.
    expect(screen.getByRole('button', { name: 'Reset shortcut' })).toBeTruthy();
  });

  it('shows a reset failure that is not an Error as text', async () => {
    getAll.mockResolvedValue(commandList('Alt+Shift+K'));
    reset.mockRejectedValue('denied');
    const ShortcutRecorder = await load({ firefox: true });
    render(<ShortcutRecorder />);
    fireEvent.click(await screen.findByRole('button', { name: 'Reset shortcut' }));
    expect((await screen.findByRole('alert')).textContent).toBe('denied');
  });

  it('shows Not set when the command has no shortcut', async () => {
    getAll.mockResolvedValue(commandList(''));
    const ShortcutRecorder = await load({ firefox: true });
    render(<ShortcutRecorder />);
    await waitFor(() => expect(screen.getByText('Not set')).toBeTruthy());
  });
});
