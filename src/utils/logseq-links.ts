import { sendMessage } from '@/types/messaging';
import log from '@/utils/logger';
import { isLogseqUrl } from '@/utils/logseq-url';

/**
 * The `logseq:` link a user's click opens, if any: a left click (with or
 * without Ctrl, Cmd, Shift, Alt) or a middle click. Not a right click: the
 * context menu still offers "Copy link address".
 */
const logseqLinkOf = (event: MouseEvent): string | undefined => {
  if (!event.isTrusted || event.defaultPrevented) return undefined;
  if (event.button !== (event.type === 'auxclick' ? 1 : 0)) return undefined;
  const target = event.target as Element | null;
  const link = target?.closest?.('a[href]') as HTMLAnchorElement | null | undefined;
  // `href` of an SVG <a> is no string, so it is skipped too.
  return isLogseqUrl(link?.href) ? link.href : undefined;
};

type OpenLink = (url: string) => Promise<unknown>;

/** From a content script: the background opens it in the sender's tab. */
const sendOpenLink: OpenLink = (url) => sendMessage('logseq:openLink', { url });

const opener = (open: OpenLink) => (event: Event) => {
  const url = logseqLinkOf(event as MouseEvent);
  if (!url) return;
  event.preventDefault();
  open(url).catch((error) => log.error('Failed to open the Logseq link', error));
};

// One listener for the default, so adding it again is a no-op.
const openFromBackground = opener(sendOpenLink);

/**
 * Have the background open the `logseq:` links of a content script UI.
 *
 * A link the page opens itself makes the browser ask whether that site may
 * open Logseq ("www.google.com wants to open this application"), and "always
 * allow" lets that site open Logseq. Opened by the background
 * (`logseq:openLink`), it asks once for the extension, for every site. The
 * links keep their `href`, for the status bar and "Copy link address".
 *
 * Call it with the UI's shadow root: the listeners there see the real target
 * of a click, even in a closed shadow root. Adding them again is a no-op.
 *
 * An extension page has no tab of its own for `logseq:openLink`: it passes
 * `open`, which asks the background some other way. Returns a function that
 * removes the listeners.
 */
export function openLogseqLinksFromBackground(
  root: EventTarget,
  open: OpenLink = sendOpenLink,
): () => void {
  const listener = open === sendOpenLink ? openFromBackground : opener(open);
  root.addEventListener('click', listener);
  root.addEventListener('auxclick', listener);
  return () => {
    root.removeEventListener('click', listener);
    root.removeEventListener('auxclick', listener);
  };
}
