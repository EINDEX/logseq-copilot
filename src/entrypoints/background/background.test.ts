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
} from './logseq/error';

const service = vi.hoisted(() => ({
  changeBlockMarker: vi.fn(),
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

describe('logseq:hybridSearch', () => {
  const rule = {
    id: 'r1',
    name: 'exclude work',
    enabled: true,
    urlPattern: 'example\\.com',
    queryProcessing: {
      ignoreHashFragments: false,
      ignoreQueryParams: false,
      excludeKeywords: [],
      includeKeywords: [],
      ignorePathSegments: [],
    },
    searchScope: { excludePages: ['Work'] },
    resultFiltering: { prioritizeRecent: false },
  };

  test('applies the page scope to blocks and pages, and counts what is left', async () => {
    await fakeBrowser.storage.local.set({ recallRulesConfig: [rule] });
    const page = (id: number, name: string) => ({ id, uuid: `p${id}`, name, originalName: name });
    service.urlSearch.mockResolvedValue({
      status: 200,
      msg: 'success',
      response: {
        blocks: [{ uuid: 'b1', content: 'a', page: page(1, 'Work') }],
        graph: 'g',
      },
    });
    service.search.mockResolvedValue({
      status: 200,
      msg: 'success',
      response: {
        blocks: [
          { uuid: 'b2', content: 'b', page: page(2, 'Homework') },
          { uuid: 'b1', content: 'a', page: page(1, 'Work') },
        ],
        pages: [page(1, 'Work'), page(2, 'Homework')],
        graph: 'g',
      },
    });

    const result = await sendMessage('logseq:hybridSearch', {
      url: 'https://example.com/a',
      query: 'q',
    });

    expect(result.response.blocks.map((b) => b.uuid)).toEqual(['b2']);
    expect(result.response.pages.map((p) => p.name)).toEqual(['Homework']);
    expect(result.count).toBe(2);
  });

  test('keywordOnly skips the URL search but still applies the recall rules', async () => {
    await fakeBrowser.storage.local.set({ recallRulesConfig: [rule] });
    const page = (id: number, name: string) => ({ id, uuid: `p${id}`, name, originalName: name });
    service.search.mockResolvedValue({
      status: 200,
      msg: 'success',
      response: {
        blocks: [
          { uuid: 'b1', content: 'a', page: page(1, 'Work') },
          { uuid: 'b2', content: 'b', page: page(2, 'Homework') },
        ],
        pages: [page(1, 'Work'), page(2, 'Homework')],
        graph: 'g',
      },
    });

    const result = await sendMessage('logseq:hybridSearch', {
      url: 'https://example.com/a',
      query: 'q',
      keywordOnly: true,
    });

    expect(service.urlSearch).not.toHaveBeenCalled();
    expect(service.search).toHaveBeenCalledWith('q');
    expect(result.status).toBe(200);
    expect(result.response.graph).toBe('g');
    expect(result.response.blocks.map((b) => b.uuid)).toEqual(['b2']);
    expect(result.response.pages.map((p) => p.name)).toEqual(['Homework']);
    expect(result.count).toBe(2);
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
});
