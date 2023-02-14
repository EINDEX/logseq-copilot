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

export type LogseqPageContent = {
  uuid: string;
  html: string;
  page: LogseqPageIdenity;
};

export type LogseqSearchResult = {
  blocks: LogseqBlockType[];
  pages: LogseqPageIdenity[];
  pageContents: LogseqPageContent[];
  graph: string;
};
