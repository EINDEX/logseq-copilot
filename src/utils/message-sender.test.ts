import { describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing';
import { fromExtensionContext, fromThisExtension } from './message-sender';

const id = fakeBrowser.runtime.id;
const tab = { id: 1, url: 'https://e.com/top' };

describe('message senders', () => {
  it('only this extension is this extension', () => {
    expect(fromThisExtension({ id })).toBe(true);
    for (const sender of [undefined, {}, { id: '' }, { id: 'other-extension' }]) {
      expect(fromThisExtension(sender), JSON.stringify(sender)).toBe(false);
    }
  });

  it('the background and extension pages have no tab', () => {
    expect(fromExtensionContext({ id })).toBe(true);
    expect(fromExtensionContext({ id, tab })).toBe(false);
    expect(fromExtensionContext({ id: 'other-extension' })).toBe(false);
  });
});
