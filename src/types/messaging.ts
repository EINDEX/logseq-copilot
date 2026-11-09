import { defineExtensionMessaging } from '@webext-core/messaging';
import { ChangeBlockMarkerResult, LogseqSearchResult } from './logseqBlock';
import { LogseqResponseType } from '@/entrypoints/background/logseq/client';
import type { RecallResult } from './recall';
import type { ClipCommandOptions } from '@/utils/clip-feedback';

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

  /** Rejects with a readable message (LogseqError) when nothing was clipped. */
  'logseq:clipWithSelection': (data: string) => void;

  /** Rejects with a readable message (LogseqError) when nothing was clipped. */
  'logseq:clipPage': () => void;

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

  /** Whether the page has a selection that `quickCaptureWithSelection` would clip. */
  'content:hasSelection': () => boolean;

  /**
   * Sent by the browser sidebar to one tab: scroll the highlight to the middle
   * of the viewport. Resolves to false when the page has no such highlight.
   */
  'content:scrollToHighlight': (data: { id: string }) => boolean;
}

// Create the messaging instance
export const { sendMessage, onMessage } =
  defineExtensionMessaging<MessagingProtocol>();
