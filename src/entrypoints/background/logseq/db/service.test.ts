import { describe, expect, test, vi } from 'vitest';
// tool must load first: tool.ts and db/service.ts import each other.
import '../tool';
import LogseqDBService from './service';

const makeService = (searchBlocks: any[]) => {
  const service = new LogseqDBService();
  const client = {
    getGraph: vi.fn().mockResolvedValue({ name: 'logseq_db_Demo' }),
    search: vi.fn().mockResolvedValue({ blocks: searchBlocks }),
    getPage: vi.fn(async (p: any) => ({ uuid: p.uuid ?? 'page-uuid', name: 'P' })),
    getBlockViaUuid: vi.fn(async (uuid: string) => ({
      uuid,
      content: 'hello foo',
      page: { id: 1 },
    })),
  };
  service.client = client as any;
  return { service, client };
};

describe('LogseqDBService search result uuid', () => {
  test('reads the Logseq 2.0.2 `uuid` field', async () => {
    const { service, client } = makeService([
      { uuid: 'b1', 'page?': false },
      { uuid: 'p1', 'page?': true },
    ]);
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
    const { service } = makeService([{ uuid: 'b3', 'page?': false }]);
    const res = await service.urlSearch(new URL('https://example.com/f(x+1'));
    expect(res.response.blocks).toHaveLength(1);
    expect(res.response.blocks[0].uuid).toBe('b3');
  });
});
