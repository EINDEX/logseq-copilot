/**
 * Recall of whole clips and the template tag, against a real Logseq (both
 * graph types). The clips are written on the fixture page `Copilot Test Page`.
 */
import { beforeAll, describe, expect, inject, test } from 'vitest';
import { fakeBrowser } from 'wxt/testing';
import {
  logseqAuthTokenItem,
  logseqHostNameItem,
  logseqPortItem,
  templates,
} from '@/utils/storage';
import { getLogseqService } from '@/entrypoints/background/logseq/tool';
import { clipToLogseq } from '@/entrypoints/background/clip';
import { MAX_CLIP_DEPTH } from '@/entrypoints/background/logseq/clip-recall';
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

const eventually = async <T>(fn: () => Promise<T>, ok: (v: T) => boolean) => {
  let value = await fn();
  for (let i = 0; i < 40 && !ok(value); i++) {
    await new Promise((r) => setTimeout(r, 500));
    value = await fn();
  }
  return value;
};

type Spec = [text: string, ...children: Spec[]];

/** Writes `spec` as a top-level block of the test page, returns its root uuid. */
const write = async (service: LogseqServiceInterface, spec: Spec) => {
  const root = await service.client.appendBlock(TEST_PAGE, spec[0]);
  // The first child goes under the parent, each next one after the one before.
  const addInOrder = async (parent: string, kids: Spec[]) => {
    let previous: string | undefined;
    for (const kid of kids) {
      const { body } = await api('logseq.Editor.insertBlock', [
        previous ?? parent,
        kid[0],
        { sibling: previous !== undefined },
      ]);
      await addInOrder(body.uuid, kid.slice(1) as Spec[]);
      previous = body.uuid;
    }
  };
  await addInOrder(root.uuid, spec.slice(1) as Spec[]);
  return root.uuid as string;
};

const text = (block: any) => String(block.content ?? block.title ?? '');
const shape = (block: any): unknown =>
  block.children?.length
    ? [text(block).replace(/\s+/g, ' ') + (block.matched ? ' *' : ''), ...block.children.map(shape)]
    : text(block) + (block.matched ? ' *' : '');

beforeAll(async () => {
  fakeBrowser.reset();
  const apiUrl = new URL(inject('logseqApi'));
  await logseqHostNameItem.setValue(apiUrl.hostname);
  await logseqPortItem.setValue(Number(apiUrl.port));
  await logseqAuthTokenItem.setValue(inject('logseqToken'));
});

describe(`recalling whole clips (${variant})`, () => {
  let service: LogseqServiceInterface;
  beforeAll(async () => {
    service = await getLogseqService();
  });

  const recall = async (url: string, ok: (blocks: any[]) => boolean) => {
    const result: any = await eventually<any>(
      () => service.urlSearch(new URL(url)),
      (r: any) => ok(r.response?.blocks ?? []),
    );
    return result.response.blocks as any[];
  };
  const entryOf = (blocks: any[], marker: string) =>
    blocks.find((b) => JSON.stringify(shape(b)).includes(marker));

  test('a comment above the highlight: one entry, the whole clip', async () => {
    const stamp = Date.now();
    const url = `https://example.com/recall-comment-${stamp}`;
    await write(service, [
      `my comment ${stamp}`,
      [`highlight ${url}`],
      [`second note ${stamp}`],
    ]);
    const blocks = await recall(url, (bs) => !!entryOf(bs, `recall-comment-${stamp}`)?.children?.length);
    const mine = blocks.filter((b) => JSON.stringify(shape(b)).includes(`${stamp}`));
    expect(mine).toHaveLength(1);
    expect(text(mine[0])).toContain(`my comment ${stamp}`);
    expect(mine[0].children.map((c: any) => text(c))).toEqual([
      `highlight ${url}`,
      `second note ${stamp}`,
    ]);
    expect(mine[0].children[0].matched).toBe(true);
    expect(mine[0].children[1].matched).toBeUndefined();
  });

  test('siblings under a link parent: one entry, both matched', async () => {
    const stamp = Date.now();
    const url = `https://example.com/recall-siblings-${stamp}`;
    await write(service, [
      `[Title ${stamp}](https://example.com/other-${stamp})`,
      [`highlight ${url}`],
      [`comment ${url}`],
      [`unrelated ${stamp}`],
    ]);
    const blocks = await recall(url, (bs) => entryOf(bs, `recall-siblings-${stamp}`)?.children?.length === 3);
    const mine = blocks.filter((b) => JSON.stringify(shape(b)).includes(`${stamp}`));
    expect(mine).toHaveLength(1);
    expect(mine[0].children.map((c: any) => !!c.matched)).toEqual([true, true, false]);
  });

  test('the URL only in a child: the clip comes with its root', async () => {
    const stamp = Date.now();
    const url = `https://example.com/recall-child-${stamp}`;
    await write(service, [`Reading ${stamp}`, [`quote`, [`source ${url}`]]]);
    const blocks = await recall(url, (bs) => !!entryOf(bs, `recall-child-${stamp}`)?.children?.length);
    const mine = blocks.filter((b) => JSON.stringify(shape(b)).includes(`${stamp}`));
    expect(mine).toHaveLength(1);
    expect(text(mine[0])).toContain(`Reading ${stamp}`);
    expect(shape(mine[0])).toEqual([
      `Reading ${stamp}`,
      ['quote', `source ${url} *`],
    ]);
  });

  test(`a URL ${MAX_CLIP_DEPTH + 2} levels deep stays a single block`, async () => {
    const stamp = Date.now();
    const url = `https://example.com/recall-deep-${stamp}`;
    await write(service, [
      `l1 ${stamp}`,
      [`l2 ${stamp}`, [`l3 ${stamp}`, [`l4 ${stamp}`, [`l5 ${url}`]]]],
    ]);
    const blocks = await recall(url, (bs) => !!entryOf(bs, `recall-deep-${stamp}`));
    const hits = blocks.filter((b) => JSON.stringify(shape(b)).includes(`${stamp}`));
    expect(hits).toHaveLength(1);
    expect(text(hits[0])).toContain(`l5 ${url}`);
    expect(hits[0].children).toBeUndefined();
  });
});

describe(`the template tag (${variant})`, () => {
  let service: LogseqServiceInterface;
  beforeAll(async () => {
    service = await getLogseqService();
  });

  const clipTagged = async (name: string) => {
    const stamp = Date.now();
    await templates.setValue([
      {
        id: 'tagged',
        name: 'Tagged',
        content: '[{{title}}]({{url}})',
        clipNoteLocation: 'customPage',
        clipNoteCustomPage: TEST_PAGE,
        tag: { name },
      },
    ]);
    const result = await clipToLogseq({
      url: `https://example.com/tag-${stamp}`,
      title: `Tag page ${stamp}`,
      data: '',
      templateId: 'tagged',
    } as any);
    return { stamp, ...result };
  };

  test('lists tags without the built-in ones', async () => {
    const tags = await service.listTags();
    expect(Array.isArray(tags)).toBe(true);
    for (const tag of tags) expect(tag.name).toBeTruthy();
    if (isDB) expect(tags.map((t) => t.name)).not.toContain('Task');
  });

  if (isDB) {
    test('tags the root with a class, once, and the text stays clean', async () => {
      const name = `Reading${Date.now()}`;
      const first = await clipTagged(name);
      const second = await clipTagged(name);
      const read = async (uuid: string) =>
        (await api('logseq.Editor.getBlock', [uuid])).body;
      const tagTitles = async (uuid: string) => {
        const block = await eventually(
          () => read(uuid),
          (b) => (b?.tags ?? []).length > 0,
        );
        return (block.tags ?? []).map((t: any) => t.title ?? t.name);
      };
      expect(await tagTitles(first.rootUuid)).toContain(name);
      expect(await tagTitles(second.rootUuid)).toContain(name);
      expect(text(await read(first.rootUuid))).not.toContain(`#${name}`);

      const all = (await api('logseq.Editor.getAllTags')).body as any[];
      const same = all.filter((t) => String(t.title ?? t.name).toLowerCase() === name.toLowerCase());
      expect(same).toHaveLength(1);
      expect((await service.listTags()).map((t) => t.name)).toContain(name);
    });
  } else {
    test('puts #[[name]] in the first line of the root, once', async () => {
      const name = `Reading ${Date.now()}`;
      const { rootUuid } = await clipTagged(name);
      const block = await eventually(
        async () => (await api('logseq.Editor.getBlock', [rootUuid])).body,
        (b) => !!b?.content,
      );
      expect(block.content.split('\n')[0]).toContain(`#[[${name}]]`);
      expect(block.content.split(`#[[${name}]]`)).toHaveLength(2);
    });
  }
});
