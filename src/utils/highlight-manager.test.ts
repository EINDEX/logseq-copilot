/**
 * Highlight colors. `::highlight()` paints text in the page document, so the
 * light/dark variant has to follow the host page theme. It cannot key off the
 * extension UI's own `[data-theme-container].dark`: that element lives in a
 * shadow root, which a stylesheet in document.head does not reach.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing';
import { HighlightManager } from './highlight-manager';
import { HighlightService } from './highlight-service';
import type { HighlightData } from '@/types/highlight';

const data: HighlightData = {
  id: 'h1',
  url: 'http://localhost:3000/',
  title: 'Page',
  hostname: 'localhost',
  color: 'yellow',
  range: {
    startContainerXPath: '/html/body[1]/p[1]',
    endContainerXPath: '/html/body[1]/p[1]',
    startOffset: 0,
    endOffset: 5,
    textContent: 'hello',
  },
  createdAt: 1,
  lastAccessedAt: 1,
};

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const injectedCss = () =>
  document.querySelector(`style[data-highlight="logseq-highlight-${data.id}"]`)
    ?.textContent ?? '';

/** Selectors of the `::highlight(...)` rules in the injected stylesheet. */
const highlightSelectors = () =>
  [...injectedCss().matchAll(/([^{}]+)\{[^}]*\}/g)].map((m) => m[1].trim());

/** Does a selector's originating element exist in the page document? */
const matchesInPage = (selector: string) =>
  document.querySelector(selector.replace(/::highlight\([^)]*\)$/, '*')) !==
  null;

const darkSelector = () => highlightSelectors().find((s) => /dark/.test(s));

describe('HighlightManager highlight colors', () => {
  const manager = () => HighlightManager.getInstance();

  beforeEach(() => {
    fakeBrowser.reset();
    (globalThis as any).CSS = { highlights: new Map() };
    (globalThis as any).Highlight = class {
      add() {}
      clear() {}
    };
    manager().cleanup();
    document.head.querySelectorAll('style').forEach((el) => el.remove());
    document.documentElement.className = '';
    document.documentElement.removeAttribute('data-theme');
    document.body.innerHTML = '<p id="p">hello world</p>';
    vi.spyOn(HighlightService, 'deserializeRange').mockImplementation(() => {
      const range = document.createRange();
      range.selectNodeContents(document.getElementById('p')!);
      return range;
    });
    vi.spyOn(HighlightService, 'updateLastAccessed').mockResolvedValue();
  });

  afterEach(() => {
    manager().cleanup();
    vi.restoreAllMocks();
  });

  it('does not key the dark rule off an element in the extension shadow root', async () => {
    await manager().displayHighlight(data);

    expect(injectedCss()).not.toContain('data-theme-container');
  });

  it('applies the dark color when the host page is dark', async () => {
    document.documentElement.classList.add('dark');
    await manager().displayHighlight(data);

    const dark = darkSelector();
    expect(dark).toBeDefined();
    expect(matchesInPage(dark!)).toBe(true);
  });

  it('does not apply the dark color when the host page is light', async () => {
    document.documentElement.classList.add('light');
    await manager().displayHighlight(data);

    const dark = darkSelector();
    expect(dark).toBeDefined();
    expect(matchesInPage(dark!)).toBe(false);
  });

  it('follows the page when its theme changes', async () => {
    document.documentElement.classList.add('light');
    await manager().displayHighlight(data);
    const dark = darkSelector()!;
    expect(matchesInPage(dark)).toBe(false);

    document.documentElement.classList.replace('light', 'dark');
    await flush();
    expect(matchesInPage(dark)).toBe(true);

    document.documentElement.classList.replace('dark', 'light');
    await flush();
    expect(matchesInPage(dark)).toBe(false);
  });

  it('removes its marker from the page on cleanup', async () => {
    document.documentElement.classList.add('dark');
    await manager().displayHighlight(data);
    const dark = darkSelector()!;
    expect(matchesInPage(dark)).toBe(true);

    manager().cleanup();

    expect(matchesInPage(dark)).toBe(false);
  });
});
