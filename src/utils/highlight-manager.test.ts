/**
 * What the content script does with the saved highlights: restore them once
 * per page load, follow changes made in other contexts (the browser sidebar,
 * the options page) without ever writing storage itself, scroll to one on
 * request, and color them for the theme of the host page.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing';
import { HighlightManager } from './highlight-manager';
import {
  HighlightService,
  deleteHighlight,
  updateHighlightNote,
} from './highlight-service';
import { contentEvents } from './content-events';
import type { HighlightData } from '@/types/highlight';

const highlight = (
  id: string,
  overrides: Partial<HighlightData> = {},
): HighlightData => ({
  id,
  url: window.location.href,
  title: 'Page',
  hostname: window.location.hostname,
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
  ...overrides,
});

const seed = (items: HighlightData[]) =>
  fakeBrowser.storage.local.set({ highlights: items });

const stored = async (): Promise<HighlightData[]> =>
  (await fakeBrowser.storage.local.get('highlights')).highlights ?? [];

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
};

/** The CSS Highlight API, as far as the manager uses it. */
class FakeHighlight {
  ranges: Range[] = [];
  add(range: Range) {
    this.ranges.push(range);
    return this;
  }
  clear() {
    this.ranges = [];
  }
  [Symbol.iterator]() {
    return this.ranges[Symbol.iterator]();
  }
}

const name = (id: string) => `logseq-highlight-${id}`;

describe('HighlightManager', () => {
  let registry: Map<string, FakeHighlight>;
  let removed: string[];
  let updated: HighlightData[];
  let scrollIntoView: ReturnType<typeof vi.fn>;
  let scrollBy: ReturnType<typeof vi.fn>;
  let animate: ReturnType<typeof vi.fn>;
  const offs: Array<() => void> = [];

  const manager = () => HighlightManager.getInstance();

  /** A range over the page's paragraph, as if worked out from the XPath. */
  const paragraphRange = (rect = { top: 0, height: 0, width: 0 }) => {
    const range = document.createRange();
    range.selectNodeContents(document.getElementById('p')!);
    range.getBoundingClientRect = () => rect as DOMRect;
    return range;
  };

  beforeEach(() => {
    fakeBrowser.reset();
    registry = new Map();
    (globalThis as any).CSS = { highlights: registry };
    (globalThis as any).Highlight = FakeHighlight;
    document.head.querySelectorAll('style').forEach((el) => el.remove());
    document.body.innerHTML = '<p id="p">hello world</p>';

    // happy-dom does not lay out or scroll.
    scrollIntoView = vi.fn();
    scrollBy = vi.fn();
    animate = vi.fn();
    Object.assign(Element.prototype, { scrollIntoView, animate });
    Object.assign(window, { scrollBy });

    // ... and has no XPath.
    vi.spyOn(HighlightService, 'deserializeRange').mockImplementation(() =>
      paragraphRange(),
    );

    removed = [];
    updated = [];
    offs.push(
      contentEvents.on('highlightRemoved', ({ highlightId }) =>
        removed.push(highlightId),
      ),
      contentEvents.on('highlightUpdated', (h) => updated.push(h)),
    );
  });

  afterEach(() => {
    manager().cleanup();
    // A new manager next time, for the new CSS.highlights.
    (HighlightManager as unknown as { instance: null }).instance = null;
    offs.splice(0).forEach((off) => off());
    history.replaceState({}, '', '/');
    vi.restoreAllMocks();
  });

  describe('restoring the highlights of the page', () => {
    it('shows them all and touches them in a single write', async () => {
      await seed([
        highlight('a'),
        highlight('b'),
        highlight('c'),
        highlight('elsewhere', { url: 'https://other.example/' }),
      ]);
      const set = vi.spyOn(fakeBrowser.storage.local, 'set');

      await manager().initialize();

      expect([...registry.keys()].sort()).toEqual([
        name('a'),
        name('b'),
        name('c'),
      ]);
      expect(set).toHaveBeenCalledTimes(1);
      const saved = await stored();
      for (const id of ['a', 'b', 'c']) {
        expect(saved.find((h) => h.id === id)!.lastAccessedAt).toBeGreaterThan(
          1,
        );
      }
      expect(saved.find((h) => h.id === 'elsewhere')!.lastAccessedAt).toBe(1);
    });

    it('only touches the highlights it could show', async () => {
      const broken = { ...highlight('b').range, textContent: 'broken' };
      await seed([highlight('a'), highlight('b', { range: broken })]);
      vi.mocked(HighlightService.deserializeRange).mockImplementation(
        (serialized) =>
          serialized.textContent === 'broken' ? null : paragraphRange(),
      );
      const set = vi.spyOn(fakeBrowser.storage.local, 'set');

      await manager().initialize();

      expect([...registry.keys()]).toEqual([name('a')]);
      expect(set).toHaveBeenCalledTimes(1);
      const saved = await stored();
      expect(saved.find((h) => h.id === 'a')!.lastAccessedAt).toBeGreaterThan(
        1,
      );
      expect(saved.find((h) => h.id === 'b')!.lastAccessedAt).toBe(1);
    });

    it('writes nothing when the page has no highlights', async () => {
      await seed([highlight('elsewhere', { url: 'https://other.example/' })]);
      const set = vi.spyOn(fakeBrowser.storage.local, 'set');

      await manager().initialize();

      expect(set).not.toHaveBeenCalled();
    });

    it('writes nothing when none of them can be shown', async () => {
      await seed([highlight('a')]);
      vi.mocked(HighlightService.deserializeRange).mockReturnValue(null);
      const set = vi.spyOn(fakeBrowser.storage.local, 'set');

      await manager().initialize();

      expect(registry.size).toBe(0);
      expect(set).not.toHaveBeenCalled();
    });

    it('writes nothing when it shows a single highlight', async () => {
      await seed([highlight('a')]);
      const set = vi.spyOn(fakeBrowser.storage.local, 'set');

      await expect(manager().displayHighlight(highlight('a'))).resolves.toBe(
        true,
      );

      expect(registry.has(name('a'))).toBe(true);
      expect(set).not.toHaveBeenCalled();
      expect((await stored())[0].lastAccessedAt).toBe(1);
    });
  });

  describe('following changes made in other contexts', () => {
    it('stops showing a highlight that was deleted, without writing storage', async () => {
      await seed([highlight('a'), highlight('b')]);
      await manager().initialize();
      const set = vi.spyOn(fakeBrowser.storage.local, 'set');
      const remove = vi.spyOn(fakeBrowser.storage.local, 'remove');

      await deleteHighlight('a');
      await vi.waitFor(() => expect(removed).toEqual(['a']));

      expect([...registry.keys()]).toEqual([name('b')]);
      // The only write is the deletion itself.
      await flush();
      expect(set).toHaveBeenCalledTimes(1);
      expect(remove).not.toHaveBeenCalled();
      expect((await stored()).map((h) => h.id)).toEqual(['b']);
    });

    it('stops showing every highlight when they are all cleared', async () => {
      await seed([highlight('a'), highlight('b')]);
      await manager().initialize();

      await fakeBrowser.storage.local.remove('highlights');
      await vi.waitFor(() => expect(removed.sort()).toEqual(['a', 'b']));

      expect(registry.size).toBe(0);
    });

    it('ignores a deleted highlight of another page', async () => {
      await seed([
        highlight('a'),
        highlight('elsewhere', { url: 'https://other.example/' }),
      ]);
      await manager().initialize();

      await deleteHighlight('elsewhere');
      await flush();

      expect(removed).toEqual([]);
      expect([...registry.keys()]).toEqual([name('a')]);
    });

    it('still removes a highlight shown before the page navigated on its own', async () => {
      await seed([highlight('a')]);
      await manager().initialize();
      const restoredAt = window.location.href;
      // A single page app moves on without reloading the content script.
      history.pushState({}, '', '/next');
      expect(window.location.href).not.toBe(restoredAt);

      await deleteHighlight('a');
      await vi.waitFor(() => expect(removed).toEqual(['a']));

      expect(registry.size).toBe(0);
    });

    it('tells the comment popup when the note of a highlight changed', async () => {
      await seed([highlight('a'), highlight('b')]);
      await manager().initialize();

      await updateHighlightNote('a', 'a new note');
      await vi.waitFor(() => expect(updated).toHaveLength(1));

      expect(updated[0]).toMatchObject({ id: 'a', note: 'a new note' });
      // Still shown, and nothing was removed.
      expect(registry.has(name('a'))).toBe(true);
      expect(removed).toEqual([]);
    });

    it('does not report notes of other pages, or other changes', async () => {
      await seed([
        highlight('a'),
        highlight('elsewhere', { url: 'https://other.example/' }),
      ]);
      await manager().initialize();

      await updateHighlightNote('elsewhere', 'not for this page');
      await HighlightService.updateLastAccessed('a');
      await HighlightService.updateHighlight('a', { color: 'blue' });
      await flush();

      expect(updated).toEqual([]);
    });

    it('does not report a note that was saved as it already was', async () => {
      await seed([highlight('a', { note: 'same' })]);
      await manager().initialize();

      await updateHighlightNote('a', 'same');
      await flush();

      expect(updated).toEqual([]);
    });

    it('waits for the restore before it applies a change', async () => {
      await seed([highlight('a'), highlight('b')]);
      const restore = deferred<HighlightData[]>();
      vi.spyOn(HighlightService, 'getCurrentPageHighlights').mockReturnValue(
        restore.promise,
      );
      const starting = manager().initialize();

      // `a` is deleted while the restore, which read both, is still going on.
      await fakeBrowser.storage.local.set({ highlights: [highlight('b')] });
      await flush();
      expect(removed).toEqual([]);

      restore.resolve([highlight('a'), highlight('b')]);
      await starting;
      await vi.waitFor(() => expect(removed).toEqual(['a']));

      expect([...registry.keys()]).toEqual([name('b')]);
    });

    it('stops following when it is cleaned up', async () => {
      await seed([highlight('a')]);
      await manager().initialize();

      manager().cleanup();
      await deleteHighlight('a');
      await flush();

      expect(removed).toEqual([]);
    });

    it('does not listen twice when it is initialized twice', async () => {
      await seed([highlight('a')]);
      await manager().initialize();
      await manager().initialize();

      await deleteHighlight('a');
      await vi.waitFor(() => expect(removed).toEqual(['a']));
      await flush();

      expect(removed).toEqual(['a']);
    });
  });

  describe('scrolling to a highlight', () => {
    const rect = { top: 500, height: 20, width: 100 };

    it('centers the displayed range and flashes the highlight', async () => {
      await seed([highlight('a')]);
      vi.mocked(HighlightService.deserializeRange).mockImplementation(() =>
        paragraphRange(rect),
      );
      await manager().initialize();

      expect(await manager().scrollToHighlight('a')).toBe(true);

      expect(scrollIntoView).toHaveBeenCalledWith({
        block: 'center',
        inline: 'nearest',
        behavior: 'instant',
      });
      // The middle of the range, minus the middle of the viewport.
      expect(scrollBy).toHaveBeenCalledWith({
        top: 500 + 10 - window.innerHeight / 2,
        behavior: 'smooth',
      });
      expect(
        document.getElementById('highlight-flash-animation'),
      ).not.toBeNull();
      expect(animate).not.toHaveBeenCalled();
    });

    it('does not scroll the page by a range with no size', async () => {
      await seed([highlight('a')]);
      await manager().initialize();

      expect(await manager().scrollToHighlight('a')).toBe(true);

      expect(scrollIntoView).toHaveBeenCalledTimes(1);
      expect(scrollBy).not.toHaveBeenCalled();
    });

    it('waits for the restore', async () => {
      await seed([highlight('a')]);
      const restore = deferred<HighlightData[]>();
      vi.spyOn(HighlightService, 'getCurrentPageHighlights').mockReturnValue(
        restore.promise,
      );
      void manager().initialize();

      const scrolling = manager().scrollToHighlight('a');
      await flush();
      expect(scrollIntoView).not.toHaveBeenCalled();

      restore.resolve([highlight('a')]);
      expect(await scrolling).toBe(true);
      expect(scrollIntoView).toHaveBeenCalled();
      // It is the restored highlight that was flashed.
      expect(
        document.getElementById('highlight-flash-animation'),
      ).not.toBeNull();
      expect(animate).not.toHaveBeenCalled();
    });

    it('resolves to false for a highlight the page does not have', async () => {
      await seed([
        highlight('a'),
        highlight('elsewhere', { url: 'https://other.example/' }),
      ]);
      await manager().initialize();

      expect(await manager().scrollToHighlight('missing')).toBe(false);
      expect(await manager().scrollToHighlight('elsewhere')).toBe(false);

      expect(scrollIntoView).not.toHaveBeenCalled();
      expect(scrollBy).not.toHaveBeenCalled();
    });

    describe('without the CSS Highlight API', () => {
      beforeEach(() => {
        (globalThis as any).CSS = {};
        vi.spyOn(console, 'error').mockImplementation(() => {});
      });

      it('works the range out from the saved highlight', async () => {
        await seed([highlight('a')]);
        vi.mocked(HighlightService.deserializeRange).mockImplementation(() =>
          paragraphRange(rect),
        );
        await manager().initialize();
        expect(HighlightManager.isSupported()).toBe(false);

        expect(await manager().scrollToHighlight('a')).toBe(true);

        expect(HighlightService.deserializeRange).toHaveBeenCalledWith(
          highlight('a').range,
        );
        expect(scrollIntoView).toHaveBeenCalledTimes(1);
        expect(scrollBy).toHaveBeenCalledWith({
          top: 500 + 10 - window.innerHeight / 2,
          behavior: 'smooth',
        });
      });

      it('pulses an outline around the element, leaving the page alone', async () => {
        await seed([highlight('a')]);
        await manager().initialize();
        const before = document.body.innerHTML;

        await manager().scrollToHighlight('a');

        expect(animate).toHaveBeenCalledTimes(1);
        const [keyframes, options] = animate.mock.calls[0];
        expect(keyframes).toHaveLength(2);
        expect(keyframes[1].outline).toContain('transparent');
        expect(options).toMatchObject({ duration: 1000 });
        expect(document.body.innerHTML).toBe(before);
        expect(document.head.querySelector('style')).toBeNull();
        expect(window.getSelection()?.rangeCount).toBe(0);
      });

      it('scrolls without feedback where elements cannot be animated', async () => {
        await seed([highlight('a')]);
        delete (Element.prototype as Partial<Element>).animate;
        await manager().initialize();

        expect(await manager().scrollToHighlight('a')).toBe(true);

        expect(scrollIntoView).toHaveBeenCalledTimes(1);
      });

      it('resolves to false when the range cannot be worked out', async () => {
        await seed([highlight('a')]);
        vi.mocked(HighlightService.deserializeRange).mockReturnValue(null);
        await manager().initialize();

        expect(await manager().scrollToHighlight('a')).toBe(false);
        expect(await manager().scrollToHighlight('missing')).toBe(false);

        expect(scrollIntoView).not.toHaveBeenCalled();
      });

      it('still follows changes made in other contexts', async () => {
        await seed([highlight('a')]);
        await manager().initialize();

        await updateHighlightNote('a', 'a new note');
        await vi.waitFor(() => expect(updated).toHaveLength(1));
        await deleteHighlight('a');
        await vi.waitFor(() => expect(removed).toEqual(['a']));
      });
    });
  });

  /**
   * `::highlight()` paints text in the page document, so the light/dark
   * variant has to follow the host page theme. It cannot key off the extension
   * UI's own `[data-theme-container].dark`: that element lives in a shadow
   * root, which a stylesheet in document.head does not reach.
   */
  describe('highlight colors', () => {
    const data = highlight('h1');

    const resetPageTheme = () => {
      document.documentElement.className = '';
      document.documentElement.removeAttribute('data-theme');
    };

    const injectedCss = () =>
      document.querySelector(`style[data-highlight="${name(data.id)}"]`)
        ?.textContent ?? '';

    /** Selectors of the `::highlight(...)` rules in the injected stylesheet. */
    const highlightSelectors = () =>
      [...injectedCss().matchAll(/([^{}]+)\{[^}]*\}/g)].map((m) => m[1].trim());

    /** Does a selector's originating element exist in the page document? */
    const matchesInPage = (selector: string) =>
      document.querySelector(selector.replace(/::highlight\([^)]*\)$/, '*')) !==
      null;

    const darkSelector = () => highlightSelectors().find((s) => /dark/.test(s));

    beforeEach(resetPageTheme);
    afterEach(resetPageTheme);

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
});
