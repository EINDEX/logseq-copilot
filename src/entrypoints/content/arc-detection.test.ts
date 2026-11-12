import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing';
import type { ContentScriptContext } from 'wxt/utils/content-script-context';
import { detectArc } from './arc-detection';

const arcDetected = async () =>
  (await fakeBrowser.storage.local.get('arcDetected')).arcDetected;

const ctx = {
  setTimeout: (handler: () => void, timeout: number) =>
    setTimeout(handler, timeout),
} as unknown as ContentScriptContext;

const showArcPalette = () =>
  document.documentElement.style.setProperty(
    '--arc-palette-background',
    '#1E1E2EFF',
  );

describe('detectArc', () => {
  beforeEach(() => {
    fakeBrowser.reset();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    document.documentElement.style.removeProperty('--arc-palette-background');
  });

  it('stores that the browser is Arc', async () => {
    showArcPalette();

    detectArc(ctx);

    await vi.waitFor(async () => expect(await arcDetected()).toBe(true));
  });

  it('looks again once the page has had time to get the palette', async () => {
    detectArc(ctx);
    await vi.advanceTimersByTimeAsync(0);
    expect(await arcDetected()).toBeUndefined();

    showArcPalette();
    await vi.advanceTimersByTimeAsync(2_000);

    await vi.waitFor(async () => expect(await arcDetected()).toBe(true));
  });

  it('stores nothing in other browsers', async () => {
    detectArc(ctx);
    await vi.advanceTimersByTimeAsync(5_000);

    expect(await arcDetected()).toBeUndefined();
  });

  it('writes once: every page of Arc sees it', async () => {
    await fakeBrowser.storage.local.set({ arcDetected: true });
    const set = vi.spyOn(fakeBrowser.storage.local, 'set');
    showArcPalette();

    detectArc(ctx);
    await vi.advanceTimersByTimeAsync(0);

    expect(set).not.toHaveBeenCalled();
  });
});
