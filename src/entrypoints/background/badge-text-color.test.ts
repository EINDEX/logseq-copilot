import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing';
import { setBadgeTextColorIfSupported } from './badge-text-color';

describe('setBadgeTextColorIfSupported', () => {
  const action = {
    setBadgeText: vi.fn(),
    setBadgeBackgroundColor: vi.fn(),
    setBadgeTextColor: vi.fn(),
    setTitle: vi.fn(),
  };

  beforeEach(() => {
    fakeBrowser.reset();
    for (const fn of Object.values(action)) fn.mockReset().mockResolvedValue(undefined);
    (fakeBrowser as any).action = { ...action };
  });

  it('calls setBadgeTextColor with the color and tab when the API exists', async () => {
    await setBadgeTextColorIfSupported('#ffffff', 7);

    expect(action.setBadgeTextColor).toHaveBeenCalledTimes(1);
    expect(action.setBadgeTextColor).toHaveBeenCalledWith({ color: '#ffffff', tabId: 7 });
  });

  it('does nothing and does not throw when the API is missing (Safari)', async () => {
    (fakeBrowser as any).action = {
      setBadgeText: action.setBadgeText,
      setBadgeBackgroundColor: action.setBadgeBackgroundColor,
    };

    await expect(setBadgeTextColorIfSupported('#ffffff', 7)).resolves.toBeUndefined();
    expect(action.setBadgeTextColor).not.toHaveBeenCalled();
  });

});
