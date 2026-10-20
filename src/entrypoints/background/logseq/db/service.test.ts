import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing';
import {
  logseqAuthTokenItem,
  logseqHostNameItem,
  logseqPortItem,
} from '@/utils/storage';
// tool must load first: tool.ts and db/service.ts import each other.
import '../tool';
import LogseqDBService, { getBlockMarker } from './service';

const makeService = (searchBlocks: any[], block: any = {}) => {
  const service = new LogseqDBService();
  const client = {
    getGraph: vi.fn().mockResolvedValue({ name: 'logseq_db_Demo' }),
    search: vi.fn().mockResolvedValue({ blocks: searchBlocks }),
    getPage: vi.fn(async (p: any) => ({ uuid: p.uuid ?? 'page-uuid', name: 'P' })),
    getBlockViaUuid: vi.fn(async (uuid: string) => ({
      uuid,
      content: 'hello foo',
      page: { id: 1 },
      ...block,
    })),
  };
  service.client = client as any;
  return { service, client };
};

// Shapes copied from a real Logseq 2.0.2 `logseq.App.search` answer: only page
// hits have `page?: true`, block hits carry `page?: null`.
const blockHit = (uuid: string) => ({ uuid, 'page?': null, page: 'page-uuid' });
const pageHit = (uuid: string) => ({ uuid, 'page?': true, page: uuid });

describe('LogseqDBService search result uuid', () => {
  test('reads the Logseq 2.0.2 `uuid` field', async () => {
    const { service, client } = makeService([blockHit('b1'), pageHit('p1')]);
    const { response } = await service.search('foo');
    expect(client.getBlockViaUuid).toHaveBeenCalledWith('b1', expect.anything());
    expect(client.getPage).toHaveBeenCalledWith({ uuid: 'p1' });
    expect(response.blocks[0].html).toBe('<p>hello <mark>foo</mark></p>');
    expect(response.graph).toBe('Demo');
  });

  test('still accepts the legacy `block/uuid: {uuid}` shape', async () => {
    const { service, client } = makeService([
      { 'block/uuid': { uuid: 'b2' }, 'page?': false },
    ]);
    await service.search('foo');
    expect(client.getBlockViaUuid).toHaveBeenCalledWith('b2', expect.anything());
  });

  test('urlSearch returns blocks for the URL', async () => {
    const { service } = makeService([blockHit('b3')]);
    const res = await service.urlSearch(new URL('https://example.com/f(x+1'));
    expect(res.response.blocks).toHaveLength(1);
    expect(res.response.blocks[0].uuid).toBe('b3');
  });

  test('block hits are told apart from page hits by `page? === true`', async () => {
    const { service, client } = makeService([
      blockHit('b1'),
      { uuid: 'b2' }, // `page?` missing
      pageHit('p1'),
    ]);
    const { response } = await service.search('foo');
    expect(response.blocks.map((b) => b.uuid)).toEqual(['b1', 'b2']);
    expect(response.pages).toHaveLength(1);
    expect(client.getPage).toHaveBeenCalledWith({ uuid: 'p1' });
  });

  test('skips hits whose block can no longer be read', async () => {
    const { service, client } = makeService([blockHit('gone'), blockHit('b1')]);
    client.getBlockViaUuid.mockImplementation(async (uuid: string) =>
      uuid === 'gone' ? null : ({ uuid, content: 'x', page: { id: 1 } } as any),
    );
    const { response } = await service.search('foo');
    expect(response.blocks.map((b) => b.uuid)).toEqual(['b1']);
  });
});

describe('getBlockMarker', () => {
  const status = (ident: string) => ({
    ':logseq.property/status': { ident, title: 'x' },
  });

  test('maps the status choice onto a file-graph style marker', () => {
    expect(getBlockMarker(status(':logseq.property/status.todo'))).toBe('TODO');
    expect(getBlockMarker(status(':logseq.property/status.doing'))).toBe('DOING');
    expect(getBlockMarker(status(':logseq.property/status.done'))).toBe('DONE');
    expect(getBlockMarker(status(':logseq.property/status.canceled'))).toBe(
      'CANCELED',
    );
    expect(getBlockMarker(status(':logseq.property/status.in-review'))).toBe(
      'IN-REVIEW',
    );
  });

  test('is empty for blocks without a status', () => {
    expect(getBlockMarker({})).toBe('');
    expect(getBlockMarker(null)).toBe('');
    expect(getBlockMarker({ ':logseq.property/status': 7 })).toBe('');
  });
});

describe('LogseqDBService block rendering', () => {
  test('exposes the status as marker without touching the text', async () => {
    const { service } = makeService([blockHit('b1')], {
      content: 'buy TODO app',
      ':logseq.property/status': { ident: ':logseq.property/status.todo' },
    });
    const block = await service.getBlock('b1', 'Demo');
    expect(block.marker).toBe('TODO');
    expect(block.html).toBe('<p>buy TODO app</p>');
  });

  test('keeps the marker when urlSearch renders the block again', async () => {
    const { service } = makeService([blockHit('b1')], {
      content: 'read https://example.com/a',
      ':logseq.property/status': { ident: ':logseq.property/status.doing' },
    });
    const { response } = await service.urlSearch(new URL('https://example.com/a'));
    expect(response.blocks[0].marker).toBe('DOING');
    expect(response.blocks[0].html).toContain('example.com/a');
  });

  test('getBlock rejects for a missing block', async () => {
    const { service, client } = makeService([]);
    client.getBlockViaUuid.mockResolvedValue(null as any);
    await expect(service.getBlock('nope', 'Demo')).rejects.toThrow();
  });
});

/**
 * Behaves like the Logseq 2.x HTTP server: methods that are not `logseq.<Ns>.*`
 * (or a known SDK name) fail with HTTP 500 and `MethodNotExist`.
 */
describe('LogseqDBService against a strict HTTP API stub', () => {
  const calls: { method: string; args: unknown[] }[] = [];
  const block = (extra: object = {}) => ({
    uuid: 'b1',
    content: 'hello foo',
    page: { id: 194, uuid: 'p1', name: 'page', title: 'Page' },
    ...extra,
  });

  const stub = (answers: Record<string, (args: unknown[]) => unknown>) => {
    calls.length = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: unknown, init: { body: string }) => {
        const { method, args } = JSON.parse(init.body);
        calls.push({ method, args });
        const answer = answers[method];
        if (!answer) {
          return new Response(
            JSON.stringify({ error: `MethodNotExist: ${method}` }),
            { status: 500 },
          );
        }
        return new Response(JSON.stringify(answer(args) ?? null), { status: 200 });
      }),
    );
  };

  beforeEach(async () => {
    fakeBrowser.reset();
    await logseqHostNameItem.setValue('127.0.0.1');
    await logseqPortItem.setValue(12315);
    await logseqAuthTokenItem.setValue('token');
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'debug').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  test('search resolves pages through logseq.Editor.getPage', async () => {
    stub({
      'logseq.App.getCurrentGraph': () => ({ name: 'logseq_db_Demo' }),
      'logseq.App.search': () => ({
        blocks: [pageHit('p1'), blockHit('b1')],
      }),
      'logseq.Editor.getPage': () => ({
        id: 194,
        uuid: 'p1',
        name: 'copilot test page',
        title: 'Copilot Test Page',
      }),
      'logseq.Editor.getBlock': () => block(),
    });

    const { response } = await new LogseqDBService().search('foo');

    expect(response.pages[0]).toMatchObject({
      name: 'copilot test page',
      originalName: 'Copilot Test Page',
    });
    expect(response.blocks).toHaveLength(1);
    expect(calls.map((c) => c.method)).not.toContain('get_page');
    expect(calls.filter((c) => c.method === 'logseq.Editor.getPage')[0].args).toEqual(
      ['p1'],
    );
  });

  describe('changeBlockMarker', () => {
    const status = (uuid = 'b1') => {
      const writes: unknown[][] = [];
      stub({
        'logseq.App.getCurrentGraph': () => ({ name: 'logseq_db_Demo' }),
        'logseq.Editor.getBlock': () => block(),
        'logseq.Editor.upsertBlockProperty': (args) => {
          writes.push(args);
          return null;
        },
      });
      return { writes, uuid };
    };

    test.each([
      ['DONE', 'Done'],
      ['TODO', 'Todo'],
      ['DOING', 'Doing'],
      ['CANCELED', 'Canceled'],
      ['CANCELLED', 'Canceled'],
    ])('%s sets the status property to "%s"', async (marker, title) => {
      const { writes } = status();
      const result = await new LogseqDBService().changeBlockMarker('b1', marker);
      expect(result).toMatchObject({ status: 'success', marker });
      expect(writes).toEqual([['b1', 'logseq.property/status', title]]);
    });

    test('refuses markers without a status counterpart (Logseq would clear it)', async () => {
      const { writes } = status();
      const result = await new LogseqDBService().changeBlockMarker('b1', 'NOW');
      expect(result.status).toBe('failed');
      expect(result.msg).toContain('NOW');
      expect(writes).toEqual([]);
    });

    test('fails for a block that does not exist', async () => {
      const writes: unknown[][] = [];
      stub({
        'logseq.App.getCurrentGraph': () => ({ name: 'logseq_db_Demo' }),
        'logseq.Editor.getBlock': () => null,
        'logseq.Editor.upsertBlockProperty': (args) => {
          writes.push(args);
          return null;
        },
      });
      const result = await new LogseqDBService().changeBlockMarker('gone', 'DONE');
      expect(result.status).toBe('failed');
      expect(writes).toEqual([]);
    });

    test('reports an error object from the API as failed', async () => {
      stub({
        'logseq.Editor.getBlock': () => block(),
        'logseq.Editor.upsertBlockProperty': () => ({ error: 'boom' }),
      });
      const result = await new LogseqDBService().changeBlockMarker('b1', 'DONE');
      expect(result).toMatchObject({ status: 'failed', msg: 'boom' });
    });
  });
});
