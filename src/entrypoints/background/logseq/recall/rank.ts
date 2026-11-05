import { findMatchedTerms } from '@/utils/recall-query';
import {
  pageInScope,
  type ProcessedSearchContext,
} from '@/utils/recall-rule-processor';
import type { ParsedBlock } from './block-text';

/** A page as read from Logseq, before ranking. */
export type CandidatePage = {
  uuid: string;
  name: string;
  title: string;
  kind: 'page' | 'journal';
  journalDay?: number;
  updatedAt?: number;
  tags?: string[];
  /** Not a note page (DB tag / property pages). */
  noise?: boolean;
};

/** A block search hit as read from Logseq, before ranking. */
export type CandidateBlock = {
  uuid: string;
  page: CandidatePage;
  /** Raw block text (file: content, DB: fullTitle), for keyword filters. */
  raw: string;
  /** Raw text parsed without extra lookups. */
  parsed: ParsedBlock;
  updatedAt?: number;
  /** Not a note: template, property value, ... */
  noise?: boolean;
  /** Id of the parent block, undefined for top-level blocks. */
  parentRef?: number | string;
  /** Source-specific data the source needs again later. */
  source?: unknown;
};

export type RankedHit = CandidateBlock & { matchedTerms: string[] };

export type RankedPage = {
  page: CandidatePage;
  matchedTerms: string[];
  score: number;
  /** Every hit that passed the filters, best first. */
  hits: RankedHit[];
  updatedAt?: number;
};

export type RankOptions = {
  terms: string[];
  excludeKeywords?: string[];
  includeKeywords?: string[];
  searchScope?: ProcessedSearchContext['searchScope'];
  prioritizeRecent?: boolean;
};

const MAX_HIT_SCORE = 999;

/** Distinct matched terms first, then the number of hits. */
export const pageScore = (distinctTerms: number, hits: number) =>
  distinctTerms * (MAX_HIT_SCORE + 1) + Math.min(hits, MAX_HIT_SCORE);

const containsAny = (text: string, keywords: string[]) => {
  const lower = text.toLowerCase();
  return keywords.some((k) => k && lower.includes(k.toLowerCase()));
};

const countKeywords = (text: string, keywords: string[]) => {
  const lower = text.toLowerCase();
  return keywords.filter((k) => k && lower.includes(k.toLowerCase())).length;
};

const inScope = (page: CandidatePage, options: RankOptions) =>
  pageInScope(
    { name: page.name, title: page.title },
    options.searchScope ?? {},
  );

const latest = (...values: (number | undefined)[]) => {
  const known = values.filter((v): v is number => typeof v === 'number');
  return known.length ? Math.max(...known) : undefined;
};

const byRecency = (a?: number, b?: number) => (b ?? 0) - (a ?? 0);

/**
 * Filter block and page hits, group them by page and sort the pages, best
 * first. Nothing is cut here: callers take the top of the list.
 *
 * A block hit is dropped when it is noise, its text is empty, it contains
 * none of the terms (Logseq's fuzzy fallback recalls unrelated blocks), it
 * contains an excluded keyword or its page is out of the recall rule scope.
 * A page hit (title match) is dropped when the page is noise or the title
 * contains none of the terms.
 */
export const rankRecall = (
  blocks: CandidateBlock[],
  titleHits: CandidatePage[],
  options: RankOptions,
): RankedPage[] => {
  const { terms } = options;
  const exclude = options.excludeKeywords ?? [];
  const include = options.includeKeywords ?? [];
  const groups = new Map<string, { page: CandidatePage; hits: RankedHit[] }>();
  const groupOf = (page: CandidatePage) => {
    let group = groups.get(page.uuid);
    if (!group) {
      group = { page, hits: [] };
      groups.set(page.uuid, group);
    }
    return group;
  };

  const seen = new Set<string>();
  for (const block of blocks) {
    if (seen.has(block.uuid)) continue;
    seen.add(block.uuid);
    if (block.noise || block.page.noise) continue;
    if (!block.parsed.text.trim()) continue;
    const matchedTerms = findMatchedTerms(block.parsed.text, terms);
    if (matchedTerms.length === 0) continue;
    if (containsAny(block.raw, exclude)) continue;
    if (!inScope(block.page, options)) continue;
    groupOf(block.page).hits.push({ ...block, matchedTerms });
  }

  for (const page of titleHits) {
    if (page.noise) continue;
    if (findMatchedTerms(page.title, terms).length === 0) continue;
    if (containsAny(page.title, exclude)) continue;
    if (!inScope(page, options)) continue;
    groupOf(page);
  }

  const ranked = [...groups.values()].map(({ page, hits }) => {
    hits.sort(
      (a, b) =>
        b.matchedTerms.length - a.matchedTerms.length ||
        byRecency(a.updatedAt, b.updatedAt),
    );
    const matched = new Set(findMatchedTerms(page.title, terms));
    hits.forEach((hit) => hit.matchedTerms.forEach((t) => matched.add(t)));
    const matchedTerms = terms.filter((t) => matched.has(t));
    const includeScore = include.length
      ? countKeywords(
          [page.title, ...hits.map((hit) => hit.parsed.text)].join('\n'),
          include,
        )
      : 0;
    return {
      page,
      hits,
      matchedTerms,
      score: pageScore(matchedTerms.length, hits.length),
      updatedAt: latest(page.updatedAt, ...hits.map((hit) => hit.updatedAt)),
      includeScore,
    };
  });

  ranked.sort((a, b) => {
    const order = [
      b.includeScore - a.includeScore,
      b.matchedTerms.length - a.matchedTerms.length,
      ...(options.prioritizeRecent
        ? [byRecency(a.updatedAt, b.updatedAt), b.hits.length - a.hits.length]
        : [b.hits.length - a.hits.length, byRecency(a.updatedAt, b.updatedAt)]),
    ];
    return order.find((d) => d !== 0) ?? 0;
  });

  return ranked.map(({ includeScore: _, ...page }) => page);
};
