import {
  defineExtensionMessaging,
  type ExtensionSendMessageArgs,
  type GetDataType,
  type GetReturnType,
} from '@webext-core/messaging';
import { ChangeBlockMarkerResult, LogseqSearchResult } from './logseqBlock';
import { LogseqResponseType } from '@/entrypoints/background/logseq/client';
import type { RecallResult } from './recall';
import type { ClipCommandOptions } from '@/utils/clip-feedback';
import type { ClipResult } from './clip';

// Define all message types for cross-context communication
export interface MessagingProtocol {
  // Background script messages
  'logseq:search': (query: string) => LogseqResponseType<LogseqSearchResult>;

  /** The recall rules matching `url` decide how far up its path to search. */
  'logseq:urlSearch': (data: {
    url: string;
  }) => LogseqResponseType<LogseqSearchResult>;

  /**
   * Pages that mention a search engine query, best first (see
   * background/logseq/recall). `url` picks the recall rules (keyword
   * filters, page scope, maxResults counted in pages). Errors are thrown
   * (LogseqError) and reach the sender as a readable message.
   */
  'logseq:recall': (data: { query: string; url: string }) => RecallResult;

  /**
   * The text is the selection as Markdown. With `templateId`, it is clipped
   * with that template, without it (the bare text) with the default one.
   * `note` is what the user typed in the picker panel (`{{note}}`).
   * Rejects with a readable message (LogseqError) when nothing was clipped.
   * Resolves with the clip.
   */
  'logseq:clipWithSelection': (
    data: string | { text: string; templateId?: string; note?: string },
  ) => ClipResult;

  /**
   * Clips the link of the page in tab `tabId` or, without one, in the active
   * tab of the current window. Senders without a tab of their own (the
   * browser sidebar) name the tab. `templateId` picks the template. Rejects with a readable message
   * (LogseqError) when nothing was clipped. Resolves with the clip.
   */
  'logseq:clipPage': (data?: {
    tabId?: number;
    templateId?: string;
    note?: string;
  }) => ClipResult;

  /**
   * Makes Logseq match the comment of the stored highlight `id`, once the
   * comment is saved (background/highlight-sync.ts). Resolves with whether
   * there was a clip to sync to. Rejects with a readable message when Logseq
   * was not written: the comment stays in the extension.
   */
  'logseq:syncHighlightNote': (data: { id: string }) => boolean;

  /**
   * Drops the link of each stored highlight in `ids` whose clip node was
   * deleted in Logseq (background/highlight-sync.ts). Resolves with the ids
   * that lost their link; an empty list when nothing is known (Logseq not
   * reachable, another graph open). Never rejects for those, never writes to
   * Logseq.
   */
  'logseq:checkHighlightLinks': (data: { ids: string[] }) => string[];

  'logseq:changeBlockMarker': (data: {
    uuid: string;
    marker: string;
  }) => ChangeBlockMarkerResult;

  'app:openOptions': () => void;

  'app:openPage': (data: { url: string }) => void;

  /**
   * From a content script: open a `logseq:` link of its UI in its tab
   * (src/utils/logseq-links.ts). Rejects any other URL; ignored without a
   * sender tab.
   */
  'logseq:openLink': (data: { url: string }) => void;

  // Content script messages. Clip commands resolve once the clip is done; for
  // failures see ClipCommandOptions.
  'content:quickCapture': (data?: ClipCommandOptions) => void;

  'content:quickCaptureWithSelection': (data?: ClipCommandOptions) => void;

  'content:quickCapturePage': (data?: ClipCommandOptions) => void;

  /** "Clip image" from the context menu: the image the menu was opened on. */
  'content:quickCaptureImage': (data: ClipCommandOptions & { srcUrl: string }) => void;

  /** Whether the page has a selection that `quickCaptureWithSelection` would clip. */
  'content:hasSelection': () => boolean;

  /**
   * Sent by the browser sidebar to one tab: scroll the highlight to the middle
   * of the viewport. Resolves to false when the page has no such highlight.
   */
  'content:scrollToHighlight': (data: { id: string }) => boolean;
}

// Create the messaging instance
const messaging = defineExtensionMessaging<MessagingProtocol>();

type DataOf<T extends keyof MessagingProtocol> = GetDataType<MessagingProtocol[T]>;

/**
 * webext-core's sendMessage, except that data the message may go without
 * (`(data?: ...) => ...`) may be left out, as for messages without data.
 */
export const sendMessage: <T extends keyof MessagingProtocol>(
  type: T,
  ...args: undefined extends DataOf<T>
    ? [data?: DataOf<T>, ...rest: ExtensionSendMessageArgs]
    : [data: DataOf<T>, ...rest: ExtensionSendMessageArgs]
) => Promise<GetReturnType<MessagingProtocol[T]>> = messaging.sendMessage;

export const { onMessage } = messaging;
