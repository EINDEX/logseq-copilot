import { defineExtensionMessaging } from '@webext-core/messaging';
import { LogseqSearchResult } from './logseqBlock';
import { LogseqResponseType } from '@/entrypoints/background/logseq/client';

// Define all message types for cross-context communication
export interface MessagingProtocol {
  // Background script messages
  'logseq:search': (query: string) => LogseqResponseType<LogseqSearchResult>;

  'logseq:urlSearch': (data: {
    url: string;
    options?: { fuzzy?: boolean };
  }) => LogseqResponseType<LogseqSearchResult>;

  'logseq:clipWithSelection': (data: string) => void;

  'logseq:clipPage': () => void;

  'logseq:changeBlockMarker': (data: { uuid: string; marker: string }) => {
    type: string;
    uuid: string;
    status: string;
    marker: string;
    msg?: string;
  };

  'app:openOptions': () => void;

  'app:openPage': (data: { url: string }) => void;

  // Content script messages
  'content:blockMarkerChanged': (data: {
    type: string;
    uuid: string;
    status: string;
    marker: string;
    msg?: string;
  }) => void;

  'content:quickCapture': () => void;

  'content:quickCaptureWithSelection': () => void;

  'content:quickCapturePage': () => void;
}

// Create the messaging instance
export const { sendMessage, onMessage } =
  defineExtensionMessaging<MessagingProtocol>();
