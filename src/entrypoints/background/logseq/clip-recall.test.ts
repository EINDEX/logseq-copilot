import { describe, expect, test, vi } from 'vitest';
import type { LogseqBlockType, LogseqPageIdenity } from '@/types/logseqBlock';
import {
  MAX_CLIMBED_HITS,
  MAX_CLIP_DEPTH,
  MAX_CLIP_ROOTS,
  MAX_TREE_BLOCKS,
  expandClips,
  type ClipRecallDeps,
} from './clip-recall';

const PAGE: LogseqPageIdenity = { id: 1, uuid: 'page', name: 'page', originalName: 'Page' };

/** A block of the fake graph: its text and its children. */
type Spec = [text: string, ...children: Spec[]];

interface Fake {
  deps: ClipRecallDeps;
  getBlock: ReturnType<typeof vi.fn>;
  getTree: ReturnType<typeof vi.fn>;
  hit: (text: string) => LogseqBlockType;
  /** The block with this text, as the search would return it. */
  raw: (text: string) => any;
}

/** A page of `tops` (top-level specs), ids and uuids made from the texts. */
const graph = (tops: Spec[]): Fake => {
  const byText = new Map<string, any>();
  const byRef = new Map<string | number, any>();
  let id = 10;
  const make = ([text, ...kids]: Spec, parent: any): any => {
    const block: any = {
      uuid: `u-${text}`,
      id: id++,
      content: text,
      parent: { id: parent ? parent.id : PAGE.id },
      page: { id: PAGE.id },
      children: [],
    };
    byText.set(text, block);
    byRef.set(block.uuid, block);
    byRef.set(block.id, block);
    block.children = kids.map((kid) => make(kid, block));
    return block;
  };
  tops.forEach((top) => make(top, null));

  const plain = (block: any) => ({
    ...block,
    children: block.children.map((child: any) => [
      'uuid',
      child.uuid,
    ]),
  });
  const getBlock = vi.fn(async (ref: string | number) => {
    const block = byRef.get(ref);
    return block ? plain(block) : null;
  });
  const getTree = vi.fn(async (uuid: string) => {
    const nested = (block: any): any => ({
      ...block,
      children: block.children.map(nested),
    });
    const block = byRef.get(uuid);
    return block ? nested(block) : null;
  });
  const deps: ClipRecallDeps = {
    getBlock,
    getTree,
    prepare: async (block, page) =>
      ({ ...block, page, html: `<p>${block.content}</p>`, children: undefined }) as any,
  };
  const raw = (text: string) => byText.get(text);
  const hit = (text: string): LogseqBlockType => ({
    ...plain(raw(text)),
    page: PAGE,
    html: `<p>${text}</p>`,
    format: 'markdown',
    marker: '',
    priority: '',
  });
  return { deps, getBlock, getTree, hit, raw };
};

const shape = (block: LogseqBlockType): unknown =>
  block.children
    ? [block.content + (block.matched ? '*' : ''), ...block.children.map(shape)]
    : block.content;

const run = (fake: Fake, hits: string[], pageHits = hits.length) =>
  expandClips(hits.map(fake.hit), pageHits, fake.deps);

describe('expandClips', () => {
  test('the depth limit is 3', () => {
    expect(MAX_CLIP_DEPTH).toBe(3);
  });

  test('a hit on the root shows the root with its subtree', async () => {
    const fake = graph([['link', ['quote'], ['comment', ['more']]]]);
    const { blocks } = await run(fake, ['link']);
    expect(blocks.map(shape)).toEqual([
      ['link*', ['quote'], ['comment', ['more']]],
    ]);
  });

  test('a comment above the highlight: the URL in the child recalls the parent', async () => {
    const fake = graph([['my comment', ['highlight https://e.com/a']]]);
    const { blocks } = await run(fake, ['highlight https://e.com/a']);
    expect(blocks.map(shape)).toEqual([['my comment', ['highlight https://e.com/a*']]]);
    expect(blocks[0].content).toBe('my comment');
  });

  test('a highlight and a comment as siblings under a link: one entry, both matched', async () => {
    const fake = graph([['link', ['highlight url'], ['comment url'], ['other']]]);
    const { blocks, count } = await run(fake, ['highlight url', 'comment url']);
    expect(blocks.map(shape)).toEqual([
      ['link', ['highlight url*'], ['comment url*'], ['other']],
    ]);
    expect(count).toBe(1);
  });

  test('the URL only in a grandchild (depth 3) still recalls the whole clip', async () => {
    const fake = graph([['top', ['mid', ['leaf url']]]]);
    const { blocks } = await run(fake, ['leaf url']);
    expect(blocks.map(shape)).toEqual([['top', ['mid', ['leaf url*']]]]);
  });

  test('a hit deeper than the limit stays a single block', async () => {
    const fake = graph([['a', ['b', ['c', ['d', ['e url']]]]]]);
    const { blocks } = await run(fake, ['d', 'e url']);
    expect(blocks.map((b) => b.content)).toEqual(['d', 'e url']);
    expect(blocks.every((b) => b.children === undefined)).toBe(true);
    // No tree was read for it: only the parents up to the limit are tried.
    expect(fake.getTree).not.toHaveBeenCalled();
    expect(fake.getBlock.mock.calls.length).toBeLessThanOrEqual(2 * 2);
  });

  test('a hit at the limit merges, one level below it does not', async () => {
    const fake = graph([['a', ['b', ['c', ['d']]]]]);
    expect((await run(fake, ['c'])).blocks.map(shape)).toEqual([
      ['a', ['b', ['c*', ['d']]]],
    ]);
    expect((await run(fake, ['d'])).blocks.map(shape)).toEqual(['d']);
  });

  test('collapses hits under one root into the first hit’s place', async () => {
    const fake = graph([
      ['A', ['a1'], ['a2']],
      ['B', ['b1']],
      ['C'],
    ]);
    const { blocks } = await run(fake, ['a2', 'b1', 'a1', 'C']);
    expect(blocks.map((b) => b.content)).toEqual(['A', 'B', 'C']);
    expect(shape(blocks[0])).toEqual(['A', ['a1*'], ['a2*']]);
  });

  test('counts the entries that have a hit for the page itself', async () => {
    const fake = graph([['A', ['a1']], ['B', ['b1']], ['C', ['c1']]]);
    // a1 and b1 are for the page, c1 for a parent path; a1 also under A.
    const { blocks, count } = await run(fake, ['a1', 'b1', 'c1'], 2);
    expect(blocks).toHaveLength(3);
    expect(count).toBe(2);
    const merged = await run(fake, ['a1', 'c1', 'A'], 1);
    expect(merged.blocks.map((b) => b.content)).toEqual(['A', 'C']);
    expect(merged.count).toBe(1);
  });

  test('asks for every parent once, however many hits share it', async () => {
    const fake = graph([['top', ['mid', ['x'], ['y'], ['z']]]]);
    await run(fake, ['x', 'y', 'z']);
    const refs = fake.getBlock.mock.calls.map(([ref]) => ref);
    expect([...refs].sort()).toEqual([10, 11]);
    expect(fake.getTree).toHaveBeenCalledTimes(1);
  });

  test('expands at most MAX_CLIP_ROOTS roots, the others stay single blocks', async () => {
    const names = Array.from({ length: MAX_CLIP_ROOTS + 3 }, (_, i) => `R${i}`);
    const fake = graph(names.map((name): Spec => [name, [`${name}-child`]]));
    const { blocks } = await run(fake, names.map((name) => `${name}-child`));
    expect(fake.getTree).toHaveBeenCalledTimes(MAX_CLIP_ROOTS);
    expect(blocks).toHaveLength(MAX_CLIP_ROOTS + 3);
    expect(blocks.slice(0, MAX_CLIP_ROOTS).every((b) => b.children)).toBe(true);
    expect(blocks.slice(MAX_CLIP_ROOTS).map((b) => b.content)).toEqual([
      'R10-child',
      'R11-child',
      'R12-child',
    ]);
  });

  test('does not follow up more than MAX_CLIMBED_HITS hits', async () => {
    const names = Array.from({ length: MAX_CLIMBED_HITS + 5 }, (_, i) => `H${i}`);
    const fake = graph(names.map((name): Spec => [name, [`${name}-c`]]));
    await run(fake, names.map((name) => `${name}-c`));
    expect(fake.getBlock).toHaveBeenCalledTimes(MAX_CLIMBED_HITS);
  });

  test('reads at most MAX_TREE_BLOCKS blocks of a long clip', async () => {
    const kids: Spec[] = Array.from({ length: 100 }, (_, i) => [`k${i}`]);
    const fake = graph([['big', ...kids]]);
    const { blocks } = await run(fake, ['big']);
    expect(blocks[0].children).toHaveLength(MAX_TREE_BLOCKS - 1);
  });

  test('keeps a hit as it is when a parent or the tree cannot be read', async () => {
    const lost = graph([['top', ['mid', ['leaf']]]]);
    lost.getBlock.mockRejectedValue(new Error('offline'));
    expect((await run(lost, ['leaf'])).blocks.map(shape)).toEqual(['leaf']);

    const noTree = graph([['top', ['mid']]]);
    noTree.getTree.mockRejectedValue(new Error('offline'));
    expect((await run(noTree, ['mid'])).blocks.map(shape)).toEqual(['mid']);

    const missing = graph([['top', ['mid']]]);
    missing.getBlock.mockResolvedValue(null);
    expect((await run(missing, ['mid'])).blocks.map(shape)).toEqual(['mid']);
  });

  test('keeps a hit as it is when preparing a block of its tree fails', async () => {
    const fake = graph([['top', ['mid']]]);
    const prepare = fake.deps.prepare;
    fake.deps.prepare = async (block, page) => {
      if (block.content === 'mid') throw new Error('bad block');
      return prepare(block, page);
    };
    expect((await run(fake, ['mid'])).blocks.map(shape)).toEqual(['mid']);
  });

  test('a block without ids is a single block', async () => {
    const fake = graph([['top']]);
    const hit = { ...fake.hit('top'), parent: undefined, page: PAGE } as LogseqBlockType;
    const { blocks } = await expandClips([hit], 1, fake.deps);
    expect(blocks).toEqual([{ ...hit, children: undefined }]);
    expect(blocks[0].children).toBeUndefined();
    expect(fake.getTree).not.toHaveBeenCalled();
  });

  test('does not show a deep hit twice when its root is expanded by another hit', async () => {
    const fake = graph([['a', ['b', ['c', ['d url']]], ['x url']]]);
    const { blocks } = await run(fake, ['x url', 'd url']);
    expect(blocks.map((b) => b.content)).toEqual(['a']);
    expect(shape(blocks[0])).toEqual(['a', ['b', ['c', ['d url']]], ['x url*']]);
  });
});
