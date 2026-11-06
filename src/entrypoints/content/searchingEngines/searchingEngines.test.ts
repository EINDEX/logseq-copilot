import { afterEach, describe, expect, test, vi } from 'vitest';
import { BUILT_IN_SEARCH_ENGINES } from '@/utils/storage';
import { CustomSearchEngine } from './searchingEngines';

type EngineConfig = ConstructorParameters<typeof CustomSearchEngine>[0];

// The built-in Kagi entry as stored by current and older versions.
const kagiConfig: EngineConfig = {
  id: 'kagi',
  name: 'Kagi',
  urlPattern: 'kagi\\.com$',
  querySelector: '?q',
  elementSelector: 'div.right-content-box',
  insertPosition: 'first',
};

describe('CustomSearchEngine.gotElement', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  describe('Kagi', () => {
    test('mounts inside the right sidebar so Kagi keeps the column open', () => {
      document.body.innerHTML = `
        <div class="right-content-box">
          <div class="_0_right_sidebar"></div>
        </div>`;

      const container = new CustomSearchEngine(kagiConfig).gotElement();

      const sidebar = document.querySelector('._0_right_sidebar');
      expect(container).not.toBeNull();
      expect(container?.parentElement).toBe(sidebar);
      expect(sidebar?.firstElementChild).toBe(container);
      // Kagi's `:has(> ._0_right_sidebar > *)` rule now matches, so the box
      // keeps its width. The sidebar is still the box's only child.
      expect(document.querySelector('.right-content-box')?.children).toHaveLength(1);
    });

    test('goes before the content Kagi already has in the sidebar', () => {
      document.body.innerHTML = `
        <div class="right-content-box">
          <div class="_0_right_sidebar"><div class="infobox"></div></div>
        </div>`;

      const container = new CustomSearchEngine(kagiConfig).gotElement();

      const sidebar = document.querySelector('._0_right_sidebar');
      expect(sidebar?.firstElementChild).toBe(container);
      expect(sidebar?.children).toHaveLength(2);
    });

    test('falls back to the box when the sidebar element is missing', () => {
      document.body.innerHTML = '<div class="right-content-box"></div>';

      const container = new CustomSearchEngine(kagiConfig).gotElement();

      const box = document.querySelector('.right-content-box');
      expect(container?.parentElement).toBe(box);
    });

    test('returns null when the right column is missing', () => {
      document.body.innerHTML = '<div id="main"></div>';

      expect(new CustomSearchEngine(kagiConfig).gotElement()).toBeNull();
    });
  });

  test('other engines still mount directly in the configured element', () => {
    document.body.innerHTML = `
      <section id="sidebar">
        <div class="_0_right_sidebar"></div>
      </section>`;

    const container = new CustomSearchEngine({
      id: 'searx',
      name: 'SearX',
      urlPattern: '^searx(ng)?\\.',
      querySelector: '?q',
      elementSelector: '#sidebar',
      insertPosition: 'first',
    }).gotElement();

    const sidebarColumn = document.getElementById('sidebar');
    expect(container?.parentElement).toBe(sidebarColumn);
    expect(sidebarColumn?.firstElementChild).toBe(container);
  });
});

describe('Startpage', () => {
  const startpage = BUILT_IN_SEARCH_ENGINES.find((engine) => engine.id === 'startpage')!;
  const engine = () =>
    new CustomSearchEngine({
      id: startpage.id,
      name: startpage.name,
      urlPattern: startpage.urlPattern!,
      querySelector: startpage.querySelector!,
      elementSelector: startpage.elementSelector!,
      insertPosition: startpage.insertPosition!,
    });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  test('mounts first in the right column, next to the results', () => {
    // The live result page (2026-11): the results and an empty right column
    // in <main>, the query in the search box.
    document.body.innerHTML = `
      <div id="root"><div class="Layout"><div>
        <form><input id="q" name="query" value="logseq copilot"></form>
        <main class="css-84ooco">
          <section id="main" class="css-rzlu9p"><div class="result"></div></section>
          <section id="sidebar" role="complementary" aria-label="sidebar" class="css-1sdrk1e"></section>
        </main>
      </div></div></div>`;

    const container = engine().gotElement();

    const sidebar = document.getElementById('sidebar');
    expect(engine().getQuery()).toBe('logseq copilot');
    expect(container?.parentElement).toBe(sidebar);
    expect(sidebar?.firstElementChild).toBe(container);
    expect(document.getElementById('main')?.contains(container)).toBe(false);
  });
});

describe('Brave Search', () => {
  const brave = BUILT_IN_SEARCH_ENGINES.find((engine) => engine.id === 'brave')!;
  const braveConfig: EngineConfig = {
    id: brave.id,
    name: brave.name,
    urlPattern: brave.urlPattern!,
    querySelector: brave.querySelector!,
    elementSelector: brave.elementSelector!,
    insertPosition: brave.insertPosition!,
  };
  // happy-dom's window API; not part of the DOM types.
  const setURL = (url: string) =>
    (window as unknown as { happyDOM: { setURL(url: string): void } }).happyDOM.setURL(url);
  const engineAt = (url: string) => {
    setURL(url);
    return new CustomSearchEngine(braveConfig);
  };

  afterEach(() => {
    setURL('http://localhost:3000/');
    document.body.innerHTML = '';
  });

  test('matches the result page and reads the query from ?q', () => {
    const engine = engineAt(
      'https://search.brave.com/search?q=logseq+copilot&source=web',
    );
    expect(engine.isMatch()).toBe(true);
    expect(engine.getQuery()).toBe('logseq copilot');
  });

  test('matches the other tabs, which carry the query too', () => {
    const engine = engineAt('https://search.brave.com/news?q=logseq');
    expect(engine.isMatch()).toBe(true);
    expect(engine.getQuery()).toBe('logseq');
  });

  test('has no query on the start page', () => {
    const engine = engineAt('https://search.brave.com/');
    expect(engine.isMatch()).toBe(true);
    expect(engine.getQuery()).toBeNull();
  });

  test('does not match other Brave sites', () => {
    expect(engineAt('https://brave.com/search/?q=logseq').isMatch()).toBe(false);
    expect(
      engineAt('https://community.brave.com/search?q=logseq').isMatch(),
    ).toBe(false);
  });

  describe('waits for hydration', () => {
    const hydrated = () => {
      const announcer = document.createElement('div');
      announcer.id = 'svelte-announcer';
      document.body.append(announcer);
    };
    const settled = async (ready: Promise<void>) => {
      let done = false;
      void ready.then(() => (done = true));
      await new Promise((resolve) => setTimeout(resolve, 0));
      return done;
    };

    afterEach(() => {
      vi.useRealTimers();
    });

    test('until SvelteKit adds #svelte-announcer', async () => {
      document.body.innerHTML = '<div id="main"></div>';
      const ready = engineAt('https://search.brave.com/search?q=logseq').whenReady();

      expect(await settled(ready)).toBe(false);
      hydrated();
      expect(await settled(ready)).toBe(true);
    });

    test('not when the page is hydrated already', async () => {
      document.body.innerHTML = '<div id="main"></div>';
      hydrated();
      expect(await settled(engineAt('https://search.brave.com/search?q=logseq').whenReady())).toBe(true);
    });

    test('3 s at most', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      document.body.innerHTML = '<div id="main"></div>';
      let done = false;
      void engineAt('https://search.brave.com/search?q=logseq').whenReady().then(() => (done = true));

      await vi.advanceTimersByTimeAsync(2_900);
      expect(done).toBe(false);
      await vi.advanceTimersByTimeAsync(100);
      expect(done).toBe(true);
    });

    test('only on Brave', async () => {
      document.body.innerHTML = '<div class="right-content-box"></div>';
      setURL('https://kagi.com/search?q=logseq');
      expect(await settled(new CustomSearchEngine(kagiConfig).whenReady())).toBe(true);
    });
  });

  describe('mount point', () => {
    // The real layout: the results (#mixed-main, 672px) and the right column
    // (#mixed-side, 400px, 48px gap), here with Brave's infobox in it.
    const resultPage = `
      <div class="serp-columns">
        <div class="serp-columns-main">
          <main class="main-column">
            <section id="mixed-main"><div class="snippet"></div></section>
          </main>
        </div>
        <div class="serp-columns-side">
          <div class="sidebar-lip"></div>
          <section id="mixed-side"><div id="infobox-snippet"></div></section>
        </div>
      </div>`;

    /**
     * A window `width` wide with the results from `left` to `right`, and the
     * first result at `snippet.left` with `snippet.padding` left padding.
     */
    const layout = (
      width: number,
      { left, right }: { left: number; right: number },
      snippet = { left, padding: 24 },
    ) => {
      vi.spyOn(document.documentElement, 'clientWidth', 'get').mockReturnValue(width);
      vi.spyOn(
        document.getElementById('mixed-main')!,
        'getBoundingClientRect',
      ).mockReturnValue({ left, right } as DOMRect);
      const first = document.querySelector<HTMLElement>('#mixed-main .snippet')!;
      first.style.paddingLeft = `${snippet.padding}px`;
      vi.spyOn(first, 'getBoundingClientRect').mockReturnValue({
        left: snippet.left,
      } as DOMRect);
    };
    const mount = () =>
      engineAt('https://search.brave.com/search?q=logseq').gotElement();

    afterEach(() => {
      vi.restoreAllMocks();
    });

    test('goes first in the right column, before the infobox', () => {
      document.body.innerHTML = resultPage;
      // Brave at 1440px.
      layout(1425, { left: 178, right: 850 });

      const container = mount() as HTMLElement;

      const side = document.getElementById('mixed-side');
      expect(container.parentElement).toBe(side);
      expect(side?.firstElementChild).toBe(container);
      expect(side?.children).toHaveLength(2);
      // Level with the first result and Brave's infobox.
      expect(container.style.marginTop).toBe('24px');
      expect(container.style.paddingLeft).toBe('');
    });

    test('goes above the results when the right column would be cut off', () => {
      document.body.innerHTML = resultPage;
      // Brave at 1100px: 310px right of the results, the column needs 448px.
      layout(1085, { left: 103, right: 775 });

      const container = mount() as HTMLElement;

      const main = document.getElementById('mixed-main');
      expect(main?.firstElementChild).toBe(container);
      expect(document.getElementById('mixed-side')?.children).toHaveLength(1);
      // Level with the text of the results.
      expect(container.style.paddingLeft).toBe('24px');
    });

    test('goes above the results on the narrow layout', () => {
      document.body.innerHTML = resultPage;
      // Brave at 600px: one column, the right column is hidden. The results
      // reach the window edges (-16px margins) and their text does not.
      layout(585, { left: 16, right: 569 }, { left: 0, padding: 16 });

      const container = mount() as HTMLElement;
      expect(document.getElementById('mixed-main')?.firstElementChild).toBe(container);
      expect(container.style.paddingLeft).toBe('');
    });

    test('goes above the results when there is no right column', () => {
      document.body.innerHTML = resultPage;
      document.querySelector('.serp-columns-side')?.remove();
      layout(1425, { left: 178, right: 850 });

      const container = mount();
      expect(document.getElementById('mixed-main')?.firstElementChild).toBe(container);
    });

    test('returns null on a page without results', () => {
      document.body.innerHTML = '<div id="main"></div>';
      expect(mount()).toBeNull();
    });
  });
});
