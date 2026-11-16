import { describe, expect, test } from 'vitest';
import type { LogseqBlockType } from '@/types/logseqBlock';
import { TREE_BLOCKS, TREE_LEVELS, viewClip } from './clip-tree';

const b = (
  uuid: string,
  children: LogseqBlockType[] = [],
  over: Partial<LogseqBlockType> = {},
): LogseqBlockType =>
  ({ uuid, html: `<p>${uuid}</p>`, children, ...over }) as LogseqBlockType;

const names = (node: { block: LogseqBlockType; children: any[] }): unknown =>
  node.children.length
    ? [node.block.uuid, ...node.children.map(names)]
    : node.block.uuid;

describe('viewClip', () => {
  test('shows a small clip whole', () => {
    const view = viewClip(b('r', [b('a', [b('a1')]), b('c')]));
    expect(names(view.root)).toEqual(['r', ['a', 'a1'], 'c']);
    expect(view.hidden).toBe(0);
  });

  test('stops at three levels, counting what is left out', () => {
    expect(TREE_LEVELS).toBe(3);
    const view = viewClip(b('r', [b('a', [b('a1', [b('a2'), b('a3')])])]));
    expect(names(view.root)).toEqual(['r', ['a', 'a1']]);
    expect(view.hidden).toBe(2);
  });

  test('stops at 20 blocks', () => {
    const kids = Array.from({ length: 30 }, (_, i) => b(`k${i}`));
    const view = viewClip(b('r', kids));
    expect(1 + view.root.children.length).toBe(TREE_BLOCKS);
    expect(view.hidden).toBe(30 - (TREE_BLOCKS - 1));
  });

  test('matched blocks and their ancestors are always shown', () => {
    const kids = Array.from({ length: 30 }, (_, i) => b(`k${i}`));
    const deep = b('x', [b('y', [b('z', [b('hit', [], { matched: true })])])]);
    const view = viewClip(b('r', [...kids, deep]));
    const shown = view.root.children.map((c) => c.block.uuid);
    expect(shown).toContain('x');
    expect(names(view.root.children.at(-1)!)).toEqual(['x', ['y', ['z', 'hit']]]);
  });

  test('all shows everything', () => {
    const kids = Array.from({ length: 30 }, (_, i) => b(`k${i}`, [b(`k${i}-c`, [b(`k${i}-d`)])]));
    const view = viewClip(b('r', kids), true);
    expect(view.hidden).toBe(0);
    expect(view.root.children).toHaveLength(30);
  });

  test('leaves out blocks without content and nothing below them', () => {
    const view = viewClip(b('r', [b('empty', [], { html: '' }), b('a')]));
    expect(names(view.root)).toEqual(['r', 'a']);
  });
});
