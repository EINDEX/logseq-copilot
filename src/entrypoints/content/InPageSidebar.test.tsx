/**
 * The highlights sidebar drawn on the page, for browsers without one of their
 * own. The data and the panel are the browser sidebar's (tested with it);
 * this covers what differs: the page it reads, jumping in the page itself,
 * closing, and following the open state and in-page navigations.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { fakeBrowser } from 'wxt/testing';
import type { ContentScriptContext } from 'wxt/utils/content-script-context';
import type { HighlightData } from '@/types/highlight';

vi.mock('@/assets/globals.css', () => ({}));
// logseq:urlSearch (what Logseq has about the page) has a mock of its own.
const sendMessage = vi.hoisted(() => vi.fn());
const urlSearch = vi.hoisted(() => vi.fn());
vi.mock('@/types/messaging', () => ({
  sendMessage: (type: string, ...args: unknown[]) =>
    type === 'logseq:urlSearch'
      ? urlSearch(...args)
      : sendMessage(type, ...args),
}));
// Mounts like WXT does (host in the page, onMount / onRemove), without the
// shadow root, so the queries below see the UI.
const fakeUi = vi.hoisted(() => async (_ctx: unknown, options: any) => {
  const host = document.createElement(options.name);
  const container = document.createElement('div');
  host.append(container);
  let mounted: unknown;
  return {
    shadowHost: host,
    // Stands in for the shadow root: events in the UI bubble up to the host.
    shadow: host,
    uiContainer: container,
    mount() {
      document.body.append(host);
      mounted = options.onMount(container, undefined, host);
    },
    remove() {
      options.onRemove?.(mounted);
      host.remove();
      container.replaceChildren();
      mounted = undefined;
    },
    get mounted() {
      return mounted;
    },
  };
});
vi.mock('wxt/utils/content-script-ui/shadow-root', () => ({
  createShadowRootUi: vi.fn(fakeUi),
}));

import { createShadowRootUi } from 'wxt/utils/content-script-ui/shadow-root';
import { contentEvents } from '@/utils/content-events';
import { HighlightManager } from '@/utils/highlight-manager';
import log from '@/utils/logger';
import { InPageSidebar, startInPageSidebar } from './InPageSidebar';

const PAGE = 'https://one.example/page';
const GRAPH = 'my notes';

/** Logseq has a block about every page, naming the page's path. */
const logseqAnswers = async ({ url }: { url: string }) => ({
  status: 200,
  msg: '',
  response: {
    graph: GRAPH,
    pages: [],
    blocks: [
      {
        uuid: `block-${url}`,
        html: `<p>about ${new URL(url).pathname} <a href="logseq://graph/my%20notes?page=books">books</a></p>`,
        page: { id: 1, name: 'reading', originalName: 'Reading', uuid: 'p1' },
        content: '',
        format: 'markdown',
        marker: '',
        priority: '',
      },
    ],
  },
});

/**
 * A user's click (happy-dom events are not trusted) on a link itself: happy-dom
 * follows a link clicked through a child even when its default is prevented.
 * Returns whether the default was prevented.
 */
const userClick = (target: Element) => {
  const event = new MouseEvent('click', {
    bubbles: true,
    cancelable: true,
    composed: true,
    button: 0,
  });
  Object.defineProperty(event, 'isTrusted', { value: true });
  act(() => {
    target.dispatchEvent(event);
  });
  return event.defaultPrevented;
};

const highlight = (
  id: string,
  overrides: Partial<HighlightData> = {},
): HighlightData => ({
  id,
  url: PAGE,
  title: 'Page one',
  hostname: 'one.example',
  range: {
    startContainerXPath: '/html/body[1]/p[1]',
    endContainerXPath: '/html/body[1]/p[1]',
    startOffset: 0,
    endOffset: 5,
    textContent: `text of ${id}`,
  },
  createdAt: Date.now(),
  lastAccessedAt: Date.now(),
  ...overrides,
});

const seed = (items: HighlightData[]) =>
  fakeBrowser.storage.local.set({ highlights: items });

const isOpen = async () =>
  (await fakeBrowser.storage.local.get('inPageSidebarOpen')).inPageSidebarOpen;

const setOpen = (open: boolean) =>
  act(async () => {
    await fakeBrowser.storage.local.set({ inPageSidebarOpen: open });
  });

const text = (value: string) => screen.queryByText(value);
const notice = () => screen.queryByRole('status')?.textContent ?? null;
const host = () => document.querySelector('logseq-copilot-highlights');

describe('InPageSidebar', () => {
  beforeEach(() => {
    fakeBrowser.reset();
    sendMessage.mockReset().mockResolvedValue(undefined);
    urlSearch.mockReset().mockImplementation(logseqAnswers);
    vi.spyOn(log, 'error').mockImplementation(() => {});
    vi.spyOn(log, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('lists the highlights of the page, then what Logseq has about it', async () => {
    await seed([
      highlight('a'),
      highlight('elsewhere', { url: 'https://two.example/article' }),
    ]);

    render(<InPageSidebar url={PAGE} />);

    expect(await screen.findByText('text of a')).not.toBeNull();
    expect(text('text of elsewhere')).toBeNull();
    expect(await screen.findByText(/about \/page/)).not.toBeNull();
    expect(urlSearch).toHaveBeenCalledWith({ url: PAGE });
    expect(screen.getByRole('link', { name: GRAPH })).not.toBeNull();
  });

  it('shows the highlights when Logseq cannot be searched', async () => {
    urlSearch.mockResolvedValue({
      status: 500,
      msg: 'Cannot connect to Logseq',
      response: undefined,
    });
    await seed([highlight('a')]);

    render(<InPageSidebar url={PAGE} />);

    expect((await screen.findByRole('alert')).textContent).toContain(
      'Cannot connect to Logseq',
    );
    expect(text('text of a')).not.toBeNull();
  });

  it('checks a task off in Logseq', async () => {
    urlSearch.mockResolvedValue({
      status: 200,
      msg: '',
      response: {
        graph: GRAPH,
        pages: [],
        blocks: [
          {
            uuid: 'task-1',
            html: '<p>read it</p>',
            page: { id: 1, name: 'reading', originalName: 'Reading', uuid: 'p1' },
            content: '',
            format: 'markdown',
            marker: 'TODO',
            priority: '',
          },
        ],
      },
    });
    sendMessage.mockResolvedValue({
      type: 'change-block-marker-result',
      uuid: 'task-1',
      status: 'success',
      marker: 'DONE',
    });
    render(<InPageSidebar url={PAGE} />);
    await screen.findByText('read it');

    fireEvent.click(screen.getByRole('checkbox', { name: 'Mark as DONE' }));

    await waitFor(() =>
      expect(screen.getByRole('checkbox').getAttribute('aria-checked')).toBe('true'),
    );
    expect(sendMessage).toHaveBeenCalledWith('logseq:changeBlockMarker', {
      uuid: 'task-1',
      marker: 'DONE',
    });
  });

  it('searches the graph, and keeps the result while the page navigates, until cleared', async () => {
    sendMessage.mockImplementation(async (type: string, query: unknown) =>
      type === 'logseq:search'
        ? (await logseqAnswers({ url: `https://found.example/${query}` }))
        : undefined,
    );
    const { rerender } = render(<InPageSidebar url={PAGE} />);
    await screen.findByText(/about \/page/);
    const box = screen.getByRole('searchbox', { name: 'Search Logseq' }) as HTMLInputElement;

    fireEvent.change(box, { target: { value: 'books' } });
    fireEvent.submit(box.form!);

    expect(await screen.findByText(/about \/books/)).not.toBeNull();
    expect(sendMessage).toHaveBeenCalledWith('logseq:search', 'books');

    // What startInPageSidebar does after an in-page navigation.
    rerender(<InPageSidebar url={new URL('/next', PAGE).href} />);
    await waitFor(() =>
      expect(urlSearch).toHaveBeenCalledWith({ url: new URL('/next', PAGE).href }),
    );
    expect(screen.getByText(/about \/books/)).not.toBeNull();
    expect(box.value).toBe('books');

    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));

    expect(screen.queryByText(/about \/books/)).toBeNull();
    expect(await screen.findByText(/about \/next/)).not.toBeNull();
  });

  describe('clipping', () => {
    const button = (name: string) =>
      screen.getByRole('button', { name }) as HTMLButtonElement;

    /** Text of the page, outside the sidebar, selected like a user would. */
    const selectOnPage = (words: string) => {
      const paragraph = document.createElement('p');
      paragraph.textContent = words;
      document.body.prepend(paragraph);
      const range = document.createRange();
      range.selectNodeContents(paragraph);
      act(() => {
        getSelection()!.removeAllRanges();
        getSelection()!.addRange(range);
        document.dispatchEvent(new Event('selectionchange'));
      });
      return paragraph;
    };

    afterEach(() => {
      getSelection()?.removeAllRanges();
      document.querySelectorAll('body > p').forEach((p) => p.remove());
    });

    it('offers Clip selection while the page has a selection', async () => {
      render(<InPageSidebar url={PAGE} />);
      await screen.findByText(/about \/page/);
      expect(button('Clip selection').disabled).toBe(true);

      selectOnPage('words on the page');
      expect(button('Clip selection').disabled).toBe(false);

      act(() => {
        getSelection()!.removeAllRanges();
        document.dispatchEvent(new Event('selectionchange'));
      });
      expect(button('Clip selection').disabled).toBe(true);
    });

    it('keeps the selection when Clip selection is pressed, and clips it', async () => {
      render(<InPageSidebar url={PAGE} />);
      await screen.findByText(/about \/page/);
      selectOnPage('words worth keeping');

      const press = new MouseEvent('mousedown', {
        bubbles: true,
        cancelable: true,
        composed: true,
        button: 0,
      });
      button('Clip selection').dispatchEvent(press);

      expect(press.defaultPrevented).toBe(true);
      expect(getSelection()!.toString()).toBe('words worth keeping');

      await act(async () => {
        fireEvent.click(button('Clip selection'));
      });

      // The content script's own clip, straight to the background.
      await waitFor(() =>
        expect(sendMessage).toHaveBeenCalledWith(
          'logseq:clipWithSelection',
          expect.stringContaining('words worth keeping'),
        ),
      );
      expect(sendMessage).not.toHaveBeenCalledWith(
        'content:quickCaptureWithSelection',
        expect.anything(),
      );
    });

    it('clips the page, then searches it again', async () => {
      render(<InPageSidebar url={PAGE} />);
      await screen.findByText(/about \/page/);

      await act(async () => {
        fireEvent.click(button('Clip page'));
      });

      expect(sendMessage).toHaveBeenCalledWith('logseq:clipPage');
      await waitFor(() => expect(urlSearch).toHaveBeenCalledTimes(2));
      expect(button('Clip page').dataset.done).toBe('true');
    });

    it('shows why a clip failed in the sidebar, not in the page', async () => {
      const emitted = vi.spyOn(contentEvents, 'emit');
      sendMessage.mockImplementation(async (type: string) => {
        if (type === 'logseq:clipPage') throw new Error('The authorization token is wrong');
      });
      render(<InPageSidebar url={PAGE} />);
      await screen.findByText(/about \/page/);

      await act(async () => {
        fireEvent.click(button('Clip page'));
      });

      expect((await screen.findByRole('alert')).textContent).toBe(
        'The authorization token is wrong',
      );
      expect(button('Clip page').getAttribute('aria-invalid')).toBe('true');
      expect(emitted).not.toHaveBeenCalled();
    });
  });

  it('opens the settings', async () => {
    render(<InPageSidebar url={PAGE} />);

    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));

    expect(sendMessage).toHaveBeenCalledWith('app:openOptions');
  });

  it('follows highlights changed elsewhere', async () => {
    await seed([highlight('a')]);
    render(<InPageSidebar url={PAGE} />);
    await screen.findByText('text of a');

    await act(() => seed([highlight('a'), highlight('b')]));

    expect(await screen.findByText('text of b')).not.toBeNull();
  });

  it('scrolls the page to a highlight that is clicked', async () => {
    const scroll = vi
      .spyOn(HighlightManager.prototype, 'scrollToHighlight')
      .mockResolvedValue(true);
    await seed([highlight('a')]);
    render(<InPageSidebar url={PAGE} />);

    fireEvent.click(await screen.findByText('text of a'));

    await waitFor(() => expect(scroll).toHaveBeenCalledWith('a'));
    expect(notice()).toBeNull();
  });

  it('tells the user when the page does not have the highlight', async () => {
    vi.spyOn(HighlightManager.prototype, 'scrollToHighlight').mockResolvedValue(
      false,
    );
    await seed([highlight('a')]);
    render(<InPageSidebar url={PAGE} />);

    fireEvent.click(await screen.findByText('text of a'));

    await waitFor(() =>
      expect(notice()).toBe("Couldn't find this highlight on the page"),
    );
  });

  it('closes, in every tab, with the close button', async () => {
    await fakeBrowser.storage.local.set({ inPageSidebarOpen: true });
    render(<InPageSidebar url={PAGE} />);

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    await waitFor(async () => expect(await isOpen()).toBe(false));
  });
});

describe('startInPageSidebar', () => {
  // The page the content script runs in (the test document's origin).
  const HERE = new URL('/page', location.href).href;
  let locationChanged: ((event: { newUrl: URL }) => void) | undefined;
  let invalidated: AbortController;
  const ctx = {
    addEventListener: vi.fn(
      (
        target: EventTarget,
        type: string,
        handler: (event: { newUrl: URL }) => void,
      ) => {
        if (type === 'wxt:locationchange') locationChanged = handler;
        else
          target.addEventListener(type, handler as unknown as EventListener, {
            signal: invalidated.signal,
          });
      },
    ),
  } as unknown as ContentScriptContext;
  const start = () => act(() => startInPageSidebar(ctx));
  // Lets a redraw, and the storage read it starts, finish.
  const settle = () =>
    act(() => new Promise((resolve) => setTimeout(resolve, 0)));

  beforeEach(() => {
    fakeBrowser.reset();
    sendMessage.mockReset().mockResolvedValue(undefined);
    urlSearch.mockReset().mockImplementation(logseqAnswers);
    vi.mocked(createShadowRootUi).mockClear();
    vi.spyOn(log, 'error').mockImplementation(() => {});
    locationChanged = undefined;
    invalidated = new AbortController();
    history.replaceState(null, '', HERE);
    document.title = 'Page one';
  });

  afterEach(async () => {
    await setOpen(false);
    invalidated.abort();
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('stays out of the page while closed', async () => {
    await start();

    expect(createShadowRootUi).not.toHaveBeenCalled();
    expect(host()).toBeNull();
  });

  it('is on the page when it starts open', async () => {
    await seed([highlight('a', { url: HERE })]);
    await fakeBrowser.storage.local.set({ inPageSidebarOpen: true });

    await start();

    expect(await screen.findByText('text of a')).not.toBeNull();
    expect(host()).not.toBeNull();
  });

  it('opens and closes with the stored state', async () => {
    await seed([highlight('a', { url: HERE })]);
    await start();

    await setOpen(true);
    expect(await screen.findByText('text of a')).not.toBeNull();

    await setOpen(false);
    await waitFor(() => expect(host()).toBeNull());
    expect(text('text of a')).toBeNull();

    // Opened again, it reuses the same UI.
    await setOpen(true);
    expect(await screen.findByText('text of a')).not.toBeNull();
    expect(createShadowRootUi).toHaveBeenCalledTimes(1);
  });

  it('ends closed when closed while it is still being created', async () => {
    let finishCreating!: () => void;
    vi.mocked(createShadowRootUi).mockImplementationOnce((async (
      ...args: Parameters<typeof fakeUi>
    ) => {
      await new Promise<void>((resolve) => (finishCreating = resolve));
      return fakeUi(...args);
    }) as never);
    await start();

    await setOpen(true);
    await waitFor(() => expect(createShadowRootUi).toHaveBeenCalled());
    await setOpen(false);
    await act(async () => finishCreating());
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)));

    expect(vi.mocked(log.error)).not.toHaveBeenCalled();
    expect(host()).toBeNull();
  });

  it('has the background open logseq: links in this tab', async () => {
    await fakeBrowser.storage.local.set({ inPageSidebarOpen: true });
    await start();
    await screen.findByText('books');

    expect(userClick(screen.getByText('books'))).toBe(true);
    expect(userClick(screen.getByRole('link', { name: GRAPH }))).toBe(true);

    expect(sendMessage.mock.calls).toEqual([
      ['logseq:openLink', { url: 'logseq://graph/my%20notes?page=books' }],
      ['logseq:openLink', { url: 'logseq://graph/my%20notes' }],
    ]);
  });

  it('keeps the page from seeing keys typed in it', async () => {
    await fakeBrowser.storage.local.set({ inPageSidebarOpen: true });
    await start();

    await waitFor(() => expect(createShadowRootUi).toHaveBeenCalled());
    expect(vi.mocked(createShadowRootUi).mock.calls[0][1]).toMatchObject({
      name: 'logseq-copilot-highlights',
      isolateEvents: true,
    });
  });

  describe('with the Navigation API', () => {
    let navigation: EventTarget;

    beforeEach(() => {
      navigation = new EventTarget();
      vi.stubGlobal('navigation', navigation);
    });

    /**
     * A navigation as the browser and WXT run it: WXT sends
     * wxt:locationchange from the navigate event, with the destination and
     * before the address changes. Then the navigation is cancelled, or it
     * changes the address and fires currententrychange.
     */
    const navigate = (to: string, { cancelled = false } = {}) =>
      act(async () => {
        locationChanged?.({ newUrl: new URL(to) });
        if (cancelled) return;
        history.pushState(null, '', to);
        navigation.dispatchEvent(new Event('currententrychange'));
      });

    it('lists the highlights of the page a single-page app goes to', async () => {
      const next = new URL('/next', HERE).href;
      await seed([
        highlight('a', { url: HERE }),
        highlight('n', { url: next }),
      ]);
      await fakeBrowser.storage.local.set({ inPageSidebarOpen: true });
      await start();
      await screen.findByText('text of a');

      await navigate(next);

      expect(await screen.findByText('text of n')).not.toBeNull();
      expect(text('text of a')).toBeNull();
      // Logseq is searched for that page too.
      expect(await screen.findByText(/about \/next/)).not.toBeNull();
    });

    it("never shows another site's highlights for the address a page asks for", async () => {
      const elsewhere = 'https://other.example/notes';
      await seed([
        highlight('a', { url: HERE }),
        highlight('secret', { url: elsewhere }),
      ]);
      await fakeBrowser.storage.local.set({ inPageSidebarOpen: true });
      await start();
      await screen.findByText('text of a');

      // The page goes to another site's address and cancels in its own
      // navigate listener: WXT has already sent the event.
      await navigate(elsewhere, { cancelled: true });
      await settle();

      expect(text('text of secret')).toBeNull();
      expect(text('text of a')).not.toBeNull();
    });

    it('stays on the page when a navigation is cancelled', async () => {
      const next = new URL('/next', HERE).href;
      await seed([
        highlight('a', { url: HERE }),
        highlight('n', { url: next }),
      ]);
      await fakeBrowser.storage.local.set({ inPageSidebarOpen: true });
      await start();
      await screen.findByText('text of a');

      await navigate(next, { cancelled: true });
      await settle();

      expect(location.href).toBe(HERE);
      expect(text('text of n')).toBeNull();
      expect(text('text of a')).not.toBeNull();
    });
  });

  describe('without the Navigation API', () => {
    /** WXT polls location.href and sends the event after it changed. */
    const navigate = (to: string) =>
      act(async () => {
        history.pushState(null, '', to);
        locationChanged!({ newUrl: new URL(location.href) });
      });

    it('lists the highlights of the page a single-page app goes to', async () => {
      const next = new URL('/next', HERE).href;
      await seed([
        highlight('a', { url: HERE }),
        highlight('n', { url: next }),
      ]);
      await fakeBrowser.storage.local.set({ inPageSidebarOpen: true });
      await start();
      await screen.findByText('text of a');

      await navigate(next);

      expect(await screen.findByText('text of n')).not.toBeNull();
      expect(text('text of a')).toBeNull();
      expect(await screen.findByText(/about \/next/)).not.toBeNull();
    });

    it('draws the address the tab is at, not the URL in the event', async () => {
      const elsewhere = 'https://other.example/notes';
      await seed([
        highlight('a', { url: HERE }),
        highlight('secret', { url: elsewhere }),
      ]);
      await fakeBrowser.storage.local.set({ inPageSidebarOpen: true });
      await start();
      await screen.findByText('text of a');

      await act(async () => locationChanged!({ newUrl: new URL(elsewhere) }));
      await settle();

      expect(text('text of secret')).toBeNull();
      expect(text('text of a')).not.toBeNull();
    });
  });
});
