import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing';
import log from '@/utils/logger';
import {
  clearClipErrorBadges,
  hasClipErrorBadge,
  showClipErrorBadge,
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
});
