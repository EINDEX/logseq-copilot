import { browser } from 'wxt/browser';

/*
 * Who sent an extension message. Only this extension's own contexts can: the
 * manifest has no `externally_connectable` and nothing listens to
 * `onMessageExternal` or relays `window.postMessage`. These checks hold all
 * the same, so a handler never depends on that alone.
 */

export interface MessageSenderLike {
  id?: string;
  tab?: { id?: number; url?: string };
}

/** Sent by this extension (its pages, background or content scripts). */
export const fromThisExtension = (sender: MessageSenderLike | undefined): boolean =>
  !!sender?.id && sender.id === browser.runtime.id;

/** Sent by this extension's background or its pages, not by a content script. */
export const fromExtensionContext = (sender: MessageSenderLike | undefined): boolean =>
  fromThisExtension(sender) && !sender?.tab;
