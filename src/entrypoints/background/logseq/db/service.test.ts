import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing';
import {
  logseqAuthTokenItem,
  logseqHostNameItem,
  logseqPortItem,
} from '@/utils/storage';
// tool must load first: tool.ts and db/service.ts import each other.
import '../tool';
import LogseqDBService, {
  getBlockMarker,
  getBlockTags,
  resolveUuidRefs,
} from './service';

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

  test('renders page refs and tags by name (fullTitle), not by uuid', async () => {
    const { service } = makeService([blockHit('b1')], {
      content: 'see [[6ad82bf6-7f31-44da-a3c0-c83e5567b87d]] #[[6ad82bf7-3cf8-45bf-9e99-0c10feda6f7b]]',
      fullTitle: 'see [[Another Page]] #reading',
    });
    const block = await service.getBlock('b1', 'Demo');
    expect(block.content).toBe('see [[Another Page]] #reading');
    expect(block.html).toContain('page=Another%20Page">Another Page</a>');
    expect(block.html).toContain('page=reading">#reading</a>');
    expect(block.html).not.toContain('6ad82bf6');
  });

  test('keeps content when the build has no fullTitle', async () => {
    const { service } = makeService([blockHit('b1')], { content: 'plain text' });
    const block = await service.getBlock('b1', 'Demo');
    expect(block.html).toBe('<p>plain text</p>');
  });

  test('block refs show the readable text of the referenced block', async () => {
    const ref = '65f0c0de-0000-4000-8000-000000000001';
    const { service, client } = makeService([blockHit('b1')]);
    client.getBlockViaUuid.mockImplementation(async (uuid: string) =>
      uuid === ref
        ? ({ uuid, content: 'on [[6ad8]]', fullTitle: 'on [[Target Page]]' } as any)
        : ({ uuid, content: `see ((${ref}))`, page: { id: 1 } } as any),
    );
    const block = await service.getBlock('b1', 'Demo');
    expect(block.html).toContain('>on [[Target Page]]</a>');
  });

  test('getBlock rejects for a missing block', async () => {
    const { service, client } = makeService([]);
    client.getBlockViaUuid.mockResolvedValue(null as any);
    await expect(service.getBlock('nope', 'Demo')).rejects.toThrow();
  });
});

// Tag entities as Logseq 2.0.2 `logseq.Editor.getBlock` returns them in `tags`.
const BOOK = {
  id: 245,
  ident: ':user.class/Book-x1',
  uuid: '6ad833fe-0000-4000-8000-00000000b00c',
  title: 'Book',
  name: 'book',
};
const TASK = {
  id: 140,
  ident: ':logseq.class/Task',
  uuid: '00000002-1282-1814-5700-000000000000',
  title: 'Task',
  name: 'task',
};
const READING = {
  id: 250,
  ident: ':user.class/reading-x2',
  uuid: '6ad833fe-9c7c-4000-8000-000000000250',
  title: 'reading',
  name: 'reading',
};

describe('getBlockTags', () => {
  test('lists class tags by title, not by uuid', () => {
    expect(getBlockTags({ title: 'notes on a book', tags: [BOOK] })).toEqual(['Book']);
  });

  test('leaves out tags written inline in the title', () => {
    const block = {
      rawTitle: `about #[[${READING.uuid}]] and more`,
      fullTitle: 'about #reading and more',
      tags: [READING, BOOK],
    };
    expect(getBlockTags(block)).toEqual(['Book']);
  });

  test('leaves out #Task when the checkbox shows the status', () => {
    const task = {
      title: 'write it',
      tags: [TASK, BOOK],
      ':logseq.property/status': { ident: ':logseq.property/status.todo' },
    };
    expect(getBlockTags(task)).toEqual(['Book']);
    // Without a status there is no checkbox: keep the tag, like Logseq.
    expect(getBlockTags({ title: 'x', tags: [TASK] })).toEqual(['Task']);
  });

  test('leaves out internal and hide-from-node classes', () => {
    const block = {
      title: 'x',
      tags: [
        { ident: ':logseq.class/Page', title: 'Page' },
        { ident: ':logseq.class/Tag', title: 'Tag' },
        { ident: ':user.class/Hidden', title: 'Hidden', ':logseq.property.class/hide-from-node': true },
        BOOK,
      ],
    };
    expect(getBlockTags(block)).toEqual(['Book']);
  });

  test('ignores ids and missing tags', () => {
    expect(getBlockTags({ title: 'x', tags: [{ id: 3 }, 7] })).toEqual([]);
    expect(getBlockTags({ title: 'x' })).toEqual([]);
    expect(getBlockTags(null)).toEqual([]);
  });
});

describe('resolveUuidRefs', () => {
  const A = '6ad833fd-0000-4000-8000-00000000000a';
  const B = '6ad833fe-0000-4000-8000-00000000000b';
  const C = '6ad833fe-0000-4000-8000-00000000000c';
  const names: Record<string, string> = { [A]: 'Another Page', [B]: 'reading', [C]: 'Multi Word Tag' };

  test('replaces page refs and tags with page names', async () => {
    const getName = vi.fn(async (uuid: string) => names[uuid]);
    const text = await resolveUuidRefs(`see [[${A}]], #[[${B}]], #[[${C}]] and [[${A}]]`, getName);
    expect(text).toBe('see [[Another Page]], #reading, #[[Multi Word Tag]] and [[Another Page]]');
    expect(getName).toHaveBeenCalledTimes(3);
  });

  test('never shows a uuid for a page that cannot be read', async () => {
    const text = await resolveUuidRefs(`see [[${A}]] #[[${B}]]`, async (uuid) => {
      if (uuid === A) throw new Error('gone');
      return undefined;
    });
    expect(text).toBe('see [[Untitled]] #Untitled');
  });

  test('leaves text without uuid refs alone', async () => {
    const getName = vi.fn();
    expect(await resolveUuidRefs('see [[Page]] #tag', getName)).toBe('see [[Page]] #tag');
    expect(getName).not.toHaveBeenCalled();
  });
});

describe('LogseqDBService tags and refs', () => {
  test('a block gets its end-of-block tags as names', async () => {
    const { service } = makeService([blockHit('b1')], {
      content: 'showcase reading notes',
      fullTitle: 'showcase reading notes',
      rawTitle: 'showcase reading notes',
      tags: [BOOK],
    });
    const { response } = await service.search('showcase');
    expect(response.blocks[0].tagNames).toEqual(['Book']);
    expect(response.blocks[0].html).not.toContain(BOOK.uuid);
  });

  test('a task block hides #Task', async () => {
    const { service } = makeService([blockHit('b1')], {
      content: 'write the report',
      fullTitle: 'write the report',
      tags: [TASK],
      ':logseq.property/status': { ident: ':logseq.property/status.todo' },
    });
    const block = await service.getBlock('b1', 'Demo');
    expect(block.marker).toBe('TODO');
    expect(block.tagNames).toEqual([]);
  });

  test('without fullTitle, uuid refs are resolved through getPage once per page', async () => {
    const ref = '6ad833fd-0000-4000-8000-00000000000a';
    const { service, client } = makeService([blockHit('b1'), blockHit('b2')], {
      content: `see [[${ref}]] and #[[${ref}]]`,
    });
    client.getPage.mockImplementation(async (p: any) =>
      p.uuid === ref
        ? ({ uuid: ref, name: 'another page', originalName: 'Another Page' } as any)
        : ({ id: p.id, name: 'p' } as any),
    );
    const { response } = await service.search('see');
    for (const block of response.blocks) {
      expect(block.html).toContain('page=Another%20Page">Another Page</a>');
      expect(block.html).not.toContain(ref);
    }
    // One read for the shared page ({id: 1}) and one for the ref, for two blocks.
    expect(client.getPage).toHaveBeenCalledTimes(2);
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
