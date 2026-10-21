import { afterEach, describe, expect, it, vi } from 'vitest';
import { followSystemColorScheme } from './color-scheme';

const mockMatchMedia = (initial: boolean) => {
  const listeners = new Set<() => void>();
  const media = {
    matches: initial,
    addEventListener: (_: string, fn: () => void) => listeners.add(fn),
    removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
  };
  vi.spyOn(window, 'matchMedia').mockReturnValue(media as unknown as MediaQueryList);
  return {
    set(matches: boolean) {
      media.matches = matches;
      listeners.forEach((fn) => fn());
    },
    listeners,
  };
};

describe('followSystemColorScheme', () => {
  afterEach(() => vi.restoreAllMocks());

  it('applies the current scheme and follows changes', () => {
    const root = document.createElement('html');
    const media = mockMatchMedia(true);

    const cleanup = followSystemColorScheme(root);
    expect(root.classList.contains('dark')).toBe(true);

    media.set(false);
    expect(root.classList.contains('dark')).toBe(false);

    cleanup();
    expect(media.listeners.size).toBe(0);
    media.set(true);
    expect(root.classList.contains('dark')).toBe(false);
  });
});
