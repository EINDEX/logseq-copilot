import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing';

vi.mock('@/types/messaging', () => ({
  onMessage: vi.fn(),
  sendMessage: vi.fn(),
}));

import background from './index';

describe('background context menus', () => {
  const create = vi.fn();
  const onClicked = { addListener: vi.fn() };

  beforeEach(() => {
    fakeBrowser.reset();
    create.mockReset();
    onClicked.addListener.mockReset();
    (fakeBrowser as any).contextMenus = { create, onClicked };
    (fakeBrowser as any).commands = { onCommand: { addListener: vi.fn() } };
  });

  it('does not create menus when the service worker starts', () => {
    background.main();
    expect(create).not.toHaveBeenCalled();
  });

  it('registers the click listener at startup', () => {
    background.main();
    expect(onClicked.addListener).toHaveBeenCalledTimes(1);
  });

  it('creates the menus on install/update', async () => {
    background.main();
    await fakeBrowser.runtime.onInstalled.trigger({
      reason: 'update',
      previousVersion: '99.0.0',
      temporary: false,
    } as any);
    expect(create.mock.calls.map(([o]) => o.id)).toEqual([
      'clip-with-selection',
      'clip-page',
    ]);
  });
});
