/**
 * The sidebar on pages is one stored state for every tab. On a tab where no
 * content script can run (the browser's PDF viewer, about:blank, file://), the
 * toolbar button must not flip it: it hints on that tab only.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing';
import log from '@/utils/logger';
import { sendMessage } from '@/types/messaging';
import { clearClipErrorBadges, hasClipErrorBadge } from './clip-error-badge';
import { startSidebarAction } from './sidebar-action';

vi.mock('@/types/messaging', () => ({ sendMessage: vi.fn() }));

const tab = { id: 7, windowId: 3 } as Browser.tabs.Tab;
const hint = "Logseq Copilot can't open on this page";

const sidePanelOpen = vi.fn();
const setPanelBehavior = vi.fn();
// No setBadgeTextColor: Safari has none.
const action = {
  setBadgeText: vi.fn(),
  setBadgeBackgroundColor: vi.fn(),
  setTitle: vi.fn(),
};

const isOpen = async () =>
  (await fakeBrowser.storage.local.get('inPageSidebarOpen')).inPageSidebarOpen;
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  fakeBrowser.reset();
  delete (fakeBrowser as any).sidePanel;
  delete (fakeBrowser as any).sidebarAction;
  sidePanelOpen.mockReset().mockResolvedValue(undefined);
  setPanelBehavior.mockReset().mockResolvedValue(undefined);
  for (const fn of Object.values(action)) fn.mockReset().mockResolvedValue(undefined);
  (fakeBrowser as any).action = action;
  vi.mocked(sendMessage).mockReset().mockResolvedValue(true as never);
  vi.spyOn(log, 'error').mockImplementation(() => {});
  vi.spyOn(log, 'warn').mockImplementation(() => {});
  vi.spyOn(fakeBrowser.runtime, 'getManifest').mockReturnValue({
    name: 'Logseq Copilot',
    action: { default_title: 'Logseq Copilot' },
  } as any);
});

afterEach(async () => {
  await clearClipErrorBadges();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('without a sidebar of the browser (Safari)', () => {
  it('leaves the state alone and hints on that tab only', async () => {
    vi.mocked(sendMessage).mockRejectedValue(new Error('no receiver'));
    const sidebar = startSidebarAction();

    sidebar.toggle(tab);

    await vi.waitFor(() =>
      expect(action.setTitle).toHaveBeenCalledWith({ title: hint, tabId: 7 }),
    );
    expect(action.setBadgeText).toHaveBeenCalledWith({ text: '!', tabId: 7 });
    expect(action.setBadgeText).toHaveBeenCalledTimes(1);
    expect(hasClipErrorBadge(7)).toBe(true);
    expect(hasClipErrorBadge(8)).toBe(false);
    expect(await isOpen()).toBeUndefined();
  });

  it.each(['about:blank', 'file:///a.pdf', 'safari-resource:/x'])(
    'does not even ask a %s tab',
    async (url) => {
      const sidebar = startSidebarAction();

      sidebar.open({ ...tab, url });

      await vi.waitFor(() => expect(hasClipErrorBadge(7)).toBe(true));
      expect(sendMessage).not.toHaveBeenCalled();
      expect(await isOpen()).toBeUndefined();
    },
  );

  it('toggles as before on a reachable tab, and clears the old hint there', async () => {
    vi.mocked(sendMessage).mockRejectedValueOnce(new Error('no receiver'));
    const sidebar = startSidebarAction();
    sidebar.toggle(tab);
    await vi.waitFor(() => expect(hasClipErrorBadge(7)).toBe(true));

    sidebar.toggle({ ...tab, url: 'https://example.com/' });

    await vi.waitFor(async () => expect(await isOpen()).toBe(true));
    expect(sendMessage).toHaveBeenLastCalledWith('content:ping', undefined, {
      tabId: 7,
    });
    expect(hasClipErrorBadge(7)).toBe(false);
    expect(action.setBadgeText).toHaveBeenLastCalledWith({ text: '', tabId: 7 });
  });

  it('gives up on a content script that never answers', async () => {
    vi.useFakeTimers();
    vi.mocked(sendMessage).mockReturnValue(new Promise(() => {}) as never);
    const sidebar = startSidebarAction();

    sidebar.toggle(tab);
    await vi.advanceTimersByTimeAsync(2000);

    expect(hasClipErrorBadge(7)).toBe(true);
    expect(await isOpen()).toBeUndefined();
  });
});

describe('with the browser sidebar', () => {
  beforeEach(() => {
    (fakeBrowser as any).sidePanel = { open: sidePanelOpen, setPanelBehavior };
  });

  it('opens the side panel with nothing awaited, and never asks the tab', async () => {
    vi.mocked(sendMessage).mockRejectedValue(new Error('no receiver'));
    const sidebar = startSidebarAction();
    await settle();

    sidebar.toggle({ ...tab, url: 'about:blank' });

    expect(sidePanelOpen).toHaveBeenCalledWith({ windowId: 3 });
    await settle();
    expect(sendMessage).not.toHaveBeenCalled();
    expect(hasClipErrorBadge(7)).toBe(false);
  });

  it('hints in Arc mode (sidebar on pages in use) on an unreachable tab', async () => {
    await fakeBrowser.storage.local.set({ arcDetected: true });
    vi.mocked(sendMessage).mockRejectedValue(new Error('no receiver'));
    const sidebar = startSidebarAction();
    await settle();

    sidebar.toggle(tab);

    await vi.waitFor(() => expect(hasClipErrorBadge(7)).toBe(true));
    expect(sidePanelOpen).not.toHaveBeenCalled();
    expect(await isOpen()).toBeUndefined();
  });
});
