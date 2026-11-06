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
// Mounts like WXT does (host in the page, onMount / onRemove), without the
// shadow root, so the queries below see the UI.
const fakeUi = vi.hoisted(() => async (_ctx: unknown, options: any) => {
  const host = document.createElement(options.name);
  const container = document.createElement('div');
  host.append(container);
  let mounted: unknown;
  return {
    shadowHost: host,
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
import { HighlightManager } from '@/utils/highlight-manager';
import log from '@/utils/logger';
import { InPageSidebar, startInPageSidebar } from './InPageSidebar';

const PAGE = 'https://one.example/page';

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
    vi.spyOn(log, 'error').mockImplementation(() => {});
    vi.spyOn(log, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('lists the highlights of the page, under its title', async () => {
    await seed([
      highlight('a'),
      highlight('elsewhere', { url: 'https://two.example/article' }),
    ]);

    render(<InPageSidebar url={PAGE} title="Page one" />);

    expect(await screen.findByText('text of a')).not.toBeNull();
    expect(text('text of elsewhere')).toBeNull();
    expect(screen.getByText('Page one')).not.toBeNull();
    expect(screen.getByText('1')).not.toBeNull();
  });

  it('follows highlights changed elsewhere', async () => {
    await seed([highlight('a')]);
    render(<InPageSidebar url={PAGE} title="Page one" />);
    await screen.findByText('text of a');

    await act(() => seed([highlight('a'), highlight('b')]));

    expect(await screen.findByText('text of b')).not.toBeNull();
  });

  it('scrolls the page to a highlight that is clicked', async () => {
    const scroll = vi
      .spyOn(HighlightManager.prototype, 'scrollToHighlight')
      .mockResolvedValue(true);
    await seed([highlight('a')]);
    render(<InPageSidebar url={PAGE} title="Page one" />);

    fireEvent.click(await screen.findByText('text of a'));

    await waitFor(() => expect(scroll).toHaveBeenCalledWith('a'));
    expect(notice()).toBeNull();
  });

  it('tells the user when the page does not have the highlight', async () => {
    vi.spyOn(HighlightManager.prototype, 'scrollToHighlight').mockResolvedValue(
      false,
    );
    await seed([highlight('a')]);
    render(<InPageSidebar url={PAGE} title="Page one" />);

    fireEvent.click(await screen.findByText('text of a'));

    await waitFor(() =>
      expect(notice()).toBe("Couldn't find this highlight on the page"),
    );
  });

  it('closes, in every tab, with the close button', async () => {
    await fakeBrowser.storage.local.set({ inPageSidebarOpen: true });
    render(<InPageSidebar url={PAGE} title="Page one" />);

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    await waitFor(async () => expect(await isOpen()).toBe(false));
  });
});

describe('startInPageSidebar', () => {
  // The page the content script runs in (the test document's origin).
  const HERE = new URL('/page', location.href).href;
  let locationChanged: (() => void) | undefined;
  const ctx = {
    addEventListener: vi.fn(
      (_target: unknown, type: string, handler: () => void) => {
        if (type === 'wxt:locationchange') locationChanged = handler;
      },
    ),
  } as unknown as ContentScriptContext;
  const start = () => act(() => startInPageSidebar(ctx));

  beforeEach(() => {
    fakeBrowser.reset();
    vi.mocked(createShadowRootUi).mockClear();
    vi.spyOn(log, 'error').mockImplementation(() => {});
    locationChanged = undefined;
    history.replaceState(null, '', HERE);
    document.title = 'Page one';
  });

  afterEach(async () => {
    await setOpen(false);
    cleanup();
    vi.restoreAllMocks();
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

  it('keeps the page from seeing keys typed in it', async () => {
    await fakeBrowser.storage.local.set({ inPageSidebarOpen: true });
    await start();

    await waitFor(() => expect(createShadowRootUi).toHaveBeenCalled());
    expect(vi.mocked(createShadowRootUi).mock.calls[0][1]).toMatchObject({
      name: 'logseq-copilot-highlights',
      isolateEvents: true,
    });
  });

  it('lists the highlights of the page a single-page app goes to', async () => {
    const next = new URL('/next', HERE).href;
    await seed([highlight('a', { url: HERE }), highlight('n', { url: next })]);
    await fakeBrowser.storage.local.set({ inPageSidebarOpen: true });
    await start();
    await screen.findByText('text of a');

    history.pushState(null, '', next);
    document.title = 'Next page';
    await act(async () => locationChanged!());

    expect(await screen.findByText('text of n')).not.toBeNull();
    expect(text('text of a')).toBeNull();
    expect(screen.getByText('Next page')).not.toBeNull();
  });
});
