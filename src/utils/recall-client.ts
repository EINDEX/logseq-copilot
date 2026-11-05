import { sendMessage } from '@/types/messaging';
import type { RecallResult } from '@/types/recall';

/**
 * Ask the background for the Logseq pages that mention a search engine
 * query. `url` is the result page URL; it selects the recall rules. Throws
 * with a readable message when Logseq cannot be reached.
 */
export const requestRecall = (query: string, url: string): Promise<RecallResult> =>
  sendMessage('logseq:recall', { query, url });
