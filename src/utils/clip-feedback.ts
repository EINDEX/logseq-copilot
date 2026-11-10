import { UnknownIssues } from '@/entrypoints/background/logseq/error';

/**
 * How a clip command sent to the content script reports a failure.
 *
 * - `page` (default; the clip shortcut and the context menu): shown in the
 *   page, and the command still resolves. A rejected command then only means
 *   that the content script could not be reached.
 * - `sender` (the toolbar popup, the sidebars): the command rejects with the
 *   readable message, nothing is shown in the page.
 */
export interface ClipCommandOptions {
  feedback?: 'page' | 'sender';
}

/**
 * The text to show for a failed clip. Logseq failures arrive as LogseqError
 * (readable message, also across extension messaging); anything without a
 * message gets the generic one.
 */
export const clipErrorMessage = (error: unknown): string => {
  const message = (error as { message?: unknown } | null | undefined)?.message;
  return typeof message === 'string' && message.trim() ? message : UnknownIssues.msg;
};
