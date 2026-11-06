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

const openFromBackground = (event: Event) => {
  const url = logseqLinkOf(event as MouseEvent);
  if (!url) return;
  event.preventDefault();
  sendMessage('logseq:openLink', { url }).catch((error) =>
    log.error('[content] Failed to open the Logseq link', error),
  );
};

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
 */
export function openLogseqLinksFromBackground(root: EventTarget): void {
  root.addEventListener('click', openFromBackground);
  root.addEventListener('auxclick', openFromBackground);
}
