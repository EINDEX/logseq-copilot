/**
 * Runs the real background entrypoint against fakeBrowser and talks to it with
 * the real webext-core client, so message names and payloads are checked on both
 * ends. Only the Logseq service is faked.
 */
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from 'vitest';
import { fakeBrowser } from 'wxt/testing';
import { sendMessage } from '@/types/messaging';
import {
  CannotConnectWithLogseq,
  LogseqError,
  LogseqVersionIsLower,
  TokenNotCurrect,
} from './logseq/error';

const service = vi.hoisted(() => ({
  changeBlockMarker: vi.fn(),
  recall: vi.fn(),
  search: vi.fn(),
  urlSearch: vi.fn(),
  client: {
    getUserConfig: vi.fn(),
    appendBlock: vi.fn(),
  },
}));

vi.mock('./logseq/tool', () => ({
  getLogseqService: async () => service,
}));

import background from './index';

beforeAll(() => {
  fakeBrowser.reset();
  // fakeBrowser does not implement these events; the handlers are not under test.
  vi.spyOn(fakeBrowser.contextMenus, 'create').mockImplementation(() => 0);
  vi.spyOn(fakeBrowser.contextMenus.onClicked, 'addListener').mockImplementation(
    () => {},
  );
  vi.spyOn(fakeBrowser.commands.onCommand, 'addListener').mockImplementation(
    () => {},
  );
  // webext-core allows one listener per message type per context, so register
  // the background exactly once.
  background.main();
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('logseq:changeBlockMarker', () => {
  test('round-trips a successful change and returns the new marker', async () => {
    service.changeBlockMarker.mockResolvedValue({
      type: 'change-block-marker-result',
      uuid: 'u1',
      status: 'success',
      marker: 'DONE',
    });

    const result = await sendMessage('logseq:changeBlockMarker', {
      uuid: 'u1',
      marker: 'DONE',
    });

    expect(service.changeBlockMarker).toHaveBeenCalledWith('u1', 'DONE');
    expect(result).toMatchObject({
      type: 'change-block-marker-result',
      uuid: 'u1',
      status: 'success',
      marker: 'DONE',
    });
  });

  test('reports a failure from the service instead of claiming success', async () => {
    service.changeBlockMarker.mockResolvedValue({
      type: 'change-block-marker-result',
      uuid: 'u2',
      status: 'failed',
      msg: 'Not support scheduled task.',
    });

    const result = await sendMessage('logseq:changeBlockMarker', {
      uuid: 'u2',
      marker: 'DONE',
    });

    expect(result.status).toBe('failed');
    expect(result.msg).toBe('Not support scheduled task.');
  });

  test('does not need an active tab (popup has none)', async () => {
    service.changeBlockMarker.mockResolvedValue({
      type: 'change-block-marker-result',
      uuid: 'u3',
      status: 'success',
      marker: 'TODO',
    });

    const result = await sendMessage('logseq:changeBlockMarker', {
      uuid: 'u3',
      marker: 'TODO',
    });

    expect(result.status).toBe('success');
  });
});

describe('service errors reach the sender with a readable message', () => {
  test('LogseqVersionIsLower', async () => {
    service.search.mockRejectedValue(new LogseqError(LogseqVersionIsLower));

    const err = await sendMessage('logseq:search', 'q').catch((e) => e);

    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe(LogseqVersionIsLower.msg);
  });

  test('CannotConnectWithLogseq', async () => {
    service.urlSearch.mockRejectedValue(new LogseqError(CannotConnectWithLogseq));

    const err = await sendMessage('logseq:urlSearch', {
      url: 'https://example.com/',
    }).catch((e) => e);

    expect(err.message).toBe(CannotConnectWithLogseq.msg);
  });
});

describe('logseq:clipPage', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.mocked(fakeBrowser.tabs.query).mockRestore();
  });

  // Issue #77: a cljs-time `:journal/page-title-format` such as "MMMM D, YYYY"
  // made date-fns throw, so nothing was ever clipped.
  test.each([
    ['MMMM D, YYYY', 'October 23, 2026'],
    ['MMM do, yyyy', 'Oct 23rd, 2026'],
    ['yyyy-MM-dd', '2026-10-23'],
    ['EEE, dd.MM.yyyy', 'Fri, 23.10.2026'],
  ])('appends to the journal named by %s', async (preferredDateFormat, journal) => {
    // Faking setTimeout keeps the debounced badge search from firing after the test.
    vi.useFakeTimers({
      now: new Date(2026, 9, 23, 12, 0, 0),
      toFake: ['Date', 'setTimeout', 'clearTimeout'],
    });
    // fakeBrowser has no window to hold a tab, so serve the active tab directly.
    vi.spyOn(fakeBrowser.tabs, 'query').mockResolvedValue([
      { id: 1, url: 'https://example.com/', title: 'Example' } as any,
    ]);
    service.client.getUserConfig.mockResolvedValue({ preferredDateFormat });

    await sendMessage('logseq:clipPage', undefined);

    expect(service.client.appendBlock).toHaveBeenCalledTimes(1);
    expect(service.client.appendBlock.mock.calls[0][0]).toBe(journal);
  });

  // Issue #48: the sender (popup, content script) shows why nothing was clipped.
  describe('rejects with a readable message when nothing was clipped', () => {
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      vi.spyOn(fakeBrowser.tabs, 'query').mockResolvedValue([
        { id: 1, url: 'https://example.com/', title: 'Example' } as any,
      ]);
    });

    test('Logseq cannot be reached (the client returns an error object)', async () => {
      service.client.getUserConfig.mockResolvedValue(CannotConnectWithLogseq);

      const err = await sendMessage('logseq:clipPage', undefined).catch((e) => e);

      expect(err.message).toBe(CannotConnectWithLogseq.msg);
      expect(service.client.appendBlock).not.toHaveBeenCalled();
    });

    test('appending the block fails', async () => {
      service.client.getUserConfig.mockResolvedValue({ preferredDateFormat: 'yyyy-MM-dd' });
      service.client.appendBlock.mockRejectedValue(new LogseqError(TokenNotCurrect));

      const err = await sendMessage('logseq:clipWithSelection', 'text').catch((e) => e);

      expect(err.message).toBe(TokenNotCurrect.msg);
    });
  });
});

describe('logseq:clipWithSelection', () => {
  const popupTab = {
    id: 9,
    url: 'chrome-extension://abc/popup.html',
    title: 'Logseq Copilot',
  };

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    // The active tab of the current window is not the clipped page (the popup
    // window has focus).
    vi.spyOn(fakeBrowser.tabs, 'query').mockResolvedValue([popupTab as any]);
    service.client.getUserConfig.mockResolvedValue({ preferredDateFormat: 'yyyy-MM-dd' });
    service.client.appendBlock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.mocked(fakeBrowser.tabs.query).mockRestore();
  });

  const clippedBlock = () => service.client.appendBlock.mock.calls[0][1] as string;

  test("a content script's message clips its own tab, not the active tab", async () => {
    // fakeBrowser sends with an empty sender; a content script's carries its tab.
    const pageTab = { id: 3, url: 'https://clipped.example/post', title: 'Clipped Page' };
    const send = vi
      .spyOn(fakeBrowser.runtime, 'sendMessage')
      .mockImplementationOnce(async (message: any) => {
        const res = await fakeBrowser.runtime.onMessage.trigger(message, {
          tab: pageTab,
        } as any);
        return res.find((r: unknown) => !!r);
      });

    await sendMessage('logseq:clipWithSelection', 'the selection').finally(() =>
      send.mockRestore(),
    );

    expect(service.client.appendBlock).toHaveBeenCalledTimes(1);
    expect(clippedBlock()).toContain('the selection');
    expect(clippedBlock()).toContain('[Clipped Page](https://clipped.example/post)');
    expect(clippedBlock()).not.toContain(popupTab.url);
  });

  test('without a sender tab, clips the active tab of the current window', async () => {
    await sendMessage('logseq:clipWithSelection', 'the selection');

    expect(service.client.appendBlock).toHaveBeenCalledTimes(1);
    expect(clippedBlock()).toContain(`[${popupTab.title}](${popupTab.url})`);
  });
});

describe('logseq:recall', () => {
  test('passes the query and the recall rules (maxResults in pages)', async () => {
    await fakeBrowser.storage.local.set({
      recallRulesConfig: [
        {
          id: 'r1',
          name: 'scoped',
          enabled: true,
          urlPattern: 'bing\\.com',
          queryProcessing: {
            ignoreHashFragments: false,
            ignoreQueryParams: false,
            excludeKeywords: ['secret'],
            includeKeywords: ['logseq'],
            ignorePathSegments: [],
          },
          searchScope: { excludePages: ['Work'] },
          resultFiltering: { maxResults: 4, prioritizeRecent: true },
        },
      ],
    });
    const answer = { graph: 'g', pages: [] };
    service.recall.mockResolvedValue(answer);

    const result = await sendMessage('logseq:recall', {
      query: 'logseq plugin',
      url: 'https://www.bing.com/search?q=logseq+plugin',
    });

    expect(result).toEqual(answer);
    expect(service.recall).toHaveBeenCalledWith('logseq plugin', {
      excludeKeywords: ['secret'],
      includeKeywords: ['logseq'],
      searchScope: { excludePages: ['Work'] },
      prioritizeRecent: true,
      maxPages: 4,
    });
    expect(service.search).not.toHaveBeenCalled();
    expect(service.urlSearch).not.toHaveBeenCalled();
  });

  test('the default rules leave the page limit to recall', async () => {
    await fakeBrowser.storage.local.remove('recallRulesConfig');
    service.recall.mockResolvedValue({ graph: 'g', pages: [] });

    await sendMessage('logseq:recall', {
      query: 'default limit',
      url: 'https://www.google.com/search?q=default+limit',
    });

    expect(service.recall).toHaveBeenCalledTimes(1);
    expect(service.recall.mock.calls[0][1].maxPages).toBeUndefined();
  });

  test('a result page that loads twice (Bing &rdr=1) searches Logseq once', async () => {
    service.recall.mockResolvedValue({ graph: 'g', pages: [] });
    await sendMessage('logseq:recall', {
      query: 'twice',
      url: 'https://www.bing.com/search?q=twice',
    });
    await sendMessage('logseq:recall', {
      query: 'twice',
      url: 'https://www.bing.com/search?q=twice&rdr=1&rdrig=9E58F2A7',
    });
    expect(service.recall).toHaveBeenCalledTimes(1);
    await sendMessage('logseq:recall', {
      query: 'other',
      url: 'https://www.bing.com/search?q=other',
    });
    expect(service.recall).toHaveBeenCalledTimes(2);
  });

  test('a storage change (new recall rules) makes the same request search again', async () => {
    service.recall.mockResolvedValue({ graph: 'g', pages: [] });
    const recall = () =>
      sendMessage('logseq:recall', {
        query: 'rules changed',
        url: 'https://www.bing.com/search?q=rules+changed',
      });
    await recall();
    expect(service.recall).toHaveBeenCalledTimes(1);

    await fakeBrowser.storage.local.set({
      recallRulesConfig: [
        {
          id: 'r1',
          name: 'scoped',
          enabled: true,
          urlPattern: 'bing\\.com',
          queryProcessing: {
            ignoreHashFragments: false,
            ignoreQueryParams: false,
            excludeKeywords: [],
            includeKeywords: [],
            ignorePathSegments: [],
          },
          searchScope: { excludePages: ['Work'] },
          resultFiltering: { maxResults: 3 },
        },
      ],
    });
    await recall();
    expect(service.recall).toHaveBeenCalledTimes(2);
    expect(service.recall.mock.calls[1][1]).toMatchObject({
      searchScope: { excludePages: ['Work'] },
      maxPages: 3,
    });
  });

  test('errors reach the sender', async () => {
    service.recall.mockRejectedValue(new LogseqError(CannotConnectWithLogseq));
    const err = await sendMessage('logseq:recall', {
      query: 'q',
      url: 'https://www.bing.com/search?q=q',
    }).catch((e) => e);
    expect(err.message).toBe(CannotConnectWithLogseq.msg);
  });
});

describe('browser startup', () => {
  test('closes the sidebar drawn on pages', async () => {
    await fakeBrowser.storage.local.set({ inPageSidebarOpen: true });

    await fakeBrowser.runtime.onStartup.trigger();

    await vi.waitFor(async () =>
      expect(
        (await fakeBrowser.storage.local.get('inPageSidebarOpen'))
          .inPageSidebarOpen,
      ).toBe(false),
    );
  });
});
