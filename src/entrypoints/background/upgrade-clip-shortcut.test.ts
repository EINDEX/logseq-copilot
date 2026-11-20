import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing';
import { removeInPageClipShortcut } from './upgrade';

describe('removeInPageClipShortcut', () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });

  it('removes the shortcut earlier builds stored, and leaves the rest', async () => {
    await fakeBrowser.storage.local.set({
      clipShortcut: { code: 'KeyK', ctrl: true, alt: true, shift: false, meta: false },
      logseqPort: 12315,
    });
    await removeInPageClipShortcut();
    expect(await fakeBrowser.storage.local.get()).toEqual({ logseqPort: 12315 });
    // Twice is the same.
    await removeInPageClipShortcut();
    expect(await fakeBrowser.storage.local.get()).toEqual({ logseqPort: 12315 });
  });
});
