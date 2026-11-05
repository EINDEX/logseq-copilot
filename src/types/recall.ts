/**
 * Answer to `logseq:recall`: the Logseq pages that mention a search query,
 * best first. Built for the search engine result page card ("you wrote about
 * this in Logseq"), so results are grouped by page.
 */
export type RecallResult = {
  graph: string;
  pages: RecallPage[];
};

export type RecallPage = {
  uuid: string;
  /** Lower-cased page name, for `logseq://graph/<graph>?page=<name>` links. */
  name: string;
  /** Readable page title. */
  title: string;
  kind: 'page' | 'journal';
  /** yyyyMMdd, journals only. */
  journalDay?: number;
  /** Epoch ms of the latest change seen on the page or its hits. */
  updatedAt?: number;
  /** User tags of the page. */
  tags?: string[];
  /** Query terms found in the page title or in any of its hits. */
  matchedTerms: string[];
  /** Ranking key: distinct matched terms first, then the number of hits. */
  score: number;
  /** Hits on this page before `hits` was cut down. */
  totalHits: number;
  /**
   * The best hits, at most MAX_HITS_PER_PAGE (5); empty when only the
   * title matched.
   */
  hits: RecallHit[];
};

export type RecallSegment = {
  kind: 'text' | 'ref' | 'tag';
  value: string;
};

export type RecallAncestor = {
  uuid: string;
  /** Plain text like RecallHit.text, cut to 80 characters. */
  text: string;
  segments: RecallSegment[];
};

export type RecallHit = {
  uuid: string;
  /**
   * Plain text: references resolved to titles, tags kept as `#name`,
   * properties / SCHEDULED / LOGBOOK / renderers removed, images replaced by
   * `[image]`, markdown markup stripped.
   */
  text: string;
  /** `text` split for styling references and tags; joined they equal `text`. */
  segments: RecallSegment[];
  task?: { marker: string; done: boolean };
  /**
   * Context lines shown above the hit, top first; 0–2 entries.
   * - parent: the nearest ancestor whose cleaned text is non-empty.
   * - journals only: the page's top-level block that contains the hit, put
   *   first, when it is non-empty and is not already the parent entry.
   *
   * Display only: recall still walks every hit's ancestors up to the page
   * (a hit anywhere below a template block is dropped), `context` just
   * picks these lines from that walk. Top-level hits get `[]`.
   */
  context: RecallAncestor[];
  matchedTerms: string[];
  updatedAt?: number;
};
