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
