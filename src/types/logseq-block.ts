export type LogseqPageIdenity = {
  name: string;
  id: number;
  uuid: string;
};

export type LogseqBlockType = {
  uuid: string;
  html: string;
  page: LogseqPageIdenity;
};

export type LogseqPageContentType = {
  uuid: string;
  content: string;
  page: LogseqPageIdenity;
};

export type LogseqSearchResult = {
  blocks: LogseqBlockType[];
  pages: LogseqPageIdenity[];
  pageContents: LogseqPageContentType[];
  graph: string;
};
