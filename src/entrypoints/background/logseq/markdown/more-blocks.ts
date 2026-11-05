import type LogseqClient from './client';
import log from '@/utils/logger';

/**
 * `logseq.App.search` of a file graph (0.10.x) returns at most 10 blocks
 * (`search repo q {:limit 10}`, the API takes no options).
 */
export const APP_SEARCH_LIMIT = 10;

/**
 * Blocks containing `query` that a full `App.search` answer left out, so
 * that `found` plus them is at most `limit` blocks. The simple query
 * `logseq.DB.q "text"` answers with whole blocks (the `Editor.getBlock`
 * fields without `children`). Nothing is asked when `found` holds fewer
 * than APP_SEARCH_LIMIT blocks: the search had them all. A failing query
 * answers `[]`, so callers keep the search API results.
 */
export async function moreBlocks(
  client: Pick<LogseqClient, 'find'>,
  query: string,
  found: string[],
  limit: number,
): Promise<any[]> {
  if (found.length < APP_SEARCH_LIMIT) return [];
  let hits: unknown;
  try {
    hits = await client.find(query);
  } catch (e) {
    log.warn('[search] full-text query failed', e);
    return [];
  }
  if (!Array.isArray(hits)) return [];
  const seen = new Set(found);
  return hits
    .filter((block) => block?.uuid && !seen.has(block.uuid) && block.content)
    .slice(0, Math.max(0, limit - found.length));
}
