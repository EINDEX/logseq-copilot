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
import { TASK_TEMPLATE } from '@/utils/default-templates';
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
  /** The block lines of the test page on disk (a file graph only). */
  const bulletLines = async (stamp: string) => {
    const graph = (await api('logseq.App.getCurrentGraph')).body;
    const file = `${graph.path}/pages/${TEST_PAGE}.md`;
    const text = await eventually(
      async () => (await import('node:fs')).readFileSync(file, 'utf8'),
      (t) => t.includes(stamp),
    );
    return text.split('\n').filter((l) => /^\t*- /.test(l)).length;
  };

  const template = (content: string) => ({
    id: 'escape',
    name: 'Escape',
    content,
    clipNoteLocation: 'customPage' as const,
    clipNoteCustomPage: TEST_PAGE,
  });

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
    allowed: { pages?: string[]; tags?: string[] } = {},
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
    expect(lower(read.tags ?? read[':block/tags'] ?? [])).toEqual(allowed.tags ?? []);
    return read;
  };

  const snapshot = async () => ({
    pages: await pageNames(),
    tags: await tagNames(),
    blocks: await countBlocks(),
  });

  test('clips page text with every kind of syntax as plain text', async () => {
    const service = await getLogseqService();
    const stamp = Date.now();
    const target = (await api('logseq.Editor.appendBlockInPage', [
      TEST_PAGE,
      `Escape ref target ${stamp}`,
    ])).body;
    const content = pageText(target.uuid);
    const url = `https://example.com/escape-${stamp}/Foo_(bar)`;
    const title = `Foo [beta] #release ${stamp}`;
    await templates.setValue([template('[{{title}}]({{url}})\n{{content}}')]);
    const before = await snapshot();
    const bullets = isDB ? 0 : await bulletLines('Escape ref target');

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
  });

  test('keeps the tag of the template and escapes the tags of the page', async () => {
    const stamp = Date.now();
    await templates.setValue([template('#[[Clip]] [{{title}}]({{url}})\n{{content}}')]);
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
      // A DB graph makes the tag of the template a tag.
      tags: isDB ? ['clip'] : [],
    });
    expect(read.content ?? read.title).toContain(
      `[News \\#news ${stamp}](https://example.com/escape-tag-${stamp})`,
    );
  });

  test('keeps the first line of the block from being a task, property or block', async () => {
    const stamp = Date.now();
    // The title is not in a link here: it can start the block.
    await templates.setValue([template('{{title}}\n{{content}}')]);
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
