import { defineExtensionMessaging } from '@webext-core/messaging';
import { ChangeBlockMarkerResult, LogseqSearchResult } from './logseqBlock';
import { LogseqResponseType } from '@/entrypoints/background/logseq/client';

// Define all message types for cross-context communication
export interface MessagingProtocol {
  // Background script messages
  'logseq:search': (query: string) => LogseqResponseType<LogseqSearchResult>;

  'logseq:urlSearch': (data: {
    url: string;
    options?: { fuzzy?: boolean };
  }) => LogseqResponseType<LogseqSearchResult>;

  'logseq:hybridSearch': (data: {
    url: string;
    query: string;
    options?: { fuzzy?: boolean };
    /**
     * Search by `query` only. `url` is still used to pick the recall rules
     * (and so their page scope / keyword filters), but no URL search runs.
     * Used where the page is not the content (search engine result pages).
     */
    keywordOnly?: boolean;
  }) => LogseqResponseType<LogseqSearchResult>;

  'logseq:clipWithSelection': (data: string) => void;

  'logseq:clipPage': () => void;

  'logseq:changeBlockMarker': (data: {
    uuid: string;
    marker: string;
  }) => ChangeBlockMarkerResult;

  'app:openOptions': () => void;

  'app:openPage': (data: { url: string }) => void;

  // Content script messages
  'content:quickCapture': () => void;

  'content:quickCaptureWithSelection': () => void;

  'content:quickCapturePage': () => void;
}

// Create the messaging instance
export const { sendMessage, onMessage } =
  defineExtensionMessaging<MessagingProtocol>();
