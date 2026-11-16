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
  // Like the file graph service: the clip goes to the client's appendBlock.
  clipBlocks: vi.fn(async (page: string, root: { content: string }) => ({
    rootUuid: (await service.client.appendBlock(page, root.content))?.uuid ?? 'root',
  })),
  getGraph: vi.fn(async () => 'test graph'),
  changeBlockMarker: vi.fn(),
  recall: vi.fn(),
  search: vi.fn(),
  urlSearch: vi.fn(),
  client: {
    getUserConfig: vi.fn(),
    appendBlock: vi.fn(),
    getBlockViaUuid: vi.fn(),
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

  test('does not need an active tab (the browser sidebar has none)', async () => {
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

  describe('the tab it clips', () => {
    const activeTab = { id: 1, url: 'https://active.example/', title: 'Active Page' };
    const besideTab = { id: 7, url: 'https://beside.example/post', title: 'Beside Page' };

    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      vi.spyOn(fakeBrowser.tabs, 'query').mockResolvedValue([activeTab as any]);
      vi.spyOn(fakeBrowser.tabs, 'get').mockImplementation(async (tabId: number) => {
        if (tabId !== besideTab.id) throw new Error(`No tab with id: ${tabId}`);
        return besideTab as any;
      });
      service.client.getUserConfig.mockResolvedValue({ preferredDateFormat: 'yyyy-MM-dd' });
      service.client.appendBlock.mockResolvedValue(undefined);
    });

    afterEach(() => {
      vi.mocked(fakeBrowser.tabs.get).mockRestore();
    });

    const clippedBlock = () => service.client.appendBlock.mock.calls[0][1] as string;

    test('with a templateId, clips with that template', async () => {
      await sendMessage('logseq:clipPage', { templateId: 'task' });

      expect(clippedBlock()).toBe('TODO [Active Page](https://active.example/)');
    });

    test('with a tabId (the browser sidebar), the page in that tab', async () => {
      await sendMessage('logseq:clipPage', { tabId: besideTab.id });

      expect(fakeBrowser.tabs.get).toHaveBeenCalledWith(besideTab.id);
      expect(service.client.appendBlock).toHaveBeenCalledTimes(1);
      expect(clippedBlock()).toContain(`[${besideTab.title}](${besideTab.url})`);
      expect(clippedBlock()).not.toContain(activeTab.url);
    });

    test('without one (the page clip of the content script), the active tab of the current window', async () => {
      await sendMessage('logseq:clipPage', undefined);

      expect(fakeBrowser.tabs.get).not.toHaveBeenCalled();
      expect(service.client.appendBlock).toHaveBeenCalledTimes(1);
      expect(clippedBlock()).toContain(`[${activeTab.title}](${activeTab.url})`);
    });

    test('rejects, clipping nothing, when the tab is gone', async () => {
      const err = await sendMessage('logseq:clipPage', { tabId: 99 }).catch((e) => e);

      expect(err).toBeInstanceOf(Error);
      expect(service.client.appendBlock).not.toHaveBeenCalled();
    });
  });

  // Issue #48: the sender (sidebar, content script) shows why nothing was clipped.
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
  const otherTab = {
    id: 9,
    url: 'https://other.example/',
    title: 'Other Page',
  };

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    // The active tab of the current window is not the clipped page (focus has
    // moved to another window).
    vi.spyOn(fakeBrowser.tabs, 'query').mockResolvedValue([otherTab as any]);
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
    expect(clippedBlock()).not.toContain(otherTab.url);
  });

  test('with a templateId, clips the selection with that template', async () => {
    await sendMessage('logseq:clipWithSelection', {
      text: 'the selection',
      templateId: 'task',
    });

    // The Task template nests the selection under the task.
    expect(service.clipBlocks).toHaveBeenCalledTimes(1);
    expect(service.clipBlocks.mock.calls[0][1]).toEqual({
      content: 'TODO [Other Page](https://other.example/)',
      children: [{ content: 'the selection', children: [] }],
    });
  });

  test('without a sender tab, clips the active tab of the current window', async () => {
    await sendMessage('logseq:clipWithSelection', 'the selection');

    expect(service.client.appendBlock).toHaveBeenCalledTimes(1);
    expect(clippedBlock()).toContain(`[${otherTab.title}](${otherTab.url})`);
  });
});

describe('clip results and notes', () => {
  const tab = { id: 1, url: 'https://example.com/post', title: 'Post' };

  beforeEach(() => {
    vi.spyOn(fakeBrowser.tabs, 'query').mockResolvedValue([tab as any]);
    service.client.getUserConfig.mockResolvedValue({ preferredDateFormat: 'yyyy-MM-dd' });
    service.client.appendBlock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.mocked(fakeBrowser.tabs.query).mockRestore();
  });

  test.each([
    ['logseq:clipPage', undefined],
    ['logseq:clipWithSelection', 'a quote'],
  ] as const)('%s resolves with the clip', async (type, data) => {
    const result = await sendMessage(type as any, data as any);

    expect(result).toEqual({
      templateId: expect.any(String),
      page: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      graph: 'test graph',
      rootUuid: 'root',
    });
  });

  test('the note of the picker panel reaches the template', async () => {
    await templates.setValue([
      { id: 'n', name: 'N', content: '[{{title}}]({{url}})\n{{note}}\n{{content}}' },
    ]);
    await sendMessage('logseq:clipWithSelection', {
      text: 'a quote',
      templateId: 'n',
      note: 'my [[note]]',
    });
    expect(service.client.appendBlock.mock.calls.at(-1)![1]).toBe(
      '[Post](https://example.com/post)\nmy [[note]]\na quote',
    );

    await sendMessage('logseq:clipPage', { templateId: 'n', note: 'page note' });
    expect(service.client.appendBlock.mock.calls.at(-1)![1]).toBe(
      '[Post](https://example.com/post)\npage note',
    );
  });

  test('reports the block that holds the note', async () => {
    await templates.setValue([
      { id: 'default', name: 'Clip', content: '#[[Clip]] [{{title}}]({{url}})\n{{content}}' },
    ]);
    service.clipBlocks.mockResolvedValueOnce({ rootUuid: 'r', noteUuid: 'n-1' } as any);
    const result: any = await sendMessage('logseq:clipPage', { note: 'hello' });
    expect(result.noteBlockUuid).toBe('n-1');
    // The fallback child is a block of its own, built-in Clip has no `{{note}}`.
    expect((service.clipBlocks.mock.calls.at(-1)![1] as any).children).toEqual([
      { content: 'hello', children: [], note: true },
    ]);
  });
});
