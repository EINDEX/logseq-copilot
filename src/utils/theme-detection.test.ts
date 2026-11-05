import { afterEach, describe, expect, it, vi } from 'vitest';
import { detectTheme } from './theme-detection';

const prefersDark = (dark: boolean) =>
  vi.spyOn(window, 'matchMedia').mockReturnValue({
    matches: dark,
  } as unknown as MediaQueryList);

// happy-dom's window API; not part of the DOM types.
const setURL = (url: string) =>
  (window as unknown as { happyDOM: { setURL(url: string): void } }).happyDOM.setURL(url);

describe('detectTheme on Brave Search', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.documentElement.className = '';
    setURL('http://localhost:3000/');
  });

  const atBrave = () => setURL('https://search.brave.com/search?q=logseq');

  it('reads the theme picked in the Brave settings from the html class', () => {
    atBrave();
    prefersDark(false);
    document.documentElement.className = 'dark';
    expect(detectTheme()).toBe('dark');

    prefersDark(true);
    document.documentElement.className = 'light';
    expect(detectTheme()).toBe('light');
  });

  it('follows prefers-color-scheme with the default "system" theme', () => {
    atBrave();
    prefersDark(true);
    expect(detectTheme()).toBe('dark');

    prefersDark(false);
    expect(detectTheme()).toBe('light');
  });
});
