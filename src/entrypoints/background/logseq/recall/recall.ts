import type {
  RecallAncestor,
  RecallHit,
  RecallPage,
  RecallResult,
} from '@/types/recall';
import { findMatchedTerms, normalizeQuery } from '@/utils/recall-query';
import {
  parseBlockText,
  refKey,
  truncate,
  truncateSegments,
  type UuidRef,
} from './block-text';
import {
  pageScore,
  rankRecall,
  type CandidateBlock,
  type CandidatePage,
  type RankOptions,
  type RankedHit,
} from './rank';

/** Hits asked from Logseq per search. */
export const SEARCH_LIMIT = 30;
/** Pages returned. A recall rule's maxResults can lower it. */
export const MAX_PAGES = 6;
/**
 * Hits returned per page. The card shows the first 2 and the rest behind
 * "+N" (N = hits.length - 2).
 */
export const MAX_HITS_PER_PAGE = 5;
/** Block / page references resolved per recall request. */
export const MAX_REF_LOOKUPS = 10;
/** Guard against broken parent links. */
export const MAX_PARENT_WALK = 100;
export const ANCESTOR_TEXT_MAX = 80;
export const REF_TEXT_MAX = 80;

/** A parent block, read for the template check and the hit context. */
export type AncestorBlock = {
  uuid: string;
  raw: string;
  marker?: string;
  /** A template block (its descendants are template content). */
  template: boolean;
  /** Its own parent block, undefined when it is top-level. */
  parentRef?: number | string;
};

/**
 * Graph-type specific access to Logseq (file graph / DB graph). A source
 * lives for one recall request and reads every block at most once.
 */
export interface RecallSource {
  getGraph(): Promise<string>;
  /** One Logseq search (at most SEARCH_LIMIT hits), read into candidates. */
  search(query: string): Promise<{
    blocks: CandidateBlock[];
    pages: CandidatePage[];
  }>;
  /** A block by id or uuid; null when it is missing. */
  getAncestor(ref: number | string): Promise<AncestorBlock | null>;
  /** Raw text of a referenced block / title of a referenced page. */
  getRefText(ref: UuidRef): Promise<string | undefined>;
}

export type RecallOptions = Omit<RankOptions, 'terms'> & {
  /** Recall rule maxResults, counted in pages. */
  maxPages?: number;
};

type Selected = {
  hit: RankedHit;
  /** Every ancestor, top-level block first. */
  chain: AncestorBlock[];
};

/** The block has text once cleaned (not only properties, say). */
const hasText = (block: AncestorBlock) =>
  parseBlockText(block.raw, { marker: block.marker }).text.trim() !== '';

/**
 * The ancestors shown above a hit (RecallHit.context), from its whole chain
 * (top-level block first): the nearest one with text and, on journals, the
 * top-level block before it when that has text and is another block.
 */
export const contextBlocks = (
  chain: AncestorBlock[],
  kind: CandidatePage['kind'],
): AncestorBlock[] => {
  const parent = [...chain].reverse().find(hasText);
  if (!parent) return [];
  const root = chain[0];
  return kind === 'journal' && root.uuid !== parent.uuid && hasText(root)
    ? [root, parent]
    : [parent];
};

/**
 * Search Logseq for a search engine query and return the matching pages,
 * best first: search with all terms, then (when nothing useful came back)
 * with the longest single terms; filter and rank every hit, and only then
 * cut down to MAX_PAGES pages of MAX_HITS_PER_PAGE hits. Ancestors are read
 * for the hits picked (to drop template content), references and context
 * lines only for the returned ones.
 */
export const recall = async (
  source: RecallSource,
  query: string,
  options: RecallOptions = {},
): Promise<RecallResult> => {
  const graph = await source.getGraph();
  const { primary, terms, fallbacks } = normalizeQuery(query);
  if (!primary) return { graph, pages: [] };

  const rankOptions: RankOptions = { ...options, terms };
  const blocks: CandidateBlock[] = [];
  const titleHits: CandidatePage[] = [];
  const searchAndRank = async (text: string) => {
    const found = await source.search(text);
    blocks.push(...found.blocks);
    titleHits.push(...found.pages);
    return rankRecall(blocks, titleHits, rankOptions);
  };

  let ranked = await searchAndRank(primary);
  if (ranked.length === 0 && terms.length > 1) {
    for (const term of fallbacks) {
      ranked = await searchAndRank(term);
      if (ranked.length > 0) break;
    }
  }

  // Every hit's ancestors up to the page: template content is dropped, and
  // the context lines are picked from the same chain. Hits of a page share
  // ancestors, each is read once per request.
  const ancestors = new Map<string, Promise<AncestorBlock | null>>();
  const getAncestor = (ref: number | string) => {
    const key = String(ref);
    let pending = ancestors.get(key);
    if (!pending) {
      pending = source.getAncestor(ref).catch(() => null);
      ancestors.set(key, pending);
    }
    return pending;
  };
  const chainOf = async (hit: CandidateBlock) => {
    const chain: AncestorBlock[] = [];
    const seen = new Set<string>();
    let ref = hit.parentRef;
    while (ref !== undefined && chain.length < MAX_PARENT_WALK) {
      if (seen.has(String(ref))) break;
      seen.add(String(ref));
      const ancestor = await getAncestor(ref);
      if (!ancestor) break;
      chain.push(ancestor);
      ref = ancestor.parentRef;
    }
    return chain.reverse();
  };

  const pageLimit = Math.max(
    0,
    Math.min(MAX_PAGES, options.maxPages ?? MAX_PAGES),
  );
  const selectedPages: {
    page: CandidatePage;
    selected: (Selected & { context: AncestorBlock[] })[];
    totalHits: number;
    matchedTerms: string[];
    updatedAt?: number;
  }[] = [];

  for (const page of ranked) {
    if (selectedPages.length >= pageLimit) break;
    const selected: Selected[] = [];
    const dropped = new Set<string>();
    let next = 0;
    while (selected.length < MAX_HITS_PER_PAGE && next < page.hits.length) {
      const batch = page.hits.slice(
        next,
        next + MAX_HITS_PER_PAGE - selected.length,
      );
      next += batch.length;
      const withChains = await Promise.all(
        batch.map(async (hit) => ({ hit, chain: await chainOf(hit) })),
      );
      for (const item of withChains) {
        if (item.chain.some((a) => a.template)) {
          dropped.add(item.hit.uuid);
        } else {
          selected.push(item);
        }
      }
    }
    const remaining = page.hits.filter((hit) => !dropped.has(hit.uuid));
    const matched = new Set(findMatchedTerms(page.page.title, terms));
    remaining.forEach((hit) => hit.matchedTerms.forEach((t) => matched.add(t)));
    if (selected.length === 0 && matched.size === 0) continue;
    selectedPages.push({
      page: page.page,
      selected: selected.map((item) => ({
        ...item,
        context: contextBlocks(item.chain, page.page.kind),
      })),
      totalHits: remaining.length,
      matchedTerms: terms.filter((t) => matched.has(t)),
      updatedAt: page.updatedAt,
    });
  }

  // Resolve ((block)) / [[uuid]] references of what is returned, once each,
  // hits before context lines.
  const wanted = new Map<string, UuidRef>();
  const want = (raw: string) =>
    parseBlockText(raw).unresolved.forEach((ref) =>
      wanted.set(refKey(ref), ref),
    );
  const everySelected = selectedPages.flatMap((p) => p.selected);
  everySelected.forEach(({ hit }) =>
    hit.parsed.unresolved.forEach((ref) => wanted.set(refKey(ref), ref)),
  );
  everySelected.forEach(({ context }) => context.forEach((a) => want(a.raw)));
  const refTexts = new Map<string, string>();
  await Promise.all(
    [...wanted.values()].slice(0, MAX_REF_LOOKUPS).map(async (ref) => {
      const raw = await source.getRefText(ref).catch(() => undefined);
      if (raw === undefined) return;
      const text = parseBlockText(raw).text;
      if (text) refTexts.set(refKey(ref), truncate(text, REF_TEXT_MAX));
    }),
  );
  const lookup = (ref: UuidRef) => refTexts.get(refKey(ref));

  const toAncestor = (a: AncestorBlock): RecallAncestor => {
    const parsed = parseBlockText(a.raw, { lookup, marker: a.marker });
    return {
      uuid: a.uuid,
      ...truncateSegments(parsed.segments, ANCESTOR_TEXT_MAX),
    };
  };

  const pages: RecallPage[] = selectedPages.map((entry) => {
    const hits: RecallHit[] = entry.selected.map(({ hit, context }) => {
      const parsed = hit.parsed.unresolved.length
        ? parseBlockText(hit.raw, { lookup, marker: hit.parsed.task?.marker })
        : hit.parsed;
      return {
        uuid: hit.uuid,
        text: parsed.text,
        segments: parsed.segments,
        ...(parsed.task ? { task: parsed.task } : {}),
        context: context.map(toAncestor),
        matchedTerms: findMatchedTerms(parsed.text, terms),
        ...(hit.updatedAt !== undefined ? { updatedAt: hit.updatedAt } : {}),
      };
    });
    const { page } = entry;
    return {
      uuid: page.uuid,
      name: page.name,
      title: page.title,
      kind: page.kind,
      ...(page.journalDay !== undefined ? { journalDay: page.journalDay } : {}),
      ...(entry.updatedAt !== undefined ? { updatedAt: entry.updatedAt } : {}),
      ...(page.tags?.length ? { tags: page.tags } : {}),
      matchedTerms: entry.matchedTerms,
      score: pageScore(entry.matchedTerms.length, entry.totalHits),
      totalHits: entry.totalHits,
      hits,
    };
  });

  return { graph, pages };
};
