import { describe, expect, test, vi } from 'vitest';
import type LogseqClient from '../markdown/client';
import { FileRecallSource } from './file-source';
import { SEARCH_LIMIT } from './recall';

const page = { id: 1, uuid: 'p1', name: 'notes', originalName: 'Notes' };
const block = (uuid: string, id: number) => ({
  id,
  uuid,
  content: `foo ${uuid}`,
  page: { id: 1 },
  parent: { id: 1 },
});
const searchHits = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ 'block/uuid': `s${i}` }));

const source = (hits: number, find: () => Promise<unknown>) => {
  const client = {
    search: vi.fn(async () => ({ blocks: searchHits(hits), pages: [] })),
    find: vi.fn(find),
    getBlockViaUuid: vi.fn(async (uuid: string) =>
      block(uuid, Number(uuid.slice(1))),
    ),
    getPage: vi.fn(async () => page),
  };
  return {
    client,
    source: new FileRecallSource(
      client as unknown as LogseqClient,
      async () => 'g',
    ),
  };
};

describe('FileRecallSource.search', () => {
  test('below the App.search limit there is no full-text query', async () => {
    const { client, source: s } = source(3, async () => []);
    expect((await s.search('foo')).blocks).toHaveLength(3);
    expect(client.find).not.toHaveBeenCalled();
  });

  test('a full App.search answer is completed by DB.q, without repeats, from the cache', async () => {
    const extra = Array.from({ length: 40 }, (_, i) => block(`x${i}`, 100 + i));
    const { client, source: s } = source(10, async () => [block('s3', 3), ...extra]);

    const { blocks } = await s.search('foo');

    const uuids = blocks.map((b) => b.uuid);
    expect(uuids).toHaveLength(SEARCH_LIMIT);
    expect(new Set(uuids).size).toBe(SEARCH_LIMIT);
    expect(uuids.slice(0, 11)).toEqual([...searchHits(10).map((h) => h['block/uuid']), 'x0']);
    expect(client.find).toHaveBeenCalledWith('foo');
    // The query answers whole blocks: only the App.search hits are read.
    expect(client.getBlockViaUuid).toHaveBeenCalledTimes(10);
    // Their parents (by id) come from the cache too.
    expect((await s.getAncestor(100))?.uuid).toBe('x0');
    expect(client.getBlockViaUuid).toHaveBeenCalledTimes(10);
  });

  test('a failing full-text query keeps the App.search hits', async () => {
    const { source: s } = source(10, async () => {
      throw new Error('boom');
    });
    expect((await s.search('foo')).blocks).toHaveLength(10);
  });
});
