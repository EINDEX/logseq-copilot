export type LogseqPageIdenity = {
  name: string;
  id: number;
  uuid: string;
  originalName?: string;
};

export type LogseqBlockType = {
  uuid: string;
  html: string;
  page: LogseqPageIdenity;
  content: string;
  format: string;
  marker: string;
  priority: string;
  /** Entity id and parent entity id: nests results under their parent. */
  id?: number;
  parent?: { id: number };
  /** Text of the blocks referenced as `((uuid))`, by uuid. */
  refTitles?: Record<string, string>;
  /** DB graphs: class tags shown after the block (not the inline ones). */
  tagNames?: string[];
  /**
   * The page sidebar (`logseq:urlSearch`): a clip's root block comes with its
   * subtree here. Search results have none.
   */
  children?: LogseqBlockType[];
  /** In such a subtree: the block is one that mentions the page's URL. */
  matched?: boolean;
};

export type LogseqPageContentType = {
  uuid: string;
  content: string;
  page: LogseqPageIdenity;
};

export type LogseqSearchResult = {
  blocks: LogseqBlockType[];
  pages: LogseqPageIdenity[];
  // pageContents: LogseqPageContentType[];
  graph: string;
};

/**
 * Answer to `logseq:changeBlockMarker`. `marker` is the marker the block now
 * has when `status` is 'success', otherwise the marker that was requested.
 */
export type ChangeBlockMarkerResult = {
  type: 'change-block-marker-result';
  uuid: string;
  status: 'success' | 'failed';
  marker: string;
  msg?: string;
};
