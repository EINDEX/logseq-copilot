/**
 * Runs the extension's Logseq client/service code against a real Logseq app.
 * The same tests run for the file-graph (0.10.x) and DB-graph (2.x) variants;
 * see global-setup.ts for how Logseq is started and seeded.
 */
import { beforeAll, describe, expect, inject, test } from 'vitest';
import { Window } from 'happy-dom';
import { fakeBrowser } from 'wxt/testing';
import {
  logseqAuthTokenItem,
  logseqHostNameItem,
  logseqPortItem,
  templates,
} from '@/utils/storage';
import { getLogseqService } from '@/entrypoints/background/logseq/tool';
import LogseqDBService from '@/entrypoints/background/logseq/db/service';
import LogseqService from '@/entrypoints/background/logseq/markdown/service';
import { clipToLogseq } from '@/entrypoints/background/clip';
import { renderClip } from '@/utils/clip-template';
import { BUILT_IN_TEMPLATES, TASK_TEMPLATE, TEMPLATE_PRESETS } from '@/utils/default-templates';
import { blockRending, buildTurndownService } from '@/utils/utils';
import { LogseqServiceInterface } from '@/entrypoints/background/logseq/interfaces';

const variant = inject('logseqVariant');
const isDB = variant === 'db';
const TEST_PAGE = 'Copilot Test Page';

const api = async (method: string, args: unknown[] = []) => {
  const resp = await fetch(`${inject('logseqApi')}/api`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${inject('logseqToken')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ method, args }),
  });
  return { status: resp.status, body: await resp.json().catch(() => null) };
};

beforeAll(async () => {
  fakeBrowser.reset();
  const apiUrl = new URL(inject('logseqApi'));
  await logseqHostNameItem.setValue(apiUrl.hostname);
  await logseqPortItem.setValue(Number(apiUrl.port));
  await logseqAuthTokenItem.setValue(inject('logseqToken'));
});

describe(`Logseq HTTP API (${variant})`, () => {
  test('rejects a wrong token', async () => {
    const resp = await fetch(`${inject('logseqApi')}/api`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer wrong-token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ method: 'logseq.App.getAppInfo', args: [] }),
    });
    expect(resp.status).toBe(401);
  });

  test('reports the expected graph type', async () => {
    const { body } = await api('logseq.App.checkCurrentIsDbGraph');
    // 0.10.x has no such API at all and answers with an error object.
    expect(body === true).toBe(isDB);
  });

  test('search returns seeded blocks', async () => {
    const { status, body } = await api('logseq.App.search', ['copilot']);
    expect(status).toBe(200);
    expect(body.blocks.length).toBeGreaterThanOrEqual(3);
  });
});

describe(`extension services (${variant})`, () => {
  let service: LogseqServiceInterface;

  beforeAll(async () => {
    service = await getLogseqService();
  });

  test('getLogseqService picks the matching service', () => {
    expect(service).toBeInstanceOf(isDB ? LogseqDBService : LogseqService);
  });

  test('getGraph returns the current graph name', async () => {
    const graph = await service.getGraph();
    expect(graph).toBe(isDB ? 'Demo' : 'copilot-file-graph');
  });

  test('getVersion returns the Logseq version', async () => {
    const version = await service.getVersion();
    expect(version).toMatch(isDB ? /^2\./ : /^0\.10\./);
  });

  test('search finds seeded blocks and renders html', async () => {
    const result = await service.search('copilot');
    expect(result.status).toBe(200);
    const blocks = result.response.blocks;
    expect(blocks.length).toBeGreaterThanOrEqual(3);
    const hello = blocks.find((b: any) =>
      b.content.toLowerCase().includes('hello from copilot'),
    );
    expect(hello).toBeDefined();
    expect(hello.html).toMatch(/^<p>.*copilot.*<\/p>$/i);
    expect(hello.page?.name?.toLowerCase()).toBe(TEST_PAGE.toLowerCase());
    if (isDB) {
      // The page hit is resolved through logseq.Editor.getPage.
      const page = result.response.pages.find(
        (p: any) => p?.name === TEST_PAGE.toLowerCase(),
      );
      expect(page?.originalName).toBe(TEST_PAGE);
    }
  });

  test('urlSearch finds blocks mentioning the URL', async () => {
    const result = await service.urlSearch(
      new URL('https://example.com/copilot/article'),
    );
    expect(result.status).toBe(200);
    expect(result.response.blocks.length).toBeGreaterThanOrEqual(1);
    expect(result.response.blocks[0].content).toContain(
      'example.com/copilot/article',
    );
  });

  test('client.appendBlock writes into a page (clip note path)', async () => {
    const marker = `clip-${Date.now()}`;
    const block = await service.client.appendBlock(
      TEST_PAGE,
      `Clipped ${marker}`,
    );
    expect(block?.uuid).toBeTruthy();

    const { body } = await api('logseq.Editor.getBlock', [block.uuid]);
    expect(body.content).toContain(marker);
  });

  describe('changeBlockMarker', () => {
    const readBlock = async (uuid: string) =>
      (await api('logseq.Editor.getBlock', [uuid])).body;

    // The block entity is re-parsed asynchronously after an edit.
    const eventually = async <T>(fn: () => Promise<T>, ok: (v: T) => boolean) => {
      let value = await fn();
      for (let i = 0; i < 20 && !ok(value); i++) {
        await new Promise((r) => setTimeout(r, 250));
        value = await fn();
      }
      return value;
    };

    test.skipIf(isDB)('cycles TODO -> DONE -> TODO and changes the block', async () => {
      const text = `marker-cycle-${Date.now()}`;
      const created = await service.client.appendBlock(TEST_PAGE, `TODO ${text}`);
      expect(created?.uuid).toBeTruthy();
      expect((await readBlock(created.uuid)).content).toContain(`TODO ${text}`);

      const done = await service.changeBlockMarker(created.uuid, 'DONE');
      expect(done).toMatchObject({ status: 'success', marker: 'DONE' });
      const afterDone = await eventually(
        () => readBlock(created.uuid),
        (b) => b.marker === 'DONE',
      );
      expect(afterDone.content).toContain(`DONE ${text}`);
      expect(afterDone.content).not.toContain(`TODO ${text}`);
      expect(afterDone.marker).toBe('DONE');

      const todo = await service.changeBlockMarker(created.uuid, 'TODO');
      expect(todo).toMatchObject({ status: 'success', marker: 'TODO' });
      const afterTodo = await eventually(
        () => readBlock(created.uuid),
        (b) => b.marker === 'TODO',
      );
      expect(afterTodo.content).toContain(`TODO ${text}`);
      expect(afterTodo.marker).toBe('TODO');
    });

    // DB graphs keep the task state in the `logseq.property/status` property
    // instead of a TODO/DONE prefix in the block text.
    test.skipIf(!isDB)('cycles the status property TODO -> DONE -> TODO', async () => {
      const text = `marker-cycle-${Date.now()}`;
      const created = await service.client.appendBlock(TEST_PAGE, text);
      expect(created?.uuid).toBeTruthy();

      const statusOf = async () =>
        (await readBlock(created.uuid))[':logseq.property/status']?.ident;

      const done = await service.changeBlockMarker(created.uuid, 'DONE');
      expect(done).toMatchObject({ status: 'success', marker: 'DONE' });
      expect(
        await eventually(statusOf, (v) => v === ':logseq.property/status.done'),
      ).toBe(':logseq.property/status.done');
      // The block text is untouched, the badge marker is derived from the status.
      const rendered = await service.getBlock(created.uuid, 'Demo');
      expect(rendered.content).toContain(text);
      expect(rendered.marker).toBe('DONE');

      const todo = await service.changeBlockMarker(created.uuid, 'TODO');
      expect(todo).toMatchObject({ status: 'success', marker: 'TODO' });
      expect(
        await eventually(statusOf, (v) => v === ':logseq.property/status.todo'),
      ).toBe(':logseq.property/status.todo');

      const refused = await service.changeBlockMarker(created.uuid, 'NOW');
      expect(refused.status).toBe('failed');
      expect(await statusOf()).toBe(':logseq.property/status.todo');
    });

    test.skipIf(isDB)('refuses a scheduled task and leaves it untouched', async () => {
      const text = `marker-scheduled-${Date.now()}`;
      const created = await service.client.appendBlock(
        TEST_PAGE,
        `TODO ${text}\nSCHEDULED: <2030-01-01 Tue>`,
      );
      expect((await readBlock(created.uuid)).content).toContain('SCHEDULED:');

      const result = await service.changeBlockMarker(created.uuid, 'DONE');
      expect(result.status).toBe('failed');
      expect((await readBlock(created.uuid)).content).toContain(`TODO ${text}`);
    });
  });
});

describe(`saving a page as a task (${variant})`, () => {
  const eventually = async <T>(fn: () => Promise<T>, ok: (v: T) => boolean) => {
    let value = await fn();
    for (let i = 0; i < 40 && !ok(value); i++) {
      await new Promise((r) => setTimeout(r, 500));
      value = await fn();
    }
    return value;
  };

  test('clips with the Task template, recalls it as TODO, and marks it DONE', async () => {
    const service = await getLogseqService();
    const stamp = Date.now();
    const url = `https://example.com/save-as-task-${stamp}`;
    const title = `Task page ${stamp}`;

    // The built-in Task template, on a page the fixture graph already has: a
    // file graph re-reads a journal file it has just created, which can undo
    // an edit made right after the clip.
    await templates.setValue([
      { ...TASK_TEMPLATE, clipNoteLocation: 'customPage', clipNoteCustomPage: TEST_PAGE },
    ]);
    await clipToLogseq({ url, title, data: '', templateId: 'task' });

    const recall = async () => {
      const result = await service.urlSearch(new URL(url));
      return result.response?.blocks?.find((b: any) =>
        b.content?.includes(`save-as-task-${stamp}`),
      );
    };

    const recalled = await eventually(recall, (b) => b?.marker === 'TODO');
    expect(recalled).toBeDefined();
    expect(recalled.marker).toBe('TODO');
    expect(recalled.content).toContain(`[${title}](${url})`);

    const result = await service.changeBlockMarker(recalled.uuid, 'DONE');
    expect(result).toMatchObject({ status: 'success', marker: 'DONE' });

    // Read the block itself: a file graph's full-text query can keep returning
    // the old text for a while after an edit.
    const read = (): Promise<any> => service.getBlock(recalled.uuid, 'Demo');
    const done = await eventually(read, (b) => b?.marker === 'DONE');
    expect(done.marker).toBe('DONE');
  });
});

describe(`escaping page text (${variant})`, () => {
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const eventually = async <T>(fn: () => Promise<T>, ok: (v: T) => boolean) => {
    let value = await fn();
    for (let i = 0; i < 40 && !ok(value); i++) {
      await sleep(500);
      value = await fn();
    }
    return value;
  };

  const lower = (list: any[]) =>
    (list ?? [])
      .map((p) => String(p.name ?? p.originalName ?? p.title).toLowerCase())
      .sort();
  const pageNames = async () => lower((await api('logseq.Editor.getAllPages')).body);
  const tagNames = async () =>
    isDB ? lower((await api('logseq.Editor.getAllTags')).body) : [];
  const countBlocks = async () => {
    const count = (list: any[]): number =>
      list.reduce((n, b) => n + 1 + count(b.children ?? []), 0);
    return count(
      (await api('logseq.Editor.getPageBlocksTree', [TEST_PAGE])).body ?? [],
    );
  };
  /**
   * The number of block lines of the test page on disk (a file graph only),
   * once the file has `stamp` and has stopped changing: Logseq writes late.
   */
  const bulletLines = async (stamp: string) => {
    const graph = (await api('logseq.App.getCurrentGraph')).body;
    const file = `${graph.path}/pages/${TEST_PAGE}.md`;
    const read = async () => (await import('node:fs')).readFileSync(file, 'utf8');
    const count = (text: string) =>
      text.split('\n').filter((l) => /^\t*- /.test(l)).length;
    await eventually(read, (t) => t.includes(stamp));
    let lines = count(await read());
    for (let i = 0; i < 10; i++) {
      await sleep(1000);
      const next = count(await read());
      if (next === lines) break;
      lines = next;
    }
    return lines;
  };

  const template = (content: string) => ({
    id: 'escape',
    name: 'Escape',
    content,
    clipNoteLocation: 'customPage' as const,
    clipNoteCustomPage: TEST_PAGE,
  });

  /**
   * A flat template and the same template as an outline: one top-level bullet,
   * the other lines continue its block. Both write the same block text.
   */
  const shapes = (flat: string): [string, string][] => {
    const [head, ...rest] = flat.split('\n');
    return [
      ['flat', flat],
      ['outline', [`- ${head}`, ...rest.map((l) => `  ${l}`)].join('\n')],
    ];
  };

  // What turndown makes of a page that is full of Logseq syntax.
  const pageText = (refUuid: string) =>
    [
      'Tags #tag and #[[multi word]] and #a/b and x [#A] and a#b',
      `Links \\[\\[turndown page\\]\\] and [[page x]] and ((${refUuid})) and {{macro x}} and {{embed [[Another Page]]}}`,
      '<iframe src="https://example.com"></iframe> and <!-- hidden --> and @@html: <b>x</b>@@',
      '`#code [[x]] {{y}}` and [a link #news](https://example.com/p#frag) and ![img](https://example.com/a.png#b)',
      'key:: value',
      'DONE not a marker here',
      '- not a bullet',
      '  - not a nested bullet',
      'SCHEDULED: <2030-01-01 Tue>',
      'DEADLINE: <2030-01-01 Tue>',
      ':LOGBOOK:',
      'CLOCK: [2030-01-01 Tue 10:00:00]',
      ':END:',
      '#+BEGIN_QUERY',
      '{:query [:find ?b :where [?b :block/name]]}',
      '#+END_QUERY',
      '```js',
      '#fence [[x]] TODO',
      'key:: v',
      '- dash',
      '```',
      'Liquid {{ date }} {% if x %} %}',
      // Square brackets: turndown writes each with a backslash, and Logseq
      // reads `\[ ... \]` as a LaTeX formula.
      'Foo\\[1\\] and see \\[note\\] here and \\[a\\](b) and \\[^1\\] and \\[:b\\]',
      '\\[ \\] not a checkbox',
      '\\[x\\] not a task',
      'literal \\\\\\[x\\\\\\] and \\[#A\\] and \\[1\\]\\[\\[b\\]\\]',
    ].join('\n');

  const expectNothingSpecial = async (
    uuid: string,
    before: { pages: string[]; tags: string[]; blocks: number },
    allowed: { pages?: string[]; tags?: string[]; blockTags?: string[] } = {},
  ) => {
    // The block entity and the page index are updated asynchronously.
    await sleep(2500);
    expect(await pageNames()).toEqual([...before.pages, ...(allowed.pages ?? [])].sort());
    expect(await tagNames()).toEqual([...before.tags, ...(allowed.tags ?? [])].sort());
    expect(await countBlocks()).toBe(before.blocks + 1);
    const read = (await api('logseq.Editor.getBlock', [uuid])).body;
    expect(read.marker ?? undefined).toBeUndefined();
    // A DB graph lists the tags of a block among its properties.
    expect(
      Object.keys(read.properties ?? {}).filter((k) => !(isDB && k === 'tags')),
    ).toEqual([]);
    expect(read[':logseq.property/status']).toBeUndefined();
    expect(lower(read.tags ?? read[':block/tags'] ?? [])).toEqual(
      allowed.blockTags ?? allowed.tags ?? [],
    );
    return read;
  };

  const snapshot = async () => ({
    pages: await pageNames(),
    tags: await tagNames(),
    blocks: await countBlocks(),
  });

  test.each(shapes('[{{title}}]({{url}})\n{{content}}'))(
    'clips page text with every kind of syntax as plain text (%s template)',
    async (_kind, templateContent) => {
    const service = await getLogseqService();
    const stamp = Date.now();
    const target = (await api('logseq.Editor.appendBlockInPage', [
      TEST_PAGE,
      `Escape ref target ${stamp}`,
    ])).body;
    const content = pageText(target.uuid);
    const url = `https://example.com/escape-${stamp}/Foo_(bar)`;
    const title = `Foo [beta] #release ${stamp}`;
    await templates.setValue([template(templateContent)]);
    const before = await snapshot();
    const bullets = isDB ? 0 : await bulletLines(`Escape ref target ${stamp}`);

    await clipToLogseq({ url, title, data: content, templateId: 'escape' });

    // Recall finds the clip by the URL, which has parentheses.
    const recall = async () =>
      (await service.urlSearch(new URL(url))).response?.blocks?.find((b: any) =>
        b.content?.includes(`escape-${stamp}`),
      );
    const recalled = await eventually(recall, (b) => !!b);
    expect(recalled).toBeDefined();
    expect(recalled.content).toContain(`Foo_(bar)`);

    const read = await expectNothingSpecial(recalled.uuid, before);
    expect(read.refs ?? []).toEqual([]);
    expect(read.content ?? read.title).toBe(
      blockRendingForTest(title, url, content),
    );
    // No `\]` is left in front of the text: `\[ ... \]` would be a formula. The
    // stored text has no formula, link, page, tag or property (checked above).
    const stored: string = read.content ?? read.title;
    expect(stored).toContain(
      'Foo\\[1] and see \\[note] here and \\[a](b) and \\[^1] and \\[:b]',
    );
    expect(stored).toContain('\n\\[ ] not a checkbox\n\\[x] not a task\n');
    // A literal backslash makes the whole line bare, see escapeForLogseq.
    expect(stored).toContain('literal \\\\[x\\\\] and [\\#A] and [1][\\[b]]');
    if (!isDB) {
      // A line `- x` of the text would start a block when the file is read.
      expect(await bulletLines(`escape-${stamp}`)).toBe(bullets + 1);
    }
  },
  );

  test.each(shapes('#[[Clip]] [{{title}}]({{url}})\n{{content}}'))(
    'keeps the tag of the template and escapes the tags of the page (%s template)',
    async (_kind, templateContent) => {
    const stamp = Date.now();
    await templates.setValue([template(templateContent)]);
    const before = await snapshot();
    await clipToLogseq({
      url: `https://example.com/escape-tag-${stamp}`,
      title: `News #news ${stamp}`,
      data: '#tag [[x]] TODO',
      templateId: 'escape',
    });
    const uuid = await eventually(
      async () =>
        (
          (await api('logseq.Editor.getPageBlocksTree', [TEST_PAGE])).body ?? []
        ).find((b: any) => (b.content ?? b.title ?? '').includes(`escape-tag-${stamp}`))
          ?.uuid,
      (v) => !!v,
    );
    // Only the page Clip is new: it comes from the template.
    const clip = before.pages.includes('clip') ? [] : ['clip'];
    const read = await expectNothingSpecial(uuid, before, {
      pages: clip,
      // A DB graph makes the tag of the template a tag, the first time only.
      tags: isDB && !before.tags.includes('clip') ? ['clip'] : [],
      blockTags: isDB ? ['clip'] : [],
    });
    expect(read.content ?? read.title).toContain(
      `[News \\#news ${stamp}](https://example.com/escape-tag-${stamp})`,
    );
  },
  );

  test.each(shapes('{{title}}\n{{content}}'))(
    'keeps the first line of the block from being a task, property or block (%s template)',
    async (_kind, templateContent) => {
    const stamp = Date.now();
    // The title is not in a link here: it can start the block.
    await templates.setValue([template(templateContent)]);
    const before = await snapshot();
    const bullets = isDB ? 0 : await bulletLines('Escape ref target');
    await clipToLogseq({
      title: `TODO [#A] first line ${stamp}`,
      data: 'key:: value\n- bullet',
      templateId: 'escape',
    });
    const uuid = await eventually(
      async () =>
        (
          (await api('logseq.Editor.getPageBlocksTree', [TEST_PAGE])).body ?? []
        ).find((b: any) => (b.content ?? b.title ?? '').includes(`first line ${stamp}`))
          ?.uuid,
      (v) => !!v,
    );
    const read = await expectNothingSpecial(uuid, before);
    expect(read.content ?? read.title).toBe(
      `\\TODO [\\#A] first line ${stamp}\nkey:\\: value\n\\- bullet`,
    );
    if (!isDB) expect(await bulletLines(`first line ${stamp}`)).toBe(bullets + 1);
  },
  );

  // What turndown makes of a page when the template splits it into blocks: the
  // paragraphs and items of a list, each one a block of its own.
  const BLOCKS = [
    'TODO first #tag [[page x]]\nkey:: value',
    'DONE second SCHEDULED: <2030-01-01 Tue>',
    '*   TODO item one {{macro x}}\n    *   key:: nested\n*   #item [[x]]',
    '\\- not a bullet',
    ':LOGBOOK:',
    '```\n#fence [[x]] TODO\n```',
  ].join('\n\n');

  test('makes a block of each paragraph and item, none of them special', async () => {
    const stamp = Date.now();
    await templates.setValue([template('- [{{title}}]({{url}})\n  - {{content}}')]);
    const before = await snapshot();
    await clipToLogseq({
      url: `https://example.com/escape-split-${stamp}`,
      title: `Split #news ${stamp}`,
      data: BLOCKS,
      templateId: 'escape',
    });

    type Node = { text: string; children: Node[]; raw: any };
    const toNode = (b: any): Node => ({
      text: String(b.content ?? b.title ?? ''),
      children: (b.children ?? []).map(toNode),
      raw: b,
    });
    const read = async (): Promise<Node | undefined> => {
      const tree = (await api('logseq.Editor.getPageBlocksTree', [TEST_PAGE])).body ?? [];
      const root = tree.find((b: any) =>
        String(b.content ?? b.title ?? '').includes(`escape-split-${stamp}`),
      );
      return root && toNode(root);
    };
    const root = await eventually(read, (r) => (r?.children.length ?? 0) >= 6);
    await sleep(2500);
    const settled = (await read())!;

    const all = (n: Node): Node[] => [n, ...n.children.flatMap(all)];
    const nodes = all(settled);
    expect(settled.text).toBe(
      `[Split \\#news ${stamp}](https://example.com/escape-split-${stamp})`,
    );
    expect(root).toBeDefined();
    // The text of each block, and the nesting of the list under its item.
    expect(
      settled.children.map((c) => [c.text, c.children.map((g) => g.text)]),
    ).toEqual([
      ['\\TODO first \\#tag \\[[page x]]\nkey:\\: value', []],
      ['\\DONE second \\SCHEDULED: <2030-01-01 Tue>', []],
      ['\\TODO item one \\{{macro x}}', ['key:\\: nested']],
      ['\\#item \\[[x]]', []],
      ['\\- not a bullet', []],
      ['\\:LOGBOOK:', []],
      // A DB graph turns a fenced block into a code block: its text is the code.
      [isDB ? '#fence [[x]] TODO' : '```\n#fence [[x]] TODO\n```', []],
    ]);
    expect(nodes.length).toBe(1 + 7 + 1);
    expect(await countBlocks()).toBe(before.blocks + nodes.length);
    expect(await pageNames()).toEqual(before.pages);
    expect(await tagNames()).toEqual(before.tags);
    for (const node of nodes) {
      expect(node.raw.marker ?? undefined).toBeUndefined();
      expect(
        Object.keys(node.raw.properties ?? {}).filter((k) => !(isDB && k === 'tags')),
      ).toEqual([]);
    }
  });

  // `- {{title}} {{content}}` with no title: the content starts the block, so
  // its first line must not be live (marker, property, block, page or tag).
  test('keeps the first line of the content text when the title is empty', async () => {
    const stamp = Date.now();
    await templates.setValue([template('- {{title}} {{content}}')]);
    const lines = [
      `TODO t${stamp}`,
      `key:: t${stamp}`,
      `- t${stamp}`,
      `# t${stamp}`,
      `SCHEDULED: <2030-01-01 Tue> t${stamp}`,
    ];
    const before = await snapshot();
    for (const line of lines) {
      await clipToLogseq({
        url: `https://example.com/empty-title-${stamp}`,
        title: '',
        data: line,
        templateId: 'escape',
      });
    }
    const read = async () =>
      ((await api('logseq.Editor.getPageBlocksTree', [TEST_PAGE])).body ?? []).filter(
        (b: any) => String(b.content ?? b.title ?? '').includes(`t${stamp}`),
      );
    await eventually(read, (r) => r.length >= lines.length);
    await sleep(2500);
    const blocks = await read();
    expect(blocks.length).toBe(lines.length);
    for (const block of blocks) {
      expect(block.children ?? []).toEqual([]);
      expect(block.marker ?? undefined).toBeUndefined();
      expect(block.scheduled ?? undefined).toBeUndefined();
      expect(
        Object.keys(block.properties ?? {}).filter((k) => !(isDB && k === 'tags')),
      ).toEqual([]);
    }
    expect(await countBlocks()).toBe(before.blocks + lines.length);
    expect(await pageNames()).toEqual(before.pages);
    expect(await tagNames()).toEqual(before.tags);
  });

  // What a hostile page can put in a link destination. The destination of a
  // link is not read as text, so a hostile one must not be left raw: Logseq
  // reads a destination with a space as a page link and the rest as text.
  test('keeps what the page puts in a link destination from being active', async () => {
    const stamp = Date.now();
    const content = [
      `Links ${stamp} [a](x {{embed [[Dest Embed Page]]}}) and [b](x #desttag) and [c](<x> [[Dest Page C]])`,
      'Images ![i](x {{embed [[Dest Embed Image]]}}) and ![j](x #imgtag) and ![k](<x> [[Dest Page K]])',
      'Newline [d](https://example.com/a',
      '[[Dest Newline Page]]) and [e](https://example.com/a "title #titletag [[Dest Title Page]]")',
      'Planning [f](https://example.com/a SCHEDULED: <2030-01-01 Tue>) and [g](https://example.com/a DEADLINE: <2030-01-01 Tue>)',
      'Label [l #labeltag](x y) and [m [n]](x y) and [o](https://example.com/a`[[Dest Code Page]]`)',
      'Plain [h](https://example.com/p?q=[[a]]&r={{b}}#frag) and [Foo](https://en.wikipedia.org/wiki/Foo_(bar)) and ![p](https://example.com/a.png)',
    ].join('\n');
    await templates.setValue([template('{{content}}')]);
    const before = await snapshot();
    const bullets = isDB ? 0 : await bulletLines('Escape ref target');

    await clipToLogseq({ data: content, templateId: 'escape' });

    const uuid = await eventually(
      async () =>
        (
          (await api('logseq.Editor.getPageBlocksTree', [TEST_PAGE])).body ?? []
        ).find((b: any) => (b.content ?? b.title ?? '').includes(`Links ${stamp}`))
          ?.uuid,
      (v) => !!v,
    );
    const read = await expectNothingSpecial(uuid, before);
    expect(read.refs ?? []).toEqual([]);
    expect(read.scheduled ?? read.deadline).toBeUndefined();
    const stored: string = read.content ?? read.title;
    expect(stored.split('\n')).toEqual([
      `Links ${stamp} \\[a](x \\{{embed \\[[Dest Embed Page]]}}) and \\[b](x \\#desttag) and \\[c](\\<x> \\[[Dest Page C]])`,
      'Images !\\[i](x \\{{embed \\[[Dest Embed Image]]}}) and !\\[j](x \\#imgtag) and !\\[k](\\<x> \\[[Dest Page K]])',
      'Newline [d](https://example.com/a',
      '\\[[Dest Newline Page]]) and \\[e](https://example.com/a "title \\#titletag \\[[Dest Title Page]]")',
      'Planning \\[f](https://example.com/a \\SCHEDULED: <2030-01-01 Tue>) and \\[g](https://example.com/a \\DEADLINE: <2030-01-01 Tue>)',
      'Label \\[l \\#labeltag](x y) and \\[m [n]](x y) and \\[o](https://example.com/a`[[Dest Code Page]]`)',
      // Ordinary links keep their text.
      'Plain [h](https://example.com/p?q=[[a]]&r={{b}}#frag) and [Foo](https://en.wikipedia.org/wiki/Foo_(bar)) and ![p](https://example.com/a.png)',
    ]);
    // The line after the newline in a destination is no block either.
    if (!isDB) expect(await bulletLines(`Links ${stamp}`)).toBe(bullets + 1);
  });

  // Fences that Logseq does not close where CommonMark does, an alt text that
  // breaks out of its label, and a backslash that makes a line bare: what a
  // hostile page puts in <pre> and <img alt> must stay text. Every clip is one
  // case with its own marker, because Logseq pairs the fence marks of a whole
  // block and one case must not decide how the next one reads. Every name below
  // is a page, tag or property that must not exist afterwards.
  describe('hostile code blocks and image alt texts', () => {
    const evil = (name: string) =>
      `#tag${name} [[Page ${name}]] {{embed [[Embed ${name}]]}}\nkey${name}:: v\nTODO x${name}\nSCHEDULED: <2030-01-01 Tue>\n- dash${name}`;
    const pre = (code: string, lang = '') => {
      const p = document.createElement('pre');
      const c = document.createElement('code');
      if (lang) c.className = `language-${lang}`;
      c.textContent = code;
      p.appendChild(c);
      return p;
    };
    const img = (alt: string) => {
      const i = document.createElement('img');
      i.setAttribute('alt', alt);
      i.setAttribute('title', `Title ${alt}`);
      i.setAttribute('src', 'https://example.com/a.png');
      const p = document.createElement('p');
      p.appendChild(i);
      return p;
    };
    // Turndown reads a DOM, like the content script gives it.
    const { document } = new Window();
    const clip = async (marker: string, ...nodes: any[]) => {
      const container = document.createElement('div');
      const intro = document.createElement('p');
      intro.textContent = marker;
      container.appendChild(intro);
      for (const n of nodes) container.appendChild(n);
      const data = buildTurndownService().turndown(container as unknown as HTMLElement);
      await templates.setValue([template('{{content}}')]);
      const before = await snapshot();
      const bullets = isDB ? 0 : await bulletLines('Escape ref target');
      await clipToLogseq({ data, templateId: 'escape' });
      const uuid = await eventually(
        async () =>
          (
            (await api('logseq.Editor.getPageBlocksTree', [TEST_PAGE])).body ?? []
          ).find((b: any) => (b.content ?? b.title ?? '').includes(marker))?.uuid,
        (v) => !!v,
      );
      const read = await expectNothingSpecial(uuid, before);
      expect(read.refs ?? []).toEqual([]);
      expect(read.scheduled ?? read.deadline).toBeUndefined();
      const stored: string = read.content ?? read.title;
      expect(stored).toBe(
        blockRending({
          data,
          clipNoteTemplate: '{{content}}',
          preferredDateFormat: 'MMM do, yyyy',
          time: new Date(),
        }),
      );
      // The `- dash` lines of the page text start no block when the file is read.
      if (!isDB) expect(await bulletLines(marker)).toBe(bullets + 1);
      return stored;
    };
    const mark = (n: string) => `Hostile ${n} ${Date.now()}`;

    // A fence mark that turndown does not count and Logseq closes at.
    test.each([
      ['A1', '~~~', ''],
      ['A2', '    ```', ''],
      ['A3', '\t```', ''],
      ['A4', '  ~~~', ''],
      ['A5', '``` js', 'js'],
    ])('escapes what follows a mark Logseq closes at (%s)', async (name, closer, lang) => {
      const stored = await clip(
        mark(name),
        pre(`${evil(`${name}a`)}\n${closer}\n${evil(`${name}b`)}`, lang),
      );
      expect(stored).toContain(`\\#tag${name}b \\[[Page ${name}b]]`);
    });

    // A language that is not plain text.
    test.each([
      ['A6', 'key6::'],
      ['A7', '[[Lang Page]]'],
      ['A8', '#langtag'],
    ])('escapes the info string and the lines of a code block (%s)', async (name, lang) => {
      const stored = await clip(mark(name), pre(evil(name), lang));
      expect(stored).toContain(`\\#tag${name} \\[[Page ${name}]]`);
    });

    test('keeps plain code as it is', async () => {
      const stored = await clip(mark('A9'), pre(evil('A9'), 'js'));
      expect(stored).toContain(`\`\`\`js\n${evil('A9')}\n\`\`\``);
    });

    // An alt text that breaks out of its label.
    test.each([
      [
        'I1',
        'a](https://example.com/b.png) [[Page I1]] #tagI1',
        ' ![a\\](https://example.com/b.png) \\[\\[Page I1\\]\\] \\#tagI1](https://example.com/a.png)',
      ],
      [
        'I2',
        'x]] [[Page I2]] {{embed [[Embed I2]]}} #tagI2',
        ' ![x\\]\\] \\[\\[Page I2\\]\\] \\{{embed \\[\\[Embed I2\\]\\]}} \\#tagI2](https://example.com/a.png)',
      ],
      [
        'I3',
        'one\nkeyI3:: v\n[[Page I3]]\n- dashI3\nTODO xI3\nSCHEDULED: <2030-01-01 Tue>',
        ' ![one keyI3:: v \\[\\[Page I3\\]\\] - dashI3 TODO xI3 \\SCHEDULED: <2030-01-01 Tue>](https://example.com/a.png)',
      ],
    ])('keeps an alt text in its label (%s)', async (name, alt, expected) => {
      const stored = await clip(mark(name), img(alt));
      expect(stored).toContain(expected);
    });

    test('joins the lines of an alt text', async () => {
      const stored = await clip(mark('I4'), img('a](y)\n\n[[Page I4]]'));
      expect(stored).not.toMatch(/!\[[^\]]*\n/);
    });

    // The same pages through an outline template: the content is split into
    // blocks, and each block is escaped. Splitter, escaper and outline parser
    // must read the fences alike, or a line the escaper leaves as code starts a
    // block of its own, and text of the page is active.
    const NESTED = '- [{{title}}]({{url}})\n  - {{content}}';
    const PREFIXED = '- [{{title}}]({{url}})\n  - Note: {{content}}';
    type Node = { text: string; raw: any; children: Node[] };
    const clipOutline = (tpl: string, name: string, ...nodes: any[]) => {
      const container = document.createElement('div');
      for (const n of nodes) container.appendChild(n);
      const data = buildTurndownService().turndown(container as unknown as HTMLElement);
      return clipOutlineData(tpl, name, data);
    };
    const clipOutlineData = async (tpl: string, name: string, data: string) => {
      const marker = mark(name);
      const url = `https://example.com/outline-${name}-${Date.now()}`;
      const expected = renderClip(tpl, {
        url,
        title: marker,
        data,
        preferredDateFormat: 'MMM do, yyyy',
        time: new Date(),
      });
      const count = (blocks: { children: unknown[] }[]): number =>
        blocks.reduce((n, b) => n + 1 + count(b.children as any), 0);
      await templates.setValue([template(tpl)]);
      const before = await snapshot();
      await clipToLogseq({ url, title: marker, data, templateId: 'escape' });

      const toNode = (b: any): Node => ({
        text: String(b.content ?? b.title ?? ''),
        raw: b,
        children: (b.children ?? []).map(toNode),
      });
      const all = (n: Node): Node[] => [n, ...n.children.flatMap(all)];
      const read = async () => {
        const tree = (await api('logseq.Editor.getPageBlocksTree', [TEST_PAGE])).body ?? [];
        const root = tree.find((b: any) => String(b.content ?? b.title ?? '').includes(url));
        return root && toNode(root);
      };
      await eventually(
        async () => (await read()) && all((await read())!).length,
        (n) => n === count(expected),
      );
      await sleep(2500);
      const root = (await read())!;
      const written = all(root);

      // Nothing of the page is a page, a tag, a property, a marker or a block
      // that the template does not make.
      expect(written.length).toBe(count(expected));
      expect(await countBlocks()).toBe(before.blocks + written.length);
      expect(await pageNames()).toEqual(before.pages);
      expect(await tagNames()).toEqual(before.tags);
      for (const node of written) {
        expect(node.raw.marker ?? undefined).toBeUndefined();
        expect(node.raw.scheduled ?? node.raw.deadline).toBeUndefined();
        expect(
          Object.keys(node.raw.properties ?? {}).filter((k) => !(isDB && k === 'tags')),
        ).toEqual([]);
      }
      // The text of every block is what the template renders, in the same tree.
      // A DB graph turns a fenced block into a code block: its text is the code.
      const same = (got: Node, want: { content: string; children: any[] }) => {
        if (!isDB || !/^\s*(?:`{3}|~{3})/.test(want.content)) {
          expect(got.text).toBe(want.content);
          // (A DB code block refers to its built-in language property.)
          expect(got.raw.refs ?? []).toEqual([]);
        }
        expect(got.children.length).toBe(want.children.length);
        got.children.forEach((c, i) => same(c, want.children[i]));
      };
      same(root, expected[0]);
      return expected[0];
    };

    test.each([
      ['O1', '~~~', ''],
      ['O2', '    ```', ''],
      ['O3', '\t```', ''],
      ['O4', '  ~~~', ''],
      ['O5', '``` js', 'js'],
    ])('splits a page after a mark Logseq closes at (%s)', async (name, closer, lang) => {
      const root = await clipOutline(
        NESTED,
        name,
        pre(`${evil(`${name}a`)}\n${closer}\n${evil(`${name}b`)}`, lang),
      );
      const text = JSON.stringify(root);
      // What follows the closing mark is text of blocks of its own.
      expect(text).toContain(`\\\\#tag${name}b \\\\[[Page ${name}b]]`);
    });

    test.each([
      ['O6', 'key6::'],
      ['O7', '[[Lang Page]]'],
      ['O8', '#langtag'],
    ])('escapes a code block whose info string is not plain (%s)', async (name, lang) => {
      const root = await clipOutline(NESTED, name, pre(evil(name), lang));
      expect(JSON.stringify(root)).toContain(`\\\\#tag${name} \\\\[[Page ${name}]]`);
    });

    test('keeps plain code in one block, as it is', async () => {
      const root = await clipOutline(NESTED, 'O9', pre(`${evil('O9')}\n\nmore`, 'js'));
      expect(root.children).toHaveLength(1);
      expect(root.children[0].content).toBe(`\`\`\`js\n${evil('O9')}\n\nmore\n\`\`\``);
    });

    // Text of the template in front of the content: its first mark is no mark.
    test.each([
      ['P1', '', 'js'],
      ['P2', '~~~', ''],
      ['P3', '    ```', ''],
    ])('pairs the marks behind text of the template (%s)', async (name, closer, lang) => {
      const code = closer
        ? `${evil(`${name}a`)}\n${closer}\n${evil(`${name}b`)}`
        : evil(name);
      const root = await clipOutline(PREFIXED, name, pre(code, lang));
      expect(root.children).toHaveLength(1);
      expect(root.children[0].content.startsWith('Note: ```')).toBe(true);
    });

    test.each([
      ['Q1', 'a](https://example.com/b.png) [[Page Q1]] #tagQ1'],
      ['Q2', 'one\nkeyQ2:: v\n[[Page Q2]]\n- dashQ2\nTODO xQ2\nSCHEDULED: <2030-01-01 Tue>'],
    ])('keeps an alt text in its label under an outline (%s)', async (name, alt) => {
      for (const tpl of [NESTED, PREFIXED]) {
        await clipOutline(tpl, `${name}${tpl === NESTED ? 'n' : 'p'}`, img(alt));
      }
    });

    // A backslash before a bracket: bare lines, written as ever.
    test('keeps a literal backslash before a bracket from making a link or a page, under an outline', async () => {
      const text = [
        'Bare \\\\\\[[Bare Page 1]]',
        '\\\\\\] \\[[Bare Page 2]] and \\\\\\] \\[[Bare Page 3\\]]',
        '\\\\\\] \\[a]([[Bare Page 4]]) and a\\\\\\[b]([[Bare Page 5]])',
        '\\\\\\[ \\[[Bare Page 6]] and \\\\\\] \\[[#baretag]]',
      ].join('\n\n');
      // The text is the data, as the content script gives it after turndown.
      for (const tpl of [NESTED, PREFIXED]) {
        await clipOutlineData(tpl, `B${tpl === NESTED ? 'n' : 'p'}`, text);
      }
    });
  });

  test('keeps a literal backslash before a bracket from making a link or a page', async () => {
    const stamp = Date.now();
    const content = [
      `Bare ${stamp} \\\\\\[[Bare Page 1]]`,
      '\\\\\\] \\[[Bare Page 2]] and \\\\\\] \\[[Bare Page 3\\]]',
      '\\\\\\] \\[a]([[Bare Page 4]]) and a\\\\\\[b]([[Bare Page 5]]) and a\\\\\\[b](https://example.com/c)',
      '\\\\\\[ \\[[Bare Page 6]] and \\\\\\] \\[[#baretag]]',
      '\\\\\\[x\\\\\\] \\[\\[Bare Page 7\\]\\] and \\\\[[Bare Page 8]]',
    ].join('\n');
    await templates.setValue([template('{{content}}')]);
    const before = await snapshot();
    const bullets = isDB ? 0 : await bulletLines('Escape ref target');

    await clipToLogseq({ data: content, templateId: 'escape' });

    const uuid = await eventually(
      async () =>
        (
          (await api('logseq.Editor.getPageBlocksTree', [TEST_PAGE])).body ?? []
        ).find((b: any) => (b.content ?? b.title ?? '').includes(`Bare ${stamp}`))
          ?.uuid,
      (v) => !!v,
    );
    const read = await expectNothingSpecial(uuid, before);
    expect(read.refs ?? []).toEqual([]);
    const stored: string = read.content ?? read.title;
    expect(stored.split('\n')).toEqual([
      `Bare ${stamp} \\\\[\\[Bare Page 1]]`,
      '\\\\] [\\[Bare Page 2]] and \\\\] [\\[Bare Page 3]]',
      '\\\\] [a]\\(\\[[Bare Page 4]]) and a\\\\[b]\\(\\[[Bare Page 5]]) and a\\\\[b]\\(https://example.com/c)',
      '\\\\[ [\\[Bare Page 6]] and \\\\] [\\[\\#baretag]]',
      '\\\\[x\\\\] [\\[Bare Page 7]] and \\\\\\[[Bare Page 8]]',
    ]);
    if (!isDB) expect(await bulletLines(`Bare ${stamp}`)).toBe(bullets + 1);
  });

  // `{{content}}` behind text on its line: the first line of the page text is
  // not the start of a line, so a fence mark there opens nothing and the lines
  // after it are text. Nothing in the text may be live.
  describe('page text behind other text on its line', () => {
    const cases: [string, (stamp: number) => string][] = [
      [
        'fence',
        (stamp) => `\`\`\`js\n[[Mid Page 1]] #midtag1 {{embed [[Mid Embed 1]]}}\nmidkey1:: v\n\`\`\`\nend ${stamp}`,
      ],
      [
        'tilde fence',
        (stamp) => `~~~\n[[Mid Page 2]] #midtag2 {{embed [[Mid Embed 2]]}}\nmidkey2:: v\n~~~\nend ${stamp}`,
      ],
      ['task marker', (stamp) => `TODO midtask3 ${stamp}\nmore`],
      ['dash', (stamp) => `- middash4 ${stamp}\nmore`],
      ['property', (stamp) => `midkey5:: v ${stamp}\nmore`],
      ['tag', (stamp) => `#midtag6 ${stamp}\nmore`],
      ['heading', (stamp) => `# midhead8 ${stamp}\nmore`],
      ['drawer', (stamp) => `:LOGBOOK: ${stamp}\nCLOCK: [2030-01-01 Tue 10:00:00]\n:END:`],
      ['planning', (stamp) => `SCHEDULED: <2030-01-01 Tue> ${stamp}\nmore`],
      [
        'fence, no close',
        (stamp) => `\`\`\`\n[[Mid Page 7]] #midtag7\nmidkey7:: v\nend ${stamp}`,
      ],
    ];

    test.each(['> {{content}}', 'Quote: {{content}}'])(
      'writes hostile page text as text (%s)',
      async (clipTemplate) => {
        await templates.setValue([template(clipTemplate)]);
        for (const [name, make] of cases) {
          await sleep(5);
          const stamp = String(Date.now());
          const data = make(Number(stamp));
          const where = `${clipTemplate} / ${name}`;
          const before = await snapshot();
          const bullets = isDB ? 0 : await bulletLines('Escape ref target');
          await clipToLogseq({ data, templateId: 'escape' });
          const uuid = await eventually(
            async () =>
              (
                (await api('logseq.Editor.getPageBlocksTree', [TEST_PAGE])).body ?? []
              ).find((b: any) =>
                (b.content ?? b.title ?? '').includes(stamp),
              )?.uuid,
            (v) => !!v,
          );
          const read = await expectNothingSpecial(uuid, before).catch((e) => {
            throw new Error(`${where}: ${e.message}`);
          });
          expect(read.refs ?? [], where).toEqual([]);
          expect(read.content ?? read.title, where).toBe(
            blockRending({
              data,
              clipNoteTemplate: clipTemplate,
              preferredDateFormat: 'MMM do, yyyy',
              time: new Date(),
            }),
          );
          // A `- x` line of the text starts no block when the file is read.
          if (!isDB) expect(await bulletLines(stamp), where).toBe(bullets + 1);
        }
      },
      240_000,
    );
  });

  // {{url}} in `[{{title}}]({{url}})`: the URL is written as one destination.
  test('writes a hostile URL as one link destination', async () => {
    const stamp = Date.now();
    await templates.setValue([template('[{{title}}]({{url}})')]);
    const before = await snapshot();
    const url = `https://example.com/dest-${stamp}/a b {{embed [[Dest Url Page]]}} #urltag\nSCHEDULED: <2030-01-01 Tue>`;
    await clipToLogseq({ url, title: `Hostile URL ${stamp}`, data: '', templateId: 'escape' });
    const uuid = await eventually(
      async () =>
        (
          (await api('logseq.Editor.getPageBlocksTree', [TEST_PAGE])).body ?? []
        ).find((b: any) => (b.content ?? b.title ?? '').includes(`Hostile URL ${stamp}`))
          ?.uuid,
      (v) => !!v,
    );
    const read = await expectNothingSpecial(uuid, before);
    expect(read.refs ?? []).toEqual([]);
    expect(read.content ?? read.title).toBe(
      `[Hostile URL ${stamp}](https://example.com/dest-${stamp}/a%20b%20{{embed%20[[Dest%20Url%20Page]]}}%20#urltag%0ASCHEDULED:%20%3C2030-01-01%20Tue%3E)`,
    );
  });

  // Recall searches the block text for host + pathname, so the characters that
  // `URL.pathname` keeps raw must stay raw in the destination.
  test('recalls a clip by a URL with brackets and parentheses in it', async () => {
    const service = await getLogseqService();
    const stamp = Date.now();
    await templates.setValue([template('[{{title}}]({{url}})')]);
    const before = await snapshot();
    // `new URL().href`: the page URL the browser gives, `{` and space encoded.
    const urls = [
      `https://example.com/r1-${stamp}/a[b]c/d?q=[[x]]&r={{y}}&s=((z))#[[w]]`,
      `https://example.com/r2-${stamp}/Foo_(bar)`,
      `https://example.com/r3-${stamp}/a(b`,
      `https://example.com/r4-${stamp}/a)b`,
      `https://example.com/r5-${stamp}/x{y}z/p q`,
      `https://example.com/r6-${stamp}/p?q=a(b)c(d&e=f)g#h(i`,
      `https://example.com/r7-${stamp}/[[page]]/{{macro}}/((ref))`,
    ].map((url) => new URL(url).href);
    for (const url of urls) {
      await clipToLogseq({ url, title: `Recall ${stamp}`, data: '', templateId: 'escape' });
    }
    const missing: string[] = [];
    for (const [i, url] of urls.entries()) {
      const target = new URL(url);
      const recall = async () =>
        (await service.urlSearch(target)).response?.blocks?.find((b: any) =>
          b.content?.includes(`r${i + 1}-${stamp}`),
        );
      if (!(await eventually(recall, (b) => !!b))) missing.push(url);
    }
    expect(missing).toEqual([]);
    await sleep(2500);
    expect(await pageNames()).toEqual(before.pages);
    expect(await tagNames()).toEqual(before.tags);
  }, 240_000);

  // The template, not the page, decides where the page text ends up, and only
  // the rendered text shows that (whitespace control, assign, capture,
  // filters). Each one gets page text that is live where it is not escaped.
  describe('hostile templates', () => {
    const templates_: string[] = [
      'Note: {%- if true -%}{%- endif -%}\n{{content}}',
      'Note:\n{{- content}}',
      '{% assign u = url %}x {{u}}\n{{title}}\n{{content}}',
      '{% capture c %}{{content}}{% endcapture %}> {{c}}',
      '{{ content | upcase }}\n{{ title | upcase }}',
      "{{ url | append: ' tail' }}\n{{ title }}\n{{ content }}",
      "{{ content | split: ' ' | join: ' ' }}",
      '{{ content | slice: 0, 80 }}',
      '{{ content | truncate: 60 }}',
      "{{ content | replace: 'a', 'b' }}",
      "{% for w in content | split: ' ' %}{{w}} {% endfor %}",
      "{{ content | remove: '\\\\' }}\n{{ content | url_decode }}\n{{ content | strip_html }}",
    ];

    test.each(templates_)(
      'writes page text as text (%j)',
      async (clipTemplate) => {
        await templates.setValue([template(clipTemplate)]);
        const stamp = Date.now();
        const data = `\`\`\`js\n[[Hostile Page A]] #hostag {{embed [[Hostile Embed A]]}}\nhostkey:: v\n\`\`\`\nTODO hosttask ${stamp}\n- hostdash\nend [[Hostile Page B]]`;
        const title = `[[Hostile Title Page]] #hosttitle ${stamp}`;
        const url = `https://example.com/host-${stamp}/[[Hostile Url Page]] #hosturl`;
        const before = await snapshot();
        const bullets = isDB ? 0 : await bulletLines('Escape ref target');

        await clipToLogseq({ url, title, data, templateId: 'escape' });

        const last = async () =>
          ((await api('logseq.Editor.getPageBlocksTree', [TEST_PAGE])).body ?? [])
            .at(-1);
        // Wait for the new block: the count goes up by one.
        await eventually(countBlocks, (n) => n === before.blocks + 1);
        const read = await expectNothingSpecial((await last()).uuid, before);
        expect(read.refs ?? []).toEqual([]);
        expect(read.content ?? read.title).toBe(
          blockRending({
            url,
            title,
            data,
            clipNoteTemplate: clipTemplate,
            preferredDateFormat: 'MMM do, yyyy',
            time: new Date(),
          }),
        );
        // A `- x` line of the text starts no block when the file is read.
        await sleep(1500);
        if (!isDB) {
          expect(await bulletLines('Escape ref target'), clipTemplate).toBe(bullets + 1);
        }
      },
      120_000,
    );
  });
});

const blockRendingForTest = (title: string, url: string, content: string) =>
  blockRending({
    title,
    url,
    data: content,
    clipNoteTemplate: '[{{title}}]({{url}})\n{{content}}',
    preferredDateFormat: 'MMM do, yyyy',
    time: new Date(),
  });

describe(`nesting the clipped content under the link (${variant})`, () => {
  type Node = { text: string; children: Node[] };

  const eventually = async <T>(fn: () => Promise<T>, ok: (v: T) => boolean) => {
    let value = await fn();
    for (let i = 0; i < 40 && !ok(value); i++) {
      await new Promise((r) => setTimeout(r, 500));
      value = await fn();
    }
    return value;
  };

  // A block as the page tree API returns it: text in `content` (file graph) or
  // `title` (DB graph), children nested.
  const toNode = (block: any): Node => ({
    text: String(block.content ?? block.title ?? ''),
    children: (block.children ?? []).map(toNode),
  });

  /** The root block of the page that mentions `marker`, with its children. */
  const readClip = async (marker: string): Promise<Node | undefined> => {
    const { body } = await api('logseq.Editor.getPageBlocksTree', [TEST_PAGE]);
    const root = (body as any[]).find((b) =>
      String(b.content ?? b.title ?? '').includes(marker),
    );
    return root && toNode(root);
  };

  const SELECTION = [
    'First paragraph of the clip.',
    'Second paragraph\nwith a wrapped line.',
    '*   item one\n    *   nested item\n*   item two',
    '```sh\n- not a bullet\n\necho "blank line above"\n```',
    '> a quote',
    '1.  step one\n2.  step two',
  ].join('\n\n');

  const clipWith = async (content: string, templateId: string, extra: object) => {
    const stamp = Date.now();
    const url = `https://example.com/nested-${stamp}`;
    const title = `Nested page ${stamp}`;
    await templates.setValue([
      {
        id: templateId,
        name: 'Nested',
        content,
        clipNoteLocation: 'customPage',
        clipNoteCustomPage: TEST_PAGE,
      },
    ]);
    await clipToLogseq({ url, title, templateId, ...extra } as any);
    return { stamp, url, title };
  };

  test('puts paragraphs, list items and code in blocks under the link', async () => {
    const nested = TEMPLATE_PRESETS.find((p) => p.id === 'nested-clip')!;
    const { stamp, url, title } = await clipWith(nested.content, 'nested', {
      data: SELECTION,
    });
    const link = `[${title}](${url})`;

    const clip = await eventually(
      () => readClip(`nested-${stamp}`),
      (node) => (node?.children.length ?? 0) >= 6,
    );
    expect(clip).toBeDefined();
    expect(clip!.text).toContain(link);
    const texts = (nodes: Node[]): unknown[] =>
      nodes.map((n) => (n.children.length ? [n.text, ...texts(n.children)] : n.text));
    expect(texts(clip!.children)).toEqual([
      'First paragraph of the clip.',
      'Second paragraph\nwith a wrapped line.',
      ['item one', 'nested item'],
      'item two',
      // A DB graph turns a fenced block into a code block: its text is the code.
      isDB
        ? '- not a bullet\n\necho "blank line above"'
        : '```sh\n- not a bullet\n\necho "blank line above"\n```',
      '> a quote',
      '1. step one',
      '2. step two',
    ]);
  });

  test('keeps a tag of the page as text in a child block', async () => {
    const nested = TEMPLATE_PRESETS.find((p) => p.id === 'nested-clip')!;
    const { stamp } = await clipWith(nested.content, 'nested-tag', {
      data: 'Tagged with #idea in the text.\n\nPlain second.',
    });
    const clip = await eventually(
      () => readClip(`nested-${stamp}`),
      (node) => (node?.children.length ?? 0) >= 2,
    );
    expect(clip!.children).toHaveLength(2);
    // Text from the page is literal: it makes no tag (see escapeForLogseq).
    expect(clip!.children[0].text).toBe('Tagged with \\#idea in the text.');
    expect(clip!.children[1].text).toBe('Plain second.');
  });

  test('clips a page without a selection as the link alone', async () => {
    const nested = TEMPLATE_PRESETS.find((p) => p.id === 'nested-clip')!;
    const { stamp } = await clipWith(nested.content, 'nested-page', { data: '' });
    const clip = await eventually(
      () => readClip(`nested-${stamp}`),
      (node) => node !== undefined,
    );
    expect(clip!.children).toEqual([]);
  });

  test('nests the selection under a task, and the task carries the status', async () => {
    const { stamp, url, title } = await clipWith(TASK_TEMPLATE.content, 'task', {
      data: 'Read this.\n\nThen this.',
    });
    const clip = await eventually(
      () => readClip(`nested-${stamp}`),
      (node) => (node?.children.length ?? 0) >= 2,
    );
    expect(clip!.children.map((c) => c.text)).toEqual(['Read this.', 'Then this.']);

    const service = await getLogseqService();
    const recall = async () => {
      const result = await service.urlSearch(new URL(url));
      return result.response?.blocks?.find((b: any) =>
        b.content?.includes(`nested-${stamp}`),
      );
    };
    const recalled = await eventually(recall, (b) => b?.marker === 'TODO');
    expect(recalled?.marker).toBe('TODO');
    expect(recalled.content).toContain(`[${title}](${url})`);
    if (isDB) {
      // A DB graph keeps the task in a property, never as `TODO ` in the text.
      expect(clip!.text).not.toMatch(/^TODO /);
    } else {
      expect(clip!.text.startsWith(`TODO [${title}](${url})`)).toBe(true);
    }
  });

  test('keeps property lines as text on a DB graph, as properties on a file graph', async () => {
    const reading = TEMPLATE_PRESETS.find((p) => p.id === 'reading-note')!;
    const { stamp, url } = await clipWith(reading.content, 'reading', {
      data: 'Quote.',
    });
    const clip = await eventually(
      () => readClip(`nested-${stamp}`),
      (node) => (node?.children.length ?? 0) >= 1,
    );
    expect(clip!.children.map((c) => c.text)).toEqual(['Quote.']);
    expect(clip!.text).toContain(`source:: ${url}`);
    expect(clip!.text).toMatch(/date:: \[\[.+\]\]/);
    if (!isDB) {
      const { body } = await api('logseq.Editor.getPageBlocksTree', [TEST_PAGE]);
      const root = (body as any[]).find((b) => b.content.includes(`nested-${stamp}`));
      expect(root.properties?.source).toContain(url);
    }
  });

  test.each([
    ['a #fragment', 'https://example.com/prop/a?x=1#frag'],
    ['a query', 'https://example.com/prop/a?a=1&b=2'],
    ['paired parentheses', 'https://example.com/prop/Foo_(bar)'],
    ['an unpaired (', 'https://example.com/prop/un(paired'],
    ['[x] in the path', 'https://example.com/prop/[x]/z'],
    ['a template tag in the query', 'https://example.com/prop/a?q={{x}}'],
  ])('writes a URL with %s as a property value that is that URL', async (_name, raw) => {
    const reading = TEMPLATE_PRESETS.find((p) => p.id === 'reading-note')!;
    const stamp = `${Date.now()}`;
    const href = new URL(`${raw}${raw.includes('?') ? '&' : '?'}s=${stamp}`).href;
    const title = `Nested prop ${stamp}`;
    // `{{x}}` in the query is written as it is in the URL, `%7B%7Bx%7D%7D`.
    const value = href.replace(/[{}]/g, (c) => (c === '{' ? '%7B' : '%7D'));
    const lower = (list: any[]) =>
      (list ?? []).map((p) => String(p.name ?? p.originalName ?? p.title).toLowerCase());
    const names = async () => [
      ...lower((await api('logseq.Editor.getAllPages')).body),
      ...(isDB ? lower((await api('logseq.Editor.getAllTags')).body) : []),
    ];
    const before = await names();

    await templates.setValue([
      {
        id: 'reading-url',
        name: 'Reading',
        content: reading.content,
        clipNoteLocation: 'customPage',
        clipNoteCustomPage: TEST_PAGE,
      },
    ]);
    await clipToLogseq({ url: href, title, templateId: 'reading-url', data: 'Quote.' });
    const clip = await eventually(
      () => readClip(`Nested prop ${stamp}`),
      (node) => (node?.children.length ?? 0) >= 1,
    );
    expect(clip).toBeDefined();
    // The property is the URL, with no backslash and no other change.
    expect(clip!.text.split('\n')).toContain(`source:: ${value}`);
    if (!isDB) {
      const { body } = await api('logseq.Editor.getPageBlocksTree', [TEST_PAGE]);
      const root = (body as any[]).find((b) => b.content.includes(title));
      expect(root.properties?.source).toBe(value);
    }

    // No page and no tag came out of the URL (the date property makes the
    // journal page, so look at the pieces of the URL only).
    await new Promise((r) => setTimeout(r, 1500));
    const created = (await names()).filter((n) => !before.includes(n));
    expect(created.filter((n) => /frag|bar|paired|\bx\b|a=1|prop/.test(n))).toEqual([]);

    // Recall finds the clip by its URL.
    const service = await getLogseqService();
    const found = await eventually(
      () => service.urlSearch(new URL(href)),
      (r: any) =>
        (r.response?.blocks ?? []).some((b: any) =>
          JSON.stringify(b).includes(stamp),
        ),
    );
    expect(
      ((found as any).response?.blocks ?? []).some((b: any) =>
        JSON.stringify(b).includes(stamp),
      ),
    ).toBe(true);
  });
});

describe(`a note with the clip (${variant})`, () => {
  type Node = { text: string; uuid?: string; children: Node[] };

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const eventually = async <T>(fn: () => Promise<T>, ok: (v: T) => boolean) => {
    let value = await fn();
    for (let i = 0; i < 40 && !ok(value); i++) {
      await sleep(500);
      value = await fn();
    }
    return value;
  };

  const toNode = (block: any): Node => ({
    text: String(block.content ?? block.title ?? ''),
    uuid: block.uuid,
    children: (block.children ?? []).map(toNode),
  });

  /** Every root block of the test page that mentions `marker`. */
  const readRoots = async (marker: string): Promise<Node[]> => {
    const { body } = await api('logseq.Editor.getPageBlocksTree', [TEST_PAGE]);
    return (body as any[])
      .filter((b) => String(b.content ?? b.title ?? '').includes(marker))
      .map(toNode);
  };

  /** The one clip of `marker`, once it has `children` children. */
  const readClip = async (marker: string, children: number) => {
    const roots = await eventually(
      () => readRoots(marker),
      (r) => r.length === 1 && r[0].children.length >= children,
    );
    expect(roots).toHaveLength(1);
    return roots[0];
  };

  /** The text of the block `uuid`, in any form a graph keeps it. */
  const blockTexts = async (uuid: string): Promise<string[]> => {
    const { body } = await api('logseq.Editor.getBlock', [uuid]);
    return [body?.content, body?.title, body?.fullTitle].filter(
      (t): t is string => typeof t === 'string',
    );
  };

  /** The lines of the clip of `marker` in the page file, a file graph only. */
  const fileLines = async (marker: string): Promise<string[]> => {
    const graph = (await api('logseq.App.getCurrentGraph')).body;
    const file = `${graph.path}/pages/${TEST_PAGE}.md`;
    const read = async () => (await import('node:fs')).readFileSync(file, 'utf8');
    await eventually(read, (t) => t.includes(marker));
    // Logseq writes late, and again.
    await sleep(3000);
    const lines = (await read()).split('\n');
    const start = lines.findIndex((l) => l.includes(marker));
    const next = lines.findIndex((l, i) => i > start && /^- /.test(l));
    return lines.slice(start, next === -1 ? undefined : next);
  };
  const bulletsIn = (lines: string[]) =>
    lines.filter((l) => /^\s*[-*+](\s|$)/.test(l)).length;

  const location = { clipNoteLocation: 'customPage', clipNoteCustomPage: TEST_PAGE };
  const OUTLINE = '- [{{title}}]({{url}})\n  - {{note}}\n  - {{content}}';
  const setTemplate = (content: string, id = 'noted') =>
    templates.setValue([{ id, name: 'Noted', content, ...location }]);
  const source = (stamp: number, extra: object = {}) => ({
    url: `https://example.com/note-${stamp}`,
    title: `Note page ${stamp}`,
    data: `The quote ${stamp}.`,
    ...extra,
  });

  test('a bullet that has only {{note}} is the note block, and the result names it', async () => {
    const stamp = Date.now();
    await setTemplate(OUTLINE);
    const note = `Idea about [[Note Link ${stamp}]] and #notetag${stamp}\nsecond line`;

    const result = await clipToLogseq({ ...source(stamp), templateId: 'noted', note });

    const clip = await readClip(`note-${stamp}`, 2);
    expect(clip.children.map((c) => c.text)).toEqual([
      isDB ? expect.stringContaining('second line') : note,
      `The quote ${stamp}.`,
    ]);
    expect(result.noteBlockUuid).toBe(clip.children[0].uuid);
    expect(result.rootUuid).toBe(clip.uuid);
    // The text the user typed, syntax live: not escaped.
    const texts = await blockTexts(result.noteBlockUuid!);
    expect(texts.some((t) => t.includes('\\['))).toBe(false);
    expect(texts.some((t) => t.includes(`Note Link ${stamp}`) || /\[\[[0-9a-f-]{36}\]\]/.test(t))).toBe(true);
  });

  test('a template without {{note}} gets the note as the last child, and the result names it', async () => {
    const stamp = Date.now();
    await templates.setValue([
      { id: 'plain', name: 'Plain', content: '#[[Clip]] [{{title}}]({{url}})\n{{content}}', ...location },
    ]);

    const result = await clipToLogseq({
      ...source(stamp),
      templateId: 'plain',
      note: 'my note',
    });

    const clip = await readClip(`note-${stamp}`, 1);
    expect(clip.text).toContain(`The quote ${stamp}.`);
    expect(clip.children.map((c) => c.text)).toEqual(['my note']);
    expect(result.noteBlockUuid).toBe(clip.children[0].uuid);
  });

  test('a note in an outline template without {{note}} goes after the other children', async () => {
    const stamp = Date.now();
    await setTemplate('- [{{title}}]({{url}})\n  - {{content}}', 'nested');

    const result = await clipToLogseq({ ...source(stamp), templateId: 'nested', note: 'last one' });

    const clip = await readClip(`note-${stamp}`, 2);
    expect(clip.children.map((c) => c.text)).toEqual([`The quote ${stamp}.`, 'last one']);
    expect(result.noteBlockUuid).toBe(clip.children[1].uuid);
  });

  test('an inline {{note}} is part of the text, no block of its own', async () => {
    const stamp = Date.now();
    await templates.setValue([
      { id: 'inline', name: 'Inline', content: '[{{title}}]({{url}})\nNote: {{note}}', ...location },
    ]);

    const result = await clipToLogseq({ ...source(stamp), templateId: 'inline', note: 'one\ntwo' });

    const clip = await readClip(`note-${stamp}`, 0);
    expect(clip.children).toEqual([]);
    expect(clip.text).toContain('Note: one\ntwo');
    expect(result.noteBlockUuid).toBeUndefined();
  });

  test('an empty note leaves the built-in Clip byte for byte what it was', async () => {
    const stamp = Date.now();
    await templates.setValue([
      { ...BUILT_IN_TEMPLATES[0], ...location },
    ]);
    const base = { url: `https://example.com/note-${stamp}`, title: `Note page ${stamp}`, data: `Same text ${stamp}.` };

    const without = await clipToLogseq(base);
    const empty = await clipToLogseq({ ...base, note: '' });
    const blank = await clipToLogseq({ ...base, note: ' \n ' });

    const roots = await eventually(
      () => readRoots(`note-${stamp}`),
      (r) => r.length === 3,
    );
    expect(roots).toHaveLength(3);
    expect(new Set(roots.map((r) => r.text)).size).toBe(1);
    expect(roots.every((r) => r.children.length === 0)).toBe(true);
    expect(roots[0].text).toBe(
      isDB
        ? roots[0].text
        : `#[[Clip]] [${base.title}](${base.url})\nSame text ${stamp}.`,
    );
    for (const result of [without, empty, blank]) {
      expect(result.noteBlockUuid).toBeUndefined();
    }
  });

  test('an empty note takes the note bullet out of an outline template, with its subtree', async () => {
    const stamp = Date.now();
    await setTemplate('- [{{title}}]({{url}})\n  - {{note}}\n    - about it\n  - {{content}}');

    const result = await clipToLogseq({ ...source(stamp), templateId: 'noted', note: '' });

    const clip = await readClip(`note-${stamp}`, 1);
    expect(clip.children.map((c) => c.text)).toEqual([`The quote ${stamp}.`]);
    expect(result.noteBlockUuid).toBeUndefined();
  });

  describe('what would change the tree is neutralised', () => {
    test('a note with bullet-like lines stays in its one block', async () => {
      const stamp = Date.now();
      await setTemplate(OUTLINE);
      const note = 'first\n- dash\n* star\n+ plus\n  - nested dash\n-\n1. numbered';

      const result = await clipToLogseq({ ...source(stamp), templateId: 'noted', note });

      const clip = await readClip(`note-${stamp}`, 2);
      expect(clip.children).toHaveLength(2);
      expect(clip.children[0].children).toEqual([]);
      expect(result.noteBlockUuid).toBe(clip.children[0].uuid);
      expect(clip.children[0].text).toContain('first\n\\- dash\n\\* star\n\\+ plus\n  \\- nested dash\n\\-\n1. numbered');
      if (!isDB) {
        // What a file graph would read again: a bullet line starts a block.
        // The root, the note and the quote, and nothing from the note.
        expect(bulletsIn(await fileLines(`note-${stamp}`))).toBe(3);
      }
    });

    test('a fence mark with no mate does not swallow the lines of the template', async () => {
      const stamp = Date.now();
      await setTemplate('- [{{title}}]({{url}})\n  - {{note}}\n  - after [[Fence Page]] {{content}}');

      await clipToLogseq({
        ...source(stamp),
        templateId: 'noted',
        note: 'before\n```js\nconst x = 1',
      });

      const clip = await readClip(`note-${stamp}`, 2);
      expect(clip.children).toHaveLength(2);
      expect(clip.children[1].text).toContain('after');
      expect(clip.children[0].text).toContain('\\```js');
      if (!isDB) expect(bulletsIn(await fileLines(`note-${stamp}`))).toBe(3);
    });

    test('a bullet line inside a fence the note closes is escaped, not a block', async () => {
      const stamp = Date.now();
      await setTemplate(OUTLINE);

      await clipToLogseq({
        ...source(stamp),
        templateId: 'noted',
        note: '```sh\n- not a bullet\necho hi\n```',
      });

      const clip = await readClip(`note-${stamp}`, 2);
      expect(clip.children).toHaveLength(2);
      expect(clip.children[0].children).toEqual([]);
      expect(clip.children[0].text).toContain('not a bullet');
      if (!isDB) expect(bulletsIn(await fileLines(`note-${stamp}`))).toBe(3);
    });
  });
});
