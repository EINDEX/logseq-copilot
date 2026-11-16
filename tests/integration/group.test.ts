/**
 * Grouping the clips of one web page under one block (#37), against a real
 * Logseq app, for both graph types. Clips go to the fixture page, never to
 * today's journal: a file graph re-reads a journal file it has just created,
 * which can undo later edits.
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

const variant = inject('logseqVariant');
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
  return await resp.json().catch(() => null);
};

type Node = { text: string; children: Node[]; raw: any };
const toNode = (block: any): Node => ({
  text: String(block.content ?? block.title ?? ''),
  children: (block.children ?? []).map(toNode),
  raw: block,
});

const eventually = async <T>(fn: () => Promise<T>, ok: (v: T) => boolean) => {
  let value = await fn();
  for (let i = 0; i < 40 && !ok(value); i++) {
    await new Promise((r) => setTimeout(r, 500));
    value = await fn();
  }
  return value;
};

/** The top-level blocks of the test page that mention `marker`. */
const readTop = async (marker: string): Promise<Node[]> => {
  const body = await api('logseq.Editor.getPageBlocksTree', [TEST_PAGE]);
  return (body as any[]).filter((b) => toNode(b).text.includes(marker)).map(toNode);
};
const shape = (node: Node): unknown =>
  node.children.length ? [node.text, ...node.children.map(shape)] : node.text;

const location = { clipNoteLocation: 'customPage', clipNoteCustomPage: TEST_PAGE };
const CLIP = {
  id: 'g-clip',
  name: 'Grouped clip',
  content: '- #[[Clip]] [{{title}}]({{url}})\n  - {{content}}',
  ...location,
};
const TASK = {
  id: 'g-task',
  name: 'Grouped task',
  content: '- TODO [{{title}}]({{url}})\n  - {{content}}',
  ...location,
};
const BARE = {
  id: 'g-bare',
  name: 'Bare URL',
  content: '- Link: {{url}}\n  - {{content}}',
  ...location,
};
const FLAT = {
  id: 'g-flat',
  name: 'Flat',
  content: '#[[Clip]] [{{title}}]({{url}})\n{{content}}',
  ...location,
};

beforeAll(async () => {
  fakeBrowser.reset();
  const apiUrl = new URL(inject('logseqApi'));
  await logseqHostNameItem.setValue(apiUrl.hostname);
  await logseqPortItem.setValue(Number(apiUrl.port));
  await logseqAuthTokenItem.setValue(inject('logseqToken'));
  await templates.setValue([CLIP, TASK, FLAT, BARE]);
});

describe(`grouping clips of one page (${variant})`, () => {
  const source = (stamp: number, data: string, extra = '') => ({
    url: `https://Example.com/group-${stamp}/${extra}`,
    title: `Group page ${stamp}`,
    data,
  });

  test('second and third clips of the same page add one node each under the first root', async () => {
    const stamp = Date.now();
    const marker = `group-${stamp}`;
    const first = await clipToLogseq({ ...source(stamp, 'First'), templateId: 'g-clip' });
    expect(first.added).toBe(true);
    await eventually(() => readTop(marker), (r) => (r[0]?.children.length ?? 0) >= 1);

    // Another hash and tracking parameters: the same page.
    const second = await clipToLogseq({
      url: `http://example.com/group-${stamp}?utm_source=x#part`,
      title: `Group page ${stamp}`,
      data: 'Second',
      templateId: 'g-clip',
    });
    expect(second.added).toBe(true);
    const afterSecond = await eventually(() => readTop(marker), (r) => (r[0]?.children.length ?? 0) >= 2);
    expect(afterSecond).toHaveLength(1);
    expect(afterSecond[0].children.map((c) => c.text)).toEqual(['First', 'Second']);

    // A multi-paragraph selection is still one node; the rest goes under it.
    await clipToLogseq({
      ...source(stamp, 'Third\n\nFourth\n\n*   item five'),
      templateId: 'g-clip',
    });
    const afterThird = await eventually(
      () => readTop(marker),
      (r) => (r[0]?.children.length ?? 0) >= 3 && (r[0].children[2]?.children.length ?? 0) >= 2,
    );
    expect(afterThird).toHaveLength(1);
    expect(afterThird[0].children.map(shape)).toEqual([
      'First',
      'Second',
      ['Third', 'Fourth', 'item five'],
    ]);
  });

  test.each([
    ['a #fragment', (stamp: number) => `https://example.com/group-${stamp}/a#part`],
    ['parentheses', (stamp: number) => `https://example.com/group-${stamp}/Foo_(bar)`],
    [
      'parentheses and a #fragment',
      (stamp: number) => `https://example.com/group-${stamp}/Foo_(bar)?x=1#part`,
    ],
  ])('a stored link with %s groups the next clip of the page', async (_name, makeUrl) => {
    for (const templateId of ['g-clip', 'g-bare']) {
      const stamp = Date.now();
      const marker = `group-${stamp}`;
      const url = makeUrl(stamp);
      // The title has what the escaping changes: `[1]` and `#tag`.
      const src = { url, title: `Ref[1] #tag ${marker}`, templateId };
      await clipToLogseq({ ...src, data: 'First' });
      await eventually(() => readTop(marker), (r) => (r[0]?.children.length ?? 0) >= 1);
      await clipToLogseq({ ...src, data: 'Second' });
      const roots = await eventually(
        () => readTop(marker),
        (r) => (r[0]?.children.length ?? 0) >= 2,
      );
      expect(roots, `${templateId} ${url}`).toHaveLength(1);
      expect(roots[0].children.map((c) => c.text)).toEqual(['First', 'Second']);
    }
  });

  test('a Task clip of the same page makes its own root, and groups with tasks only', async () => {
    const stamp = Date.now();
    const marker = `group-${stamp}`;
    await clipToLogseq({ ...source(stamp, 'Note'), templateId: 'g-clip' });
    await eventually(() => readTop(marker), (r) => r.length >= 1);
    await clipToLogseq({ ...source(stamp, 'Todo one'), templateId: 'g-task' });
    await eventually(() => readTop(marker), (r) => r.length >= 2);
    await clipToLogseq({ ...source(stamp, 'Todo two'), templateId: 'g-task' });
    const roots = await eventually(
      () => readTop(marker),
      (r) => r.length === 2 && (r[1]?.children.length ?? 0) >= 2,
    );
    expect(roots).toHaveLength(2);
    expect(roots[0].text).not.toMatch(/TODO/);
    expect(roots[0].children.map((c) => c.text)).toEqual(['Note']);
    expect(roots[1].children.map((c) => c.text)).toEqual(['Todo one', 'Todo two']);
  });

  test('a flat template writes a new top-level block every time', async () => {
    const stamp = Date.now();
    const marker = `group-${stamp}`;
    await clipToLogseq({ ...source(stamp, 'One'), templateId: 'g-flat' });
    await clipToLogseq({ ...source(stamp, 'Two'), templateId: 'g-flat' });
    const roots = await eventually(() => readTop(marker), (r) => r.length >= 2);
    expect(roots).toHaveLength(2);
    expect(roots.every((r) => r.children.length === 0)).toBe(true);
  });

  test('two clips at once make one root', async () => {
    const stamp = Date.now();
    const marker = `group-${stamp}`;
    await Promise.all([
      clipToLogseq({ ...source(stamp, 'A'), templateId: 'g-clip' }),
      clipToLogseq({ ...source(stamp, 'B'), templateId: 'g-clip' }),
    ]);
    const roots = await eventually(() => readTop(marker), (r) => (r[0]?.children.length ?? 0) >= 2);
    expect(roots).toHaveLength(1);
    expect(roots[0].children).toHaveLength(2);
  });

  test('a page clip with nothing to add writes nothing and names the existing root', async () => {
    const stamp = Date.now();
    const marker = `group-${stamp}`;
    const first = await clipToLogseq({ ...source(stamp, 'Kept'), templateId: 'g-clip' });
    await eventually(() => readTop(marker), (r) => (r[0]?.children.length ?? 0) >= 1);
    const second = await clipToLogseq({ ...source(stamp, ''), templateId: 'g-clip' });
    expect(second).toMatchObject({ added: false, rootUuid: first.rootUuid });
    expect((await readTop(marker))[0].children).toHaveLength(1);
  });

  test('urlSearch returns the grouped clip as one tree', async () => {
    const stamp = Date.now();
    const marker = `group-${stamp}`;
    const src = { ...source(stamp, 'Alpha'), url: `https://example.com/group-${stamp}` };
    await clipToLogseq({ ...src, templateId: 'g-clip' });
    await clipToLogseq({ ...src, data: 'Beta', templateId: 'g-clip' });
    await eventually(() => readTop(marker), (r) => (r[0]?.children.length ?? 0) >= 2);
    const service = await getLogseqService();
    const blocks = await eventually(
      async () =>
        (await service.urlSearch(new URL(src.url))).response?.blocks?.filter((b: any) =>
          String(b.content).includes(marker),
        ) ?? [],
      (b) => b.length >= 1,
    );
    expect(blocks).toHaveLength(1);
    const kids = (blocks[0].children ?? []).map((c: any) => String(c.content));
    expect(kids).toEqual(['Alpha', 'Beta']);
  });

  test('a note without {{note}} in the template goes under the node this clip added', async () => {
    const stamp = Date.now();
    const marker = `group-${stamp}`;
    await clipToLogseq({ ...source(stamp, 'First'), templateId: 'g-clip' });
    await eventually(() => readTop(marker), (r) => (r[0]?.children.length ?? 0) >= 1);

    const second = await clipToLogseq({
      ...source(stamp, 'Second'),
      templateId: 'g-clip',
      note: `a note ${stamp}`,
    });
    expect(second.noteBlockUuid).toBeTruthy();
    const roots = await eventually(
      () => readTop(marker),
      (r) => (r[0]?.children.length ?? 0) >= 2 && (r[0]?.children[1]?.children.length ?? 0) >= 1,
    );
    expect(roots).toHaveLength(1);
    expect(roots[0].children.map(shape)).toEqual(['First', ['Second', `a note ${stamp}`]]);
    expect(roots[0].children[1].raw.uuid).toBe(second.rootUuid);
  });

  test('a {{note}} bullet of the template is the node, reported as the note block', async () => {
    const stamp = Date.now();
    const marker = `group-${stamp}`;
    await templates.setValue([
      CLIP,
      { ...CLIP, id: 'g-noted', content: '- #[[Clip]] [{{title}}]({{url}})\n  - {{note}}\n  - {{content}}' },
    ]);
    await clipToLogseq({ ...source(stamp, 'First'), templateId: 'g-clip' });
    await eventually(() => readTop(marker), (r) => (r[0]?.children.length ?? 0) >= 1);
    const second = await clipToLogseq({
      ...source(stamp, 'Second'),
      templateId: 'g-noted',
      note: `bullet note ${stamp}`,
    });
    const roots = await eventually(
      () => readTop(marker),
      (r) => (r[0]?.children.length ?? 0) >= 2,
    );
    expect(roots[0].children.map((c) => c.text)).toEqual(['First', `bullet note ${stamp}`]);
    expect(second.noteBlockUuid).toBe(second.rootUuid);
  });
});
