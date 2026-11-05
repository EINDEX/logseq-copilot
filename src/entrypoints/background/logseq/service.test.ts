/**
 * Service-level behaviour against a stubbed Logseq HTTP API: connection
 * failures must surface as one readable error, and changeBlockMarker must
 * report API errors truthfully. Both graph flavours share these expectations.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing';
import {
  logseqAuthTokenItem,
  logseqHostNameItem,
  logseqPortItem,
} from '@/utils/storage';
// tool.ts and the services import each other; load tool.ts first like the app does.
import './tool';
import LogseqService from './markdown/service';
import LogseqDBService from './db/service';
import {
  CannotConnectWithLogseq,
  LogseqError,
  LogseqVersionIsLower,
  TokenNotCurrect,
} from './error';

const flavours = [
  ['file', () => new LogseqService()],
  ['db', () => new LogseqDBService()],
] as const;

type Handler = (method: string, args: unknown[]) => unknown;

const stubApi = (handler: Handler) => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: unknown, init: { body: string }) => {
      const { method, args } = JSON.parse(init.body);
      const out = handler(method, args);
      if (out instanceof Response) return out;
      return new Response(JSON.stringify(out ?? null), { status: 200 });
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

describe.each(flavours)('connection failures (%s graph)', (_name, create) => {
  const offline = () =>
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );

  test('getGraph rejects with the "cannot connect" message', async () => {
    offline();
    const err = await create().getGraph().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LogseqError);
    expect((err as Error).message).toBe(CannotConnectWithLogseq.msg);
  });

  test('search / urlSearch / changeBlockMarker reject with the same message', async () => {
    offline();
    const service = create();
    for (const call of [
      () => service.search('x'),
      () => service.urlSearch(new URL('https://example.com/a')),
      () => service.changeBlockMarker('uuid', 'DONE'),
    ]) {
      const err = await call().catch((e: unknown) => e);
      expect((err as Error).message).toBe(CannotConnectWithLogseq.msg);
    }
  });

  test('getVersion rejects instead of returning undefined', async () => {
    offline();
    const err = await create().getVersion().catch((e: unknown) => e);
    expect((err as Error).message).toBe(CannotConnectWithLogseq.msg);
  });

  test('a rejected token is reported as such', async () => {
    stubApi(() => new Response('{}', { status: 401 }));
    const err = await create().getGraph().catch((e: unknown) => e);
    expect((err as Error).message).toBe(TokenNotCurrect.msg);
  });

  test('an invalid host is reported as "cannot connect"', async () => {
    await logseqHostNameItem.setValue('not a url');
    const err = await create().getGraph().catch((e: unknown) => e);
    expect((err as Error).message).toBe(CannotConnectWithLogseq.msg);
  });

  test('search on a too-old Logseq throws the version error as an Error', async () => {
    stubApi((method) =>
      method.endsWith('getCurrentGraph')
        ? { name: 'g', path: '/g' }
        : { error: 'MethodNotExist' },
    );
    const err = await create().search('x').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toBe(LogseqVersionIsLower.msg);
  });
});

// DB graphs keep the task state in a property; see db/service.test.ts.
describe('changeBlockMarker (file graph)', () => {
  const create = () => new LogseqService();
  const block = (content: string, marker = 'TODO') => ({
    uuid: 'u1',
    content,
    marker,
    page: { id: 1 },
  });

  const api = (opts: { content: string; update?: unknown }) => {
    const updates: unknown[][] = [];
    stubApi((method, args) => {
      if (method.endsWith('getCurrentGraph')) return { name: 'g', path: '/g' };
      if (method === 'logseq.Editor.getBlock') return block(opts.content);
      if (method === 'logseq.Editor.getPage')
        return { id: 1, name: 'p', uuid: 'p1' };
      if (method === 'logseq.Editor.updateBlock') {
        updates.push(args);
        return opts.update ?? null;
      }
      return null;
    });
    return updates;
  };

  test('replaces the marker and reports success', async () => {
    const updates = api({ content: 'TODO write tests' });
    const result = await create().changeBlockMarker('u1', 'DONE');
    expect(result).toMatchObject({ status: 'success', marker: 'DONE' });
    expect(updates).toEqual([['u1', 'DONE write tests']]);
  });

  test('reports failed when the API answers with an error object', async () => {
    api({ content: 'TODO write tests', update: { error: 'boom' } });
    const result = await create().changeBlockMarker('u1', 'DONE');
    expect(result.status).toBe('failed');
    expect(result.msg).toBeTruthy();
  });

  test('refuses scheduled blocks without calling updateBlock', async () => {
    const updates = api({ content: 'TODO x\nSCHEDULED: <2024-01-01 Mon>' });
    const result = await create().changeBlockMarker('u1', 'DONE');
    expect(result.status).toBe('failed');
    expect(updates).toEqual([]);
  });
});

describe('search (file graph)', () => {
  const REF = '65f0c0de-0000-4000-8000-000000000001';
  const hit = (n: number) => ({ 'block/uuid': `u${n}` });
  const block = (uuid: string, content = `foo ${uuid}`) => ({
    uuid,
    content,
    page: { id: 1 },
    parent: { id: 1 },
  });

  const api = (opts: { hits: number; find?: unknown[] | Error }) => {
    const calls: string[] = [];
    stubApi((method, args) => {
      calls.push(method);
      if (method.endsWith('getCurrentGraph')) return { name: 'g', path: '/g' };
      if (method === 'logseq.App.search')
        return { blocks: Array.from({ length: opts.hits }, (_, i) => hit(i)), pages: [] };
      if (method === 'logseq.Editor.getBlock') {
        const uuid = args[0] as string;
        return uuid === REF ? block(REF, 'the referenced block') : block(uuid);
      }
      if (method === 'logseq.Editor.getPage') return { id: 1, name: 'p', originalName: 'P', uuid: 'p1' };
      if (method === 'logseq.DB.q') {
        if (opts.find instanceof Error) return new Response('boom', { status: 500 });
        return opts.find ?? [];
      }
      return null;
    });
    return calls;
  };

  test('below the API limit there is no full-text query', async () => {
    const calls = api({ hits: 3 });
    const { response } = await new LogseqService().search('foo');
    expect(response.blocks).toHaveLength(3);
    expect(calls).not.toContain('logseq.DB.q');
  });

  test('a full search API page is completed by a full-text query, without repeats', async () => {
    const extra = Array.from({ length: 60 }, (_, i) => ({
      ...block(`x${i}`),
      page: { id: 2, name: 'other', originalName: 'Other' },
    }));
    api({ hits: 10, find: [block('u3'), ...extra] });
    const { response } = await new LogseqService().search('foo');
    const uuids = response.blocks.map((b: any) => b.uuid);
    expect(uuids).toHaveLength(50);
    expect(new Set(uuids).size).toBe(50);
    expect(uuids.slice(0, 10)).toEqual(Array.from({ length: 10 }, (_, i) => `u${i}`));
    // Blocks from the query keep their page name and get rendered.
    expect(response.blocks[10].page.originalName).toBe('Other');
    expect(response.blocks[10].html).toBe('<p><mark>foo</mark> x0</p>');
  });

  test('a failing full-text query keeps the search API results', async () => {
    api({ hits: 10, find: new Error('boom') });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { response } = await new LogseqService().search('foo');
    expect(response.blocks).toHaveLength(10);
  });

  test('block refs are rendered with the referenced text', async () => {
    stubApi((method, args) => {
      if (method.endsWith('getCurrentGraph')) return { name: 'g', path: '/g' };
      if (method === 'logseq.App.search') return { blocks: [hit(1)], pages: [] };
      if (method === 'logseq.Editor.getBlock')
        return args[0] === REF ? block(REF, 'the referenced block') : block('u1', `see ((${REF}))`);
      if (method === 'logseq.Editor.getPage') return { id: 1, name: 'p', uuid: 'p1' };
      return null;
    });
    const { response } = await new LogseqService().search('foo');
    expect(response.blocks[0].html).toContain('>the referenced block</a>');
  });
});
