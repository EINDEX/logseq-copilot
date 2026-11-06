/** `logseq://` links that open a graph, a page or a block in the Logseq app. */
export const graphUrl = (graph: string) => `logseq://graph/${encodeURIComponent(graph)}`;
export const pageUrl = (graph: string, name: string) =>
  `${graphUrl(graph)}?page=${encodeURIComponent(name)}`;
export const blockUrl = (graph: string, uuid: string) =>
  `${graphUrl(graph)}?block-id=${encodeURIComponent(uuid)}`;
