import type { RecallAncestor, RecallHit, RecallPage } from '@/types/recall';

/** Hits shown per page before "+N". */
export const VISIBLE_HITS = 2;
/** Pages shown before the "more pages" chevron. */
export const VISIBLE_PAGES = 3;

/**
 * One row under a page title: a hit, or a context line (an ancestor of a hit
 * that is not a hit itself), with the rows hung below it.
 */
export type RecallNode = {
  uuid: string;
  hit?: RecallHit;
  context?: RecallAncestor;
  children: RecallNode[];
};

export type PageTree = {
  nodes: RecallNode[];
  /** Hits of the page that are not shown (the "+N"). */
  hidden: number;
};

/**
 * The rows of a page: the first `VISIBLE_HITS` hits (all of them when
 * `expanded`), each under its context lines. Rows are keyed by block uuid,
 * so a context line shared by several hits is drawn once with the hits
 * below it, and a context line that is itself a hit of the page is drawn as
 * that hit (it counts as shown) with the hit below it.
 */
export const buildPageTree = (page: RecallPage, expanded = false): PageTree => {
  const hitsByUuid = new Map(page.hits.map((hit) => [hit.uuid, hit]));
  const shown = new Set<string>();
  const placed: RecallHit[] = [];
  for (const hit of page.hits) {
    if (!expanded && shown.size >= VISIBLE_HITS) break;
    if (shown.has(hit.uuid)) continue;
    placed.push(hit);
    shown.add(hit.uuid);
    for (const line of hit.context) {
      if (hitsByUuid.has(line.uuid)) shown.add(line.uuid);
    }
  }

  const root: RecallNode = { uuid: '', children: [] };
  const nodes = new Map<string, RecallNode>();
  const placedUuids = new Set(placed.map((hit) => hit.uuid));
  const add = (parent: RecallNode, node: RecallNode) => {
    nodes.set(node.uuid, node);
    parent.children.push(node);
    return node;
  };

  // A shown hit hangs under the nearest shown hit among its context lines,
  // whichever of the two came first; only the context lines below that hit
  // are drawn. A hit shown only as the context of another hit gets no
  // context lines of its own.
  const hitNode = (hit: RecallHit, visiting: Set<string>): RecallNode => {
    const existing = nodes.get(hit.uuid);
    if (existing) return existing;
    visiting.add(hit.uuid);
    let anchor = -1;
    hit.context.forEach((line, i) => {
      if (shown.has(line.uuid) && !visiting.has(line.uuid)) anchor = i;
    });
    let parent = anchor >= 0 ? hitNode(hitsByUuid.get(hit.context[anchor].uuid)!, visiting) : root;
    if (placedUuids.has(hit.uuid)) {
      for (const context of hit.context.slice(anchor + 1)) {
        parent = nodes.get(context.uuid) ?? add(parent, { uuid: context.uuid, context, children: [] });
      }
    }
    return nodes.get(hit.uuid) ?? add(parent, { uuid: hit.uuid, hit, children: [] });
  };
  for (const hit of placed) hitNode(hit, new Set());

  return { nodes: root.children, hidden: Math.max(0, page.hits.length - shown.size) };
};
