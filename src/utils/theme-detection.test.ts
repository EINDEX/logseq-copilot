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

describe('detectTheme on GitHub', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.documentElement.removeAttribute('data-color-mode');
    document.documentElement.removeAttribute('data-dark-theme');
    setURL('http://localhost:3000/');
  });

  const atGitHub = (mode: string) => {
    setURL('https://github.com/logseq/logseq');
    document.documentElement.setAttribute('data-dark-theme', 'dark');
    document.documentElement.setAttribute('data-color-mode', mode);
  };

  it('is dark when the color mode is dark', () => {
    atGitHub('dark');
    prefersDark(false);
    expect(detectTheme()).toBe('dark');
  });

  it('is light when the color mode is light, even with data-dark-theme set', () => {
    atGitHub('light');
    prefersDark(true);
    expect(detectTheme()).toBe('light');
  });

  it('follows the system when the color mode is auto', () => {
    atGitHub('auto');
    prefersDark(true);
    expect(detectTheme()).toBe('dark');

    prefersDark(false);
    expect(detectTheme()).toBe('light');
  });
});
