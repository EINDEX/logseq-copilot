import { beforeEach, describe, expect, test, vi } from 'vitest';
// tool must load first: tool.ts and db/service.ts import each other.
import './tool';
import LogseqDBService from './db/service';
import LogseqService from './markdown/service';
import type { ClipBlock } from '@/utils/clip-template';
import { withTagText } from './clip-blocks';

const leaf = (content: string, ...children: ClipBlock[]): ClipBlock => ({
  content,
  children,
});

/** A fake graph: records every write in order, hands out uuids b1, b2, ... */
const makeClient = () => {
  const calls: string[] = [];
  let next = 0;
  const client = {
    appendBlock: vi.fn(async (page: string, content: string): Promise<any> => {
      calls.push(`append ${page} | ${content}`);
      return { uuid: `b${++next}` };
    }),
    insertChildBlock: vi.fn(async (parent: string, content: string): Promise<any> => {
      calls.push(`child ${parent} | ${content}`);
      return { uuid: `b${++next}` };
    }),
    setBlockStatus: vi.fn(async (uuid: string, status: string): Promise<any> => {
      calls.push(`status ${uuid} | ${status}`);
      return null;
    }),
  };
  return { client, calls };
};

const TREE = leaf(
  'link',
  leaf('p1'),
  leaf('p2', leaf('p2a'), leaf('p2b')),
  leaf('p3'),
);

describe.each([
  ['file graph', () => new LogseqService()],
  ['DB graph', () => new LogseqDBService()],
])('clipBlocks on a %s', (_name, create) => {
  let client: ReturnType<typeof makeClient>['client'];
  let calls: string[];
  let service: LogseqService | LogseqDBService;

  beforeEach(() => {
    ({ client, calls } = makeClient());
    service = create();
    service.client = client as any;
  });

  test('writes the root through appendBlock and children below their parent, in order, and returns the root uuid', async () => {
    await expect(service.clipBlocks('Page', TREE)).resolves.toMatchObject({
      rootUuid: 'b1',
    });
    expect(calls).toEqual([
      'append Page | link',
      'child b1 | p1',
      'child b1 | p2',
      'child b3 | p2a',
      'child b3 | p2b',
      'child b1 | p3',
    ]);
  });

  test('treats a 200 answer carrying an error as a failure', async () => {
    client.appendBlock.mockResolvedValueOnce({ error: 'page is read-only' });
    await expect(service.clipBlocks('Page', TREE)).rejects.toThrow('page is read-only');
    expect(calls).toEqual([]);
  });

  test('fails when Logseq does not return the block it wrote', async () => {
    client.appendBlock.mockResolvedValueOnce(null);
    await expect(service.clipBlocks('Page', TREE)).rejects.toThrow(
      'Logseq did not return the block it wrote.',
    );
  });

  test('says how far it got when a child cannot be written, and writes nothing after it', async () => {
    client.insertChildBlock.mockImplementation(async (parent, content) => {
      if (content === 'p2') return { error: 'insert failed' };
      calls.push(`child ${parent} | ${content}`);
      return { uuid: 'x' };
    });
    await expect(service.clipBlocks('Page', TREE)).rejects.toThrow(
      'Logseq stopped after 2 blocks of the clip: insert failed',
    );
    expect(calls).toEqual(['append Page | link', 'child b1 | p1']);
  });
});

describe('clipBlocks on a DB graph, task markers', () => {
  test('splits the marker off every block and sets its status', async () => {
    const { client, calls } = makeClient();
    const service = new LogseqDBService();
    service.client = client as any;
    await service.clipBlocks(
      'Page',
      leaf('TODO [t](https://e.com)', leaf('note'), leaf('DOING step', leaf('LATER deeper'))),
    );
    expect(calls).toEqual([
      'append Page | [t](https://e.com)',
      'status b1 | Todo',
      'child b1 | note',
      'child b1 | step',
      'status b3 | Doing',
      'child b3 | deeper',
      'status b4 | Todo',
    ]);
  });

  test('leaves properties as text', async () => {
    const { client, calls } = makeClient();
    const service = new LogseqDBService();
    service.client = client as any;
    await service.clipBlocks('Page', leaf('link\nsource:: https://e.com'));
    expect(calls).toEqual(['append Page | link\nsource:: https://e.com']);
  });

  test('fails when setting the status fails', async () => {
    const { client } = makeClient();
    client.setBlockStatus.mockResolvedValue({ error: 'no such property' });
    const service = new LogseqDBService();
    service.client = client as any;
    await expect(service.clipBlocks('Page', leaf('TODO x'))).rejects.toThrow(
      'no such property',
    );
  });
});

describe('clipBlocks on a file graph, task markers', () => {
  test('keeps the marker as text and never sets a status', async () => {
    const { client, calls } = makeClient();
    const service = new LogseqService();
    service.client = client as any;
    await service.clipBlocks('Page', leaf('TODO link', leaf('TODO child')));
    expect(calls).toEqual(['append Page | TODO link', 'child b1 | TODO child']);
    expect(client.setBlockStatus).not.toHaveBeenCalled();
  });
});

describe('withTagText', () => {
  test('puts the tag in front of the first line', () => {
    expect(withTagText('[t](https://e.com)\nmore', 'Reading')).toBe(
      '#[[Reading]] [t](https://e.com)\nmore',
    );
  });

  test('puts it behind a task marker, where the marker is still read', () => {
    expect(withTagText('TODO [t](u)', 'Reading')).toBe('TODO #[[Reading]] [t](u)');
    expect(withTagText('DONE x', 'a b')).toBe('DONE #[[a b]] x');
  });

  test('leaves content that has this tag text alone', () => {
    expect(withTagText('#[[Clip]] [t](u)', 'Clip')).toBe('#[[Clip]] [t](u)');
    expect(withTagText('see #[[Clip]] here', 'Clip')).toBe('see #[[Clip]] here');
    expect(withTagText('#[[Clip2]] x', 'Clip')).toBe('#[[Clip]] #[[Clip2]] x');
  });
});

describe('clipBlocks tag on a file graph', () => {
  const make = () => {
    const { client, calls } = makeClient();
    const service = new LogseqService();
    service.client = client as any;
    return { service, calls };
  };

  test('prefixes the root text only, never a child', async () => {
    const { service, calls } = make();
    await service.clipBlocks('Page', leaf('link', leaf('child')), {
      tag: { name: 'Reading' },
    });
    expect(calls).toEqual(['append Page | #[[Reading]] link', 'child b1 | child']);
  });

  test('does not prefix again when the root has that tag text', async () => {
    const { service, calls } = make();
    await service.clipBlocks('Page', leaf('#[[Clip]] [t](u)'), {
      tag: { name: 'Clip', uuid: 'stale' },
    });
    expect(calls).toEqual(['append Page | #[[Clip]] [t](u)']);
  });

  test('writes a clip without a tag, or with an empty one, as it is', async () => {
    const { service, calls } = make();
    await service.clipBlocks('Page', leaf('a'));
    await service.clipBlocks('Page', leaf('b'), { tag: { name: '  ' } });
    expect(calls).toEqual(['append Page | a', 'append Page | b']);
  });

  test('puts the tag behind a task marker', async () => {
    const { service, calls } = make();
    await service.clipBlocks('Page', leaf('TODO link'), { tag: { name: 'T' } });
    expect(calls).toEqual(['append Page | TODO #[[T]] link']);
  });
});

describe('clipBlocks tag on a DB graph', () => {
  const make = (tags: unknown = []) => {
    const { client, calls } = makeClient();
    const tagClient = {
      ...client,
      getAllTags: vi.fn(async (): Promise<any> => tags),
      createPage: vi.fn(async (name: string, _p: unknown, _o: unknown): Promise<any> => {
        calls.push(`createPage ${name}`);
        return { uuid: 'new-tag', title: name };
      }),
      addBlockTag: vi.fn(async (block: string, tag: string): Promise<any> => {
        calls.push(`addBlockTag ${block} ${tag}`);
        return null;
      }),
    };
    const service = new LogseqDBService();
    service.client = tagClient as any;
    return { service, calls, client: tagClient };
  };

  test('tags the root by uuid with the graph tag found by title, text left clean', async () => {
    const { service, calls, client } = make([
      { title: 'Other', name: 'other', uuid: 'u-other' },
      { title: 'Reading', name: 'reading', uuid: 'u-reading' },
    ]);
    await expect(
      service.clipBlocks('Page', leaf('link', leaf('child')), {
        // A stale uuid: the tag is found again by its title.
        tag: { name: 'reading', uuid: 'stale' },
      }),
    ).resolves.toMatchObject({ rootUuid: 'b1' });
    expect(calls).toEqual([
      'append Page | link',
      'addBlockTag b1 u-reading',
      'child b1 | child',
    ]);
    expect(client.createPage).not.toHaveBeenCalled();
  });

  test('creates a missing tag through createPage as a class, never createTag', async () => {
    const { service, calls, client } = make([{ title: 'Other', uuid: 'u-other' }]);
    expect((client as any).createTag).toBeUndefined();
    await service.clipBlocks('Page', leaf('link'), { tag: { name: 'Fresh' } });
    expect(client.createPage).toHaveBeenCalledWith(
      'Fresh',
      {},
      { class: true, redirect: false },
    );
    expect(calls).toEqual([
      'append Page | link',
      'createPage Fresh',
      'addBlockTag b1 new-tag',
    ]);
  });

  test('passes a uuid to addBlockTag, never a name', async () => {
    const { service, client } = make([{ title: 'Reading', uuid: 'u-reading' }]);
    await service.clipBlocks('Page', leaf('link'), { tag: { name: 'Reading' } });
    expect(client.addBlockTag).toHaveBeenCalledWith('b1', 'u-reading');
  });

  test('applies no tag without one', async () => {
    const { service, client } = make();
    await service.clipBlocks('Page', leaf('link'));
    expect(client.getAllTags).not.toHaveBeenCalled();
    expect(client.addBlockTag).not.toHaveBeenCalled();
  });

  test.each([
    ['addBlockTag answers with an error', (c: any) => c.addBlockTag.mockResolvedValue({ error: 'nope' })],
    ['addBlockTag throws', (c: any) => c.addBlockTag.mockRejectedValue(new Error('boom'))],
    ['getAllTags answers with an error', (c: any) => c.getAllTags.mockResolvedValue({ error: 'old Logseq' })],
    ['createPage answers with an error', (c: any) => {
      c.getAllTags.mockResolvedValue([]);
      c.createPage.mockResolvedValue({ error: 'read-only' });
    }],
  ])('still saves the clip when %s', async (_name, fail) => {
    const { service, calls, client } = make([{ title: 'Reading', uuid: 'u-reading' }]);
    fail(client);
    await expect(
      service.clipBlocks('Page', leaf('link', leaf('child')), { tag: { name: 'Reading' } }),
    ).resolves.toMatchObject({ rootUuid: 'b1' });
    expect(calls).toEqual(expect.arrayContaining(['append Page | link', 'child b1 | child']));
  });

  test('sets a task status and the tag on the same root', async () => {
    const { service, calls } = make([{ title: 'T', uuid: 'u-t' }]);
    await service.clipBlocks('Page', leaf('TODO link'), { tag: { name: 'T' } });
    expect(calls).toEqual([
      'append Page | link',
      'status b1 | Todo',
      'addBlockTag b1 u-t',
    ]);
  });
});

describe('listTags', () => {
  test('DB: the graph tags without the built-in classes, by title', async () => {
    const service = new LogseqDBService();
    service.client = {
      getAllTags: vi.fn(async () => [
        { title: 'Task', name: 'task', uuid: 'u1', ':logseq.property/built-in?': true },
        { title: 'Reading', name: 'reading', uuid: 'u2' },
        { title: 'Project', name: 'project', uuid: 'u3', ':logseq.property/built-in?': false },
      ]),
    } as any;
    await expect(service.listTags()).resolves.toEqual([
      { name: 'Project', uuid: 'u3' },
      { name: 'Reading', uuid: 'u2' },
    ]);
  });

  test('DB: throws when Logseq answers with an error', async () => {
    const service = new LogseqDBService();
    service.client = { getAllTags: vi.fn(async () => ({ error: 'MethodNotExist' })) } as any;
    await expect(service.listTags()).rejects.toThrow('MethodNotExist');
  });

  test('file: pages that are tags come from the query', async () => {
    const service = new LogseqService();
    service.client = {
      datascriptQuery: vi.fn(async () => [['Reading'], ['Clip'], ['Reading']]),
      getAllPages: vi.fn(),
    } as any;
    await expect(service.listTags()).resolves.toEqual([
      { name: 'Clip' },
      { name: 'Reading' },
    ]);
    expect((service.client as any).getAllPages).not.toHaveBeenCalled();
  });

  test('file: falls back to the pages, without journals, when no page is a tag', async () => {
    const service = new LogseqService();
    service.client = {
      datascriptQuery: vi.fn(async () => []),
      getAllPages: vi.fn(async () => [
        { name: 'reading', originalName: 'Reading', 'journal?': false },
        { name: 'nov 16th, 2026', originalName: 'Nov 16th, 2026', 'journal?': true },
        { name: 'inbox' },
      ]),
    } as any;
    await expect(service.listTags()).resolves.toEqual([
      { name: 'inbox' },
      { name: 'Reading' },
    ]);
  });

  test('file: falls back to the pages when the query fails', async () => {
    const service = new LogseqService();
    service.client = {
      datascriptQuery: vi.fn(async () => {
        throw new Error('query failed');
      }),
      getAllPages: vi.fn(async () => [{ name: 'a', originalName: 'A' }]),
    } as any;
    await expect(service.listTags()).resolves.toEqual([{ name: 'A' }]);
  });
});
