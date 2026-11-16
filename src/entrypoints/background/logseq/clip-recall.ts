/**
 * Recall of whole clips for the page sidebar (`logseq:urlSearch`).
 *
 * A search finds the block that has the page's URL. Clips are arranged in
 * different ways, the URL is not always in the block that starts the clip:
 *
 * - a comment with the highlight (and URL) below it,
 * - a highlight and a comment as siblings under a link,
 * - the URL only in a child block.
 *
 * So every hit is mapped to its clip root, the top-level block of its page,
 * and the root is shown with its subtree:
 *
 * - A hit at most `MAX_CLIP_DEPTH` levels from the top of its page (a top-level
 *   block is level 1) is merged into its root. A deeper hit is probably a line
 *   inside the user's own long notes: it stays a single block.
 * - Hits under the same root collapse into one entry, in the order of the first
 *   hit. The root comes with `children` (the whole subtree, `MAX_TREE_BLOCKS`
 *   blocks at most), and `matched` on the blocks that were hits.
 * - At most `MAX_CLIP_ROOTS` roots are expanded, and only the first
 *   `MAX_CLIMBED_HITS` hits are followed up: the requests stay few. What is not
 *   expanded stays a single block, as it was before.
 *
 * Both kinds of graph use the same step: the service gives it the client calls
 * (a block by uuid or entity id, a block with its descendants) and how it renders
 * a block. A block's `parent` and `page` carry the entity `id` on both graphs,
 * and a top-level block is the one whose parent is its page.
 */
import type { LogseqBlockType, LogseqPageIdenity } from '@/types/logseqBlock';

/** How far from the top of its page a hit is merged into its root (the top-level block is 1). */
export const MAX_CLIP_DEPTH = 3;
/** Roots expanded to their subtree per search. */
export const MAX_CLIP_ROOTS = 10;
/** Hits that are followed up to their root; later ones stay single blocks. */
export const MAX_CLIMBED_HITS = 30;
/** Blocks of a subtree that are read and rendered (the root and its descendants). */
export const MAX_TREE_BLOCKS = 60;

export interface ClipRecallDeps {
  /** A block by uuid or entity id, without its children; null when it cannot be read. */
  getBlock(ref: string | number): Promise<any | null | undefined>;
  /** A block with all its descendants (nested `children`); null when it cannot be read. */
  getTree(uuid: string): Promise<any | null | undefined>;
  /** The block as a result: its text resolved and rendered (`html`). */
  prepare(block: any, page: LogseqPageIdenity): Promise<LogseqBlockType>;
}

const isTopLevel = (block: any): boolean => {
  const parent = block?.parent?.id;
  const page = block?.page?.id;
  return parent !== undefined && parent === page;
};

const refOf = (parent: any): string | number =>
  typeof parent?.uuid === 'string' && parent.uuid ? parent.uuid : parent.id;

/**
 * The top-level block of `hit`'s page when `hit` is at most `MAX_CLIP_DEPTH`
 * levels deep, or null when it is deeper (or a parent cannot be read).
 */
const findRoot = async (
  hit: LogseqBlockType,
  getParent: (ref: string | number) => Promise<any | null | undefined>,
): Promise<any | null> => {
  let current: any = hit;
  let depth = 1;
  // Without both ids the block cannot be placed: it stays what it is.
  if (current?.parent?.id === undefined || current?.page?.id === undefined) return null;
  while (!isTopLevel(current)) {
    if (depth >= MAX_CLIP_DEPTH) return null;
    const parent = await getParent(refOf(current.parent));
    if (!parent) return null;
    current = parent;
    depth++;
  }
  return current;
};

const isBlock = (child: any) =>
  child && typeof child === 'object' && !Array.isArray(child);

interface Node {
  raw: any;
  children: Node[];
}

/** The root and its descendants as nodes, in document order, `MAX_TREE_BLOCKS` of them at most. */
const takeTree = (root: any): Node => {
  let taken = 0;
  const take = (raw: any): Node => {
    taken++;
    const node: Node = { raw, children: [] };
    for (const kid of Array.isArray(raw.children) ? raw.children : []) {
      if (taken >= MAX_TREE_BLOCKS) break;
      if (isBlock(kid)) node.children.push(take(kid));
    }
    return node;
  };
  return take(root);
};

/** A hit as a single block: a search can carry `children` as bare references, not blocks. */
const single = (hit: LogseqBlockType): LogseqBlockType => {
  if (hit.children === undefined) return hit;
  const { children: _children, ...rest } = hit;
  return rest as LogseqBlockType;
};

const flatten = function* (node: Node): Generator<Node> {
  yield node;
  for (const child of node.children) yield* flatten(child);
};

export interface ClipRecall {
  blocks: LogseqBlockType[];
  /** The entries made of hits for the page itself, the first `pageHits` hits. */
  count: number;
}

/**
 * The hits as entries: each hit's clip root with its subtree, one entry per
 * root, and the hits that are not merged as they are. `pageHits` is how many of
 * the first `hits` are for the page itself (the others are for its parent
 * paths). A failure to read a parent or a subtree leaves that hit as it is.
 */
export const expandClips = async (
  hits: LogseqBlockType[],
  pageHits: number,
  deps: ClipRecallDeps,
): Promise<ClipRecall> => {
  const parents = new Map<string | number, Promise<any | null>>();
  const getParent = (ref: string | number) => {
    if (!parents.has(ref)) {
      parents.set(
        ref,
        Promise.resolve(deps.getBlock(ref)).then(
          (block) => block ?? null,
          () => null,
        ),
      );
    }
    return parents.get(ref)!;
  };

  const roots = await Promise.all(
    hits.map((hit, index) =>
      index < MAX_CLIMBED_HITS
        ? findRoot(hit, getParent).catch(() => null)
        : Promise.resolve(null),
    ),
  );

  // Entries in the order of their first hit; the first MAX_CLIP_ROOTS roots expand.
  interface Entry {
    hit: LogseqBlockType;
    root?: any;
    hits: LogseqBlockType[];
    pageLevel: boolean;
  }
  const entries: Entry[] = [];
  const byRoot = new Map<string, Entry>();
  hits.forEach((hit, index) => {
    const root = roots[index];
    const key = root?.uuid as string | undefined;
    const existing = key ? byRoot.get(key) : undefined;
    if (existing) {
      existing.hits.push(hit);
      existing.pageLevel ||= index < pageHits;
      return;
    }
    const entry: Entry = {
      hit,
      root: key && byRoot.size < MAX_CLIP_ROOTS ? root : undefined,
      hits: [hit],
      pageLevel: index < pageHits,
    };
    if (entry.root) byRoot.set(key!, entry);
    entries.push(entry);
  });

  // Every expanded root's subtree, read at once.
  const trees = await Promise.all(
    entries.map(async (entry) => {
      if (!entry.root) return null;
      try {
        return (await deps.getTree(entry.root.uuid)) ?? null;
      } catch {
        return null;
      }
    }),
  );

  const built = await Promise.all(
    entries.map(async (entry, index) => {
      const tree = trees[index];
      if (!entry.root || !isBlock(tree)) {
        return { entry, block: single(entry.hit), uuids: undefined };
      }
      try {
        const nodes = takeTree(tree);
        const hitIds = new Set(entry.hits.map((hit) => hit.uuid));
        const prepared = new Map<Node, LogseqBlockType>();
        await Promise.all(
          [...flatten(nodes)].map(async (node) => {
            prepared.set(node, await deps.prepare(node.raw, entry.hit.page));
          }),
        );
        const assemble = (node: Node): LogseqBlockType => {
          const block = prepared.get(node)!;
          if (hitIds.has(block.uuid)) block.matched = true;
          block.children = node.children.map(assemble);
          return block;
        };
        return {
          entry,
          block: assemble(nodes),
          uuids: new Set([...flatten(nodes)].map((node) => node.raw.uuid)),
        };
      } catch {
        return { entry, block: single(entry.hit), uuids: undefined };
      }
    }),
  );

  // A single block already inside an expanded tree (a deep hit below a root
  // another hit expanded) is not shown twice.
  const inTree = new Set<string>();
  for (const item of built) {
    for (const uuid of item.uuids ?? []) inTree.add(uuid);
  }
  const blocks: LogseqBlockType[] = [];
  let count = 0;
  for (const item of built) {
    if (!item.uuids && inTree.has(item.block.uuid)) continue;
    blocks.push(item.block);
    if (item.entry.pageLevel) count++;
  }
  return { blocks, count };
};
