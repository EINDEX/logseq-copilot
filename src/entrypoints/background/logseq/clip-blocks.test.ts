import { beforeEach, describe, expect, test, vi } from 'vitest';
// tool must load first: tool.ts and db/service.ts import each other.
import './tool';
import LogseqDBService from './db/service';
import LogseqService from './markdown/service';
import type { ClipBlock } from '@/utils/clip-template';

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

  test('leaves property lines that are not the template properties as text', async () => {
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

describe('clipBlocks template properties', () => {
  const USER_URL = {
    ident: ':user.property/source-x1',
    title: 'source',
    ':logseq.property/type': 'url',
  };
  const USER_NUM = {
    ident: ':user.property/rating-x2',
    title: 'rating',
    ':logseq.property/type': 'number',
  };
  const withProperties = (props: any[] = []) => {
    const made = makeClient();
    const all = [...props];
    const client = {
      ...made.client,
      getAllProperties: vi.fn(async () => all),
      createProperty: vi.fn(async (title: string, type: string) => {
        made.calls.push(`create ${title} | ${type}`);
        all.push({ ident: `:user.property/${title}-new`, title, ':logseq.property/type': type });
        return 'Added: {:property 1}.';
      }),
      setBlockProperty: vi.fn(async (uuid: string, ident: string, value: unknown) => {
        made.calls.push(`property ${uuid} | ${ident} = ${JSON.stringify(value)}`);
        return null;
      }),
      getPage: vi.fn(async (): Promise<any> => ({ id: 193 })),
      createJournalPage: vi.fn(),
    };
    return { client, calls: made.calls };
  };
  const block = (content: string, properties: any[], ...children: ClipBlock[]): ClipBlock => ({
    content,
    children,
    properties,
  });
  const SOURCE = { key: 'source', value: 'https://e.com', line: 1, kind: 'url' };

  test('DB: strips the property lines before writing, then sets them by ident', async () => {
    const { client, calls } = withProperties([USER_URL]);
    const service = new LogseqDBService();
    service.client = client as any;
    await service.clipBlocks(
      'Page',
      block(
        'TODO link\nsource:: https://e.com\nread-on:: Nov 19th, 2026\nbody',
        [
          SOURCE,
          { key: 'read-on', value: 'Nov 19th, 2026', line: 2, kind: 'date', date: 'Nov 19th, 2026' },
        ],
        block('child\nrating:: 5', [{ key: 'rating', value: '5', line: 1, kind: 'default' }]),
      ),
    );
    expect(calls).toEqual([
      'create read-on | date',
      'append Page | link\nbody',
      'status b1 | Todo',
      'property b1 | :user.property/source-x1 = "https://e.com"',
      'property b1 | :user.property/read-on-new = 193',
      'create rating | default',
      'child b1 | child',
      'property b2 | :user.property/rating-new = "5"',
    ]);
  });

  test('DB: a value that does not fit keeps its line as text, the clip saves', async () => {
    const { client, calls } = withProperties([USER_NUM]);
    const service = new LogseqDBService();
    service.client = client as any;
    await expect(
      service.clipBlocks(
        'Page',
        block('link\nrating:: great', [{ key: 'rating', value: 'great', line: 1, kind: 'default' }]),
      ),
    ).resolves.toMatchObject({ rootUuid: 'b1' });
    expect(calls).toEqual(['append Page | link\nrating:: great']);
  });

  test('DB: a property Logseq refuses after the write is logged, not a failure', async () => {
    const { client, calls } = withProperties([USER_URL]);
    client.setBlockProperty.mockRejectedValue(new Error('500'));
    const service = new LogseqDBService();
    service.client = client as any;
    await expect(
      service.clipBlocks('Page', block('link\nsource:: https://e.com', [SOURCE])),
    ).resolves.toMatchObject({ rootUuid: 'b1' });
    expect(calls).toEqual(['append Page | link']);
  });

  test('DB: the properties list cannot be read: every line stays text', async () => {
    const { client, calls } = withProperties();
    client.getAllProperties.mockRejectedValue(new Error('down'));
    const service = new LogseqDBService();
    service.client = client as any;
    await service.clipBlocks('Page', block('link\nsource:: https://e.com', [SOURCE]));
    expect(calls).toEqual(['append Page | link\nsource:: https://e.com']);
  });

  test('DB: a line that no longer says the property stays (the text changed after render)', async () => {
    const { client, calls } = withProperties([USER_URL]);
    const service = new LogseqDBService();
    service.client = client as any;
    await service.clipBlocks('Page', block('link\nother text', [SOURCE]));
    expect(calls).toEqual(['append Page | link\nother text']);
  });

  test('file: writes the text as it is, property lines included', async () => {
    const { client, calls } = withProperties([USER_URL]);
    const service = new LogseqService();
    service.client = client as any;
    await service.clipBlocks('Page', block('link\nsource:: https://e.com', [SOURCE]));
    expect(calls).toEqual(['append Page | link\nsource:: https://e.com']);
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
