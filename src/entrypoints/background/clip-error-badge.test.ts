import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing';
import log from '@/utils/logger';
import {
  clearClipErrorBadges,
  clearSidebarHint,
  hasClipErrorBadge,
  showClipErrorBadge,
  showSidebarHint,
} from './clip-error-badge';

describe('clip error badge', () => {
  const action = {
    setBadgeText: vi.fn(),
    setBadgeBackgroundColor: vi.fn(),
    setBadgeTextColor: vi.fn(),
    setTitle: vi.fn(),
  };

  beforeEach(() => {
    fakeBrowser.reset();
    for (const fn of Object.values(action)) fn.mockReset().mockResolvedValue(undefined);
    (fakeBrowser as any).action = action;
    vi.spyOn(fakeBrowser.runtime, 'getManifest').mockReturnValue({
      name: 'Logseq Copilot',
      action: { default_title: 'Logseq Copilot' },
    } as any);
    vi.spyOn(log, 'error').mockImplementation(() => {});
  });

  afterEach(async () => {
    await clearClipErrorBadges();
  });

  it('puts "!" in an error color on the tab, with the message as the title', async () => {
    await showClipErrorBadge(5, 'Cannot connect to Logseq');

    expect(action.setBadgeText).toHaveBeenCalledWith({ text: '!', tabId: 5 });
    expect(action.setBadgeBackgroundColor).toHaveBeenCalledWith({
      color: '#d32f2f',
      tabId: 5,
    });
    expect(action.setTitle).toHaveBeenCalledWith({
      title: 'Cannot connect to Logseq',
      tabId: 5,
    });
    expect(hasClipErrorBadge(5)).toBe(true);
    expect(hasClipErrorBadge(6)).toBe(false);
  });

  it('sets the badge text color white where the browser supports it', async () => {
    await showClipErrorBadge(5, 'message');

    expect(action.setBadgeTextColor).toHaveBeenCalledWith({
      color: '#ffffff',
      tabId: 5,
    });
  });

  it('still shows the badge where setBadgeTextColor is missing (Safari)', async () => {
    (fakeBrowser as any).action = {
      setBadgeText: action.setBadgeText,
      setBadgeBackgroundColor: action.setBadgeBackgroundColor,
      setTitle: action.setTitle,
    };

    await showClipErrorBadge(5, 'Cannot connect to Logseq');

    expect(action.setBadgeText).toHaveBeenCalledWith({ text: '!', tabId: 5 });
    expect(action.setBadgeBackgroundColor).toHaveBeenCalledWith({
      color: '#d32f2f',
      tabId: 5,
    });
    expect(action.setTitle).toHaveBeenCalledWith({
      title: 'Cannot connect to Logseq',
      tabId: 5,
    });
    expect(log.error).not.toHaveBeenCalledWith(
      '[clip] Failed to show the error badge:',
      expect.anything(),
    );
  });

  it('only logs without a tab', async () => {
    await showClipErrorBadge(undefined, 'Cannot connect to Logseq');

    expect(action.setBadgeText).not.toHaveBeenCalled();
    expect(log.error).toHaveBeenCalled();
  });

  it('is cleared from every tab by the next successful clip', async () => {
    await showClipErrorBadge(5, 'first');
    await showClipErrorBadge(6, 'second');
    action.setBadgeText.mockClear();
    action.setTitle.mockClear();

    await clearClipErrorBadges();

    expect(action.setBadgeText).toHaveBeenCalledWith({ text: '', tabId: 5 });
    expect(action.setBadgeText).toHaveBeenCalledWith({ text: '', tabId: 6 });
    expect(action.setTitle).toHaveBeenCalledWith({ title: 'Logseq Copilot', tabId: 5 });
    expect(hasClipErrorBadge(5)).toBe(false);
    expect(hasClipErrorBadge(6)).toBe(false);
  });

  it('touches no badge when there was no error', async () => {
    await clearClipErrorBadges();

    expect(action.setBadgeText).not.toHaveBeenCalled();
  });

  it('survives a closed tab and a browser refusing the badge', async () => {
    action.setBadgeText.mockRejectedValue(new Error('No tab with id: 5'));

    await expect(showClipErrorBadge(5, 'message')).resolves.toBeUndefined();
    await expect(clearClipErrorBadges()).resolves.toBeUndefined();
  });

  describe('the sidebar hint', () => {
    it('is cleared on its own tab, and the result count leaves it alone meanwhile', async () => {
      await showSidebarHint(5, "can't open");
      expect(hasClipErrorBadge(5)).toBe(true);
      expect(action.setTitle).toHaveBeenCalledWith({ title: "can't open", tabId: 5 });

      await clearSidebarHint(5);

      expect(action.setBadgeText).toHaveBeenLastCalledWith({ text: '', tabId: 5 });
      expect(hasClipErrorBadge(5)).toBe(false);
    });

    it('never clears a clip error (a navigation keeps it until the next clip)', async () => {
      await showClipErrorBadge(5, 'Cannot connect to Logseq');
      action.setBadgeText.mockClear();

      await clearSidebarHint(5);

      expect(action.setBadgeText).not.toHaveBeenCalled();
      expect(hasClipErrorBadge(5)).toBe(true);
    });

    it('becomes a clip error when a clip fails on the tab, and is cleared by a clip', async () => {
      await showSidebarHint(5, "can't open");
      await showClipErrorBadge(5, 'Cannot connect to Logseq');
      await clearSidebarHint(5);
      expect(hasClipErrorBadge(5)).toBe(true);

      await showSidebarHint(6, "can't open");
      await clearClipErrorBadges();
      expect(hasClipErrorBadge(6)).toBe(false);
    });
  });
});
