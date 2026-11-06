/** `logseq://` links that open a graph, a page or a block in the Logseq app. */
export const graphUrl = (graph: string) => `logseq://graph/${encodeURIComponent(graph)}`;
export const pageUrl = (graph: string, name: string) =>
  `${graphUrl(graph)}?page=${encodeURIComponent(name)}`;
export const blockUrl = (graph: string, uuid: string) =>
  `${graphUrl(graph)}?block-id=${encodeURIComponent(uuid)}`;

/** Whether `url` is a `logseq:` URL (any other scheme, or no URL, is not). */
export const isLogseqUrl = (url: unknown): url is string => {
  if (typeof url !== 'string') return false;
  try {
    return new URL(url).protocol === 'logseq:';
  } catch {
    return false;
  }
};
