import type { LogseqBlockType } from '@/types/logseqBlock';

/** Levels of a clip shown before "+N" (the clip root is level 1). */
export const TREE_LEVELS = 3;
/** Blocks of a clip shown before "+N". */
export const TREE_BLOCKS = 20;

export interface ClipNode {
  block: LogseqBlockType;
  children: ClipNode[];
}

export interface ClipView {
  root: ClipNode;
  /** Blocks left out; 0 when everything is shown. */
  hidden: number;
}

const hasContent = (block: LogseqBlockType) => !!block.html;

/** The block's tree without the blocks that have no content and nothing below them. */
const prune = (block: LogseqBlockType): ClipNode | null => {
  const children = (block.children ?? [])
    .map(prune)
    .filter((node): node is ClipNode => node !== null);
  if (!hasContent(block) && children.length === 0 && !block.matched)
    return null;
  return { block, children };
};

/**
 * What to show of a clip: its blocks in order, down to `TREE_LEVELS` levels and
 * `TREE_BLOCKS` blocks. Matched blocks and the blocks above them are always
 * shown, so a hit is never behind "+N". `all` shows everything.
 */
export const viewClip = (block: LogseqBlockType, all = false): ClipView => {
  const root = prune(block) ?? { block, children: [] };
  const mustShow = new Set<ClipNode>();
  const mark = (node: ClipNode): boolean => {
    let found = !!node.block.matched;
    for (const child of node.children) found = mark(child) || found;
    if (found) mustShow.add(node);
    return found;
  };
  mark(root);

  let total = 0;
  let shown = 0;
  const cut = (node: ClipNode, level: number): ClipNode => {
    total++;
    shown++;
    const children: ClipNode[] = [];
    for (const child of node.children) {
      if (
        all ||
        mustShow.has(child) ||
        (level < TREE_LEVELS && shown < TREE_BLOCKS)
      ) {
        children.push(cut(child, level + 1));
      } else {
        total += count(child);
      }
    }
    return { block: node.block, children };
  };
  const count = (node: ClipNode): number =>
    1 + node.children.reduce((sum, child) => sum + count(child), 0);

  const view = cut(root, 1);
  return { root: view, hidden: total - shown };
};

/** Whether the block is a clip: it comes with its subtree. */
export const isClip = (block: LogseqBlockType) =>
  Array.isArray(block.children) && block.children.length > 0;
