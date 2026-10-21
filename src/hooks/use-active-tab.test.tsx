import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing';
import log from '@/utils/logger';
import { useActiveTab } from './use-active-tab';

const WINDOW_ID = 10;

const makeTab = (overrides: Partial<Browser.tabs.Tab> = {}): Browser.tabs.Tab =>
  ({
    id: 1,
    windowId: WINDOW_ID,
    active: true,
    index: 0,
    title: 'Page one',
    url: 'https://one.example/page',
    ...overrides,
  } as Browser.tabs.Tab);

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const activate = (tabId: number, windowId = WINDOW_ID) =>
  act(async () => {
    await fakeBrowser.tabs.onActivated.trigger({ tabId, windowId });
  });

const update = (
  changeInfo: Browser.tabs.TabChangeInfo,
  tab: Browser.tabs.Tab,
) =>
  act(async () => {
    await fakeBrowser.tabs.onUpdated.trigger(tab.id!, changeInfo, tab);
  });

/** Renders the hook and waits for the first read of the active tab. */
async function mount() {
  const rendered = renderHook(() => useActiveTab());
  await waitFor(() => expect(rendered.result.current.loading).toBe(false));
  return rendered;
}

describe('useActiveTab', () => {
  let query: MockInstance<typeof browser.tabs.query>;
  let get: MockInstance<typeof browser.tabs.get>;
  let tabs: Record<number, Browser.tabs.Tab>;

  beforeEach(() => {
    cleanup();
    vi.restoreAllMocks();
    fakeBrowser.reset();
    vi.spyOn(log, 'warn').mockImplementation(() => {});
    vi.spyOn(log, 'error').mockImplementation(() => {});

    tabs = {
      1: makeTab(),
      2: makeTab({ id: 2, title: 'Page two', url: 'https://two.example/' }),
      3: makeTab({ id: 3, title: 'Page three', url: 'https://three.example/' }),
    };
    vi.spyOn(browser.windows, 'getCurrent').mockResolvedValue({
      id: WINDOW_ID,
    } as Browser.windows.Window);
    query = vi.spyOn(browser.tabs, 'query').mockResolvedValue([tabs[1]]);
    get = vi
      .spyOn(browser.tabs, 'get')
      .mockImplementation(async (tabId: number) => tabs[tabId]);
  });

  it('reads the active tab of its own window when it mounts', async () => {
    const { result } = renderHook(() => useActiveTab());
    expect(result.current).toEqual({ tab: null, loading: true });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(query).toHaveBeenCalledWith({ active: true, windowId: WINDOW_ID });
    expect(result.current.tab).toEqual({
      id: 1,
      title: 'Page one',
      url: 'https://one.example/page',
    });
  });

  it('follows the tab the user switches to in the same window', async () => {
    const { result } = await mount();

    await activate(2);

    await waitFor(() => expect(result.current.tab?.id).toBe(2));
    expect(get).toHaveBeenCalledWith(2);
    expect(result.current.tab).toEqual({
      id: 2,
      title: 'Page two',
      url: 'https://two.example/',
    });
  });

  it('ignores a tab switch in another window', async () => {
    const { result } = await mount();

    await activate(2, 99);

    expect(get).not.toHaveBeenCalled();
    expect(result.current.tab?.id).toBe(1);
  });

  it('follows navigation and title changes of the active tab', async () => {
    const { result } = await mount();

    await update(
      { url: 'https://one.example/other' },
      makeTab({ url: 'https://one.example/other' }),
    );
    expect(result.current.tab?.url).toBe('https://one.example/other');

    await update({ title: 'New title' }, makeTab({ title: 'New title' }));
    expect(result.current.tab?.title).toBe('New title');

    await update(
      { status: 'complete' },
      makeTab({ title: 'Loaded title', url: 'https://one.example/final' }),
    );
    expect(result.current.tab).toEqual({
      id: 1,
      title: 'Loaded title',
      url: 'https://one.example/final',
    });
  });

  it('ignores updates of tabs in the background or in other windows', async () => {
    const { result } = await mount();
    const before = result.current;

    await update(
      { url: 'https://bg.example/' },
      makeTab({ id: 5, active: false, url: 'https://bg.example/' }),
    );
    await update(
      { url: 'https://other.example/' },
      makeTab({ id: 6, windowId: 99, url: 'https://other.example/' }),
    );

    expect(result.current).toBe(before);
  });

  it('ignores updates that change nothing it shows', async () => {
    const { result } = await mount();
    const before = result.current;

    await update({ status: 'loading' }, makeTab({ title: 'Changing' }));
    await update(
      { favIconUrl: 'https://one.example/icon.png' },
      makeTab({ title: 'Changing' }),
    );

    expect(result.current).toBe(before);
  });

  it('does not render again when the tab is the same', async () => {
    const { result } = await mount();
    const before = result.current;

    await update({ status: 'complete' }, makeTab());

    expect(result.current).toBe(before);
  });

  it.each([
    ['a browser page', 'chrome://extensions/'],
    ['an extension page', 'chrome-extension://abc/options.html'],
    ['a local file', 'file:///tmp/page.html'],
    ['a blank page', 'about:blank'],
    ['a page with no url (no host permission)', undefined],
  ])('has no url for %s', async (_name, url) => {
    tabs[1] = makeTab({ url });
    query.mockResolvedValue([tabs[1]]);

    const { result } = await mount();

    expect(result.current.tab).toEqual({
      id: 1,
      title: 'Page one',
      url: null,
    });
  });

  it('keeps the url of http and https pages, in any letter case', async () => {
    const { result } = await mount();

    await update(
      { url: 'http://plain.example/' },
      makeTab({ url: 'http://plain.example/' }),
    );
    expect(result.current.tab?.url).toBe('http://plain.example/');

    await update(
      { url: 'HTTPS://Upper.example/' },
      makeTab({ url: 'HTTPS://Upper.example/' }),
    );
    expect(result.current.tab?.url).toBe('HTTPS://Upper.example/');
  });

  it('shows an unsupported page after a supported one, and back', async () => {
    const { result } = await mount();

    await update(
      { url: 'chrome://settings/' },
      makeTab({ url: 'chrome://settings/' }),
    );
    expect(result.current.tab?.url).toBeNull();

    await update(
      { url: 'https://one.example/' },
      makeTab({ url: 'https://one.example/' }),
    );
    expect(result.current.tab?.url).toBe('https://one.example/');
  });

  it('has no tab when the window has no active tab', async () => {
    query.mockResolvedValue([]);

    const { result } = await mount();

    expect(result.current).toEqual({ tab: null, loading: false });
  });

  it('copes with a window it cannot read', async () => {
    vi.mocked(browser.windows.getCurrent).mockResolvedValue(
      undefined as unknown as Browser.windows.Window,
    );

    const { result } = await mount();

    expect(result.current).toEqual({ tab: null, loading: false });
    expect(query).not.toHaveBeenCalled();
    expect(fakeBrowser.tabs.onActivated.hasListeners()).toBe(false);
  });

  it('stops loading when the browser fails to read', async () => {
    vi.mocked(browser.windows.getCurrent).mockRejectedValue(new Error('boom'));

    const { result } = await mount();

    expect(result.current).toEqual({ tab: null, loading: false });
  });

  it('stops loading when the first read of the tab fails', async () => {
    query.mockRejectedValue(new Error('No tab'));

    const { result } = await mount();

    expect(result.current).toEqual({ tab: null, loading: false });
    expect(log.warn).toHaveBeenCalled();
  });

  it('keeps the current tab when the tab it switched to is already gone', async () => {
    const { result } = await mount();
    get.mockRejectedValue(new Error('No tab with id: 2.'));

    await activate(2);
    await waitFor(() => expect(log.warn).toHaveBeenCalled());

    expect(result.current.tab?.id).toBe(1);
  });

  it('shows the latest tab switch when the reads finish out of order', async () => {
    const { result } = await mount();
    const slow = deferred<Browser.tabs.Tab>();
    get.mockImplementation((tabId: number) =>
      tabId === 2 ? slow.promise : Promise.resolve(tabs[tabId]),
    );

    await activate(2);
    await activate(3);
    await waitFor(() => expect(result.current.tab?.id).toBe(3));

    await act(async () => {
      slow.resolve(tabs[2]);
    });

    expect(result.current.tab?.id).toBe(3);
  });

  it('does not let the first read overwrite a newer update', async () => {
    const first = deferred<Browser.tabs.Tab[]>();
    query.mockReturnValue(first.promise);
    const { result } = renderHook(() => useActiveTab());
    await waitFor(() =>
      expect(fakeBrowser.tabs.onUpdated.hasListeners()).toBe(true),
    );

    await update(
      { url: 'https://one.example/newer' },
      makeTab({ url: 'https://one.example/newer' }),
    );
    expect(result.current.tab?.url).toBe('https://one.example/newer');

    await act(async () => {
      first.resolve([makeTab({ url: 'https://one.example/older' })]);
    });

    expect(result.current.tab?.url).toBe('https://one.example/newer');
  });

  it('removes its listeners when it unmounts', async () => {
    const { result, unmount } = await mount();
    expect(fakeBrowser.tabs.onActivated.hasListeners()).toBe(true);
    expect(fakeBrowser.tabs.onUpdated.hasListeners()).toBe(true);
    const before = result.current;

    unmount();

    expect(fakeBrowser.tabs.onActivated.hasListeners()).toBe(false);
    expect(fakeBrowser.tabs.onUpdated.hasListeners()).toBe(false);
    // Late events do nothing.
    await activate(2);
    expect(get).not.toHaveBeenCalled();
    expect(result.current).toBe(before);
  });

  it('adds no listeners when it unmounts before the window is known', async () => {
    const windowRead = deferred<Browser.windows.Window>();
    vi.mocked(browser.windows.getCurrent).mockReturnValue(windowRead.promise);
    const { unmount } = renderHook(() => useActiveTab());

    unmount();
    await act(async () => {
      windowRead.resolve({ id: WINDOW_ID } as Browser.windows.Window);
    });

    expect(fakeBrowser.tabs.onActivated.hasListeners()).toBe(false);
    expect(fakeBrowser.tabs.onUpdated.hasListeners()).toBe(false);
    expect(query).not.toHaveBeenCalled();
  });

  it('builds everything again from the browser when it mounts again', async () => {
    const first = await mount();
    first.unmount();
    tabs[1] = makeTab({
      title: 'Changed meanwhile',
      url: 'https://one.example/changed',
    });
    query.mockResolvedValue([tabs[1]]);

    const second = await mount();

    expect(second.result.current.tab).toEqual({
      id: 1,
      title: 'Changed meanwhile',
      url: 'https://one.example/changed',
    });
  });
});
