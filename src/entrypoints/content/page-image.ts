import log from '@/utils/logger';
import {
  fromExtensionContext,
  type MessageSenderLike,
} from '@/utils/message-sender';
import {
  bytesToBase64,
  imageExtOf,
  MAX_DOWNLOAD_BYTES,
  readCapped,
  type PageImage,
} from '@/utils/image-bytes';

/*
 * "Save images to Logseq": the background asks the tab a clip came from for
 * the bytes of an image of the clip (background/page-image.ts). The page
 * shows it, so the page can have it: a login cookie, a host on the local
 * network, a redirect, no file extension.
 *
 * In Manifest V3 a content script's fetch is the page's own request (Chrome
 * 73+, Firefox 101+): the page's cookies, its CORS and Private Network Access
 * rules, the host permissions of the extension do not apply. So it reaches
 * nothing the page could not reach itself, and needs no check of the host
 * (the background's own download has one, image-download.ts). A cross-origin
 * image without CORS headers fails here; the background then downloads it
 * itself.
 *
 * It fetches only for the page clipped, and only an image this document has
 * loaded itself (pageShowsImage): a URL from anywhere else (a frame of another
 * site, text that looks like an image) never goes out with this page's
 * cookies.
 */

const FETCH_TIMEOUT_MS = 15_000;

/** What a page may load an image from. */
const PAGE_IMAGE_SCHEMES = new Set(['http:', 'https:', 'data:', 'blob:']);

/**
 * The image at `url` as the page gets it: with its cookies (a cross-origin
 * host that refuses them is asked once more without), from the cache when
 * the page has it there, redirects followed. Null when it is not an
 * image (the bytes say, or the Content-Type for SVG), is larger than
 * MAX_DOWNLOAD_BYTES, or the page cannot have it.
 */
export const fetchImageInPage = async (
  url: string,
): Promise<PageImage | null> => {
  let href: string;
  try {
    const parsed = new URL(url);
    if (!PAGE_IMAGE_SCHEMES.has(parsed.protocol)) return null;
    href = parsed.href;
  } catch {
    return null;
  }

  const request = (credentials: RequestCredentials) =>
    fetch(href, {
      credentials,
      cache: 'force-cache',
      redirect: 'follow',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

  try {
    let resp: Response;
    try {
      resp = await request('include');
    } catch (error) {
      // A cross-origin image served to anyone (`Access-Control-Allow-Origin:
      // *`) is refused with credentials: once more without them, as
      // <img crossorigin="anonymous"> loads it. Not after a timeout.
      const sameOrigin = new URL(href).origin === location.origin;
      if (sameOrigin || (error as Error | undefined)?.name === 'TimeoutError')
        throw error;
      resp = await request('omit');
    }
    if (!resp.ok) {
      await resp.body?.cancel().catch(() => {});
      return null;
    }
    const bytes = await readCapped(resp, MAX_DOWNLOAD_BYTES);
    if (!bytes || bytes.length === 0) return null;
    const contentType = resp.headers.get('content-type') ?? '';
    if (!imageExtOf(bytes, contentType)) return null;
    return { base64: bytesToBase64(bytes), contentType };
  } catch (error) {
    log.debug('[page-image] The page could not fetch', url, error);
    return null;
  }
};

/** `url` without its `#hash`, or null when it is not a URL. */
const withoutHash = (url: string) => {
  try {
    const parsed = new URL(url);
    parsed.hash = '';
    return parsed.href;
  } catch {
    return null;
  }
};

/**
 * Whether this document is the page `pageUrl` (its `#hash` aside). A tab that
 * went to another page since the clip does not fetch for it: the URL was
 * chosen by the page clipped, and must not go out as another page's request,
 * with that page's cookies.
 */
export const isClippedPage = (pageUrl: unknown): boolean => {
  if (typeof pageUrl !== 'string') return false;
  const clipped = withoutHash(pageUrl);
  return clipped !== null && clipped === withoutHash(location.href);
};

/** `url` resolved against this document, or null when it is not a URL. */
const resolved = (url: string | null | undefined): string | null => {
  if (!url) return null;
  try {
    return new URL(url, document.baseURI).href;
  } catch {
    return null;
  }
};

/** The URLs of a `srcset`, without their descriptors (`1x`, `640w`). */
export const srcsetUrls = (srcset: string): string[] => {
  const urls: string[] = [];
  let i = 0;
  while (i < srcset.length) {
    // Between candidates: white space and commas.
    while (i < srcset.length && /[\s,]/.test(srcset[i])) i++;
    let end = i;
    while (end < srcset.length && !/\s/.test(srcset[end])) end++;
    let url = srcset.slice(i, end);
    i = end;
    if (url.endsWith(',')) {
      // No descriptors: the comma ends the candidate.
      url = url.replace(/,+$/, '');
    } else {
      // The descriptors, up to the comma that ends the candidate.
      let depth = 0;
      while (i < srcset.length && (srcset[i] !== ',' || depth > 0)) {
        if (srcset[i] === '(') depth++;
        else if (srcset[i] === ')') depth = Math.max(0, depth - 1);
        i++;
      }
    }
    if (url) urls.push(url);
  }
  return urls;
};

/**
 * Whether this document has loaded the image at `url` itself: the URL of one
 * of its images (`currentSrc` or `src`), a candidate of a `<source srcset>` of
 * a `<picture>`, or a resource it loaded (CSS backgrounds, ...). A `data:` or
 * `blob:` URL only as one of its images: they are in no resource list.
 */
export const pageShowsImage = (url: string): boolean => {
  const href = resolved(url);
  if (!href) return false;
  // `document.images`: every <img> of this document.
  for (const image of Array.from(document.querySelectorAll('img'))) {
    if (resolved(image.currentSrc) === href || resolved(image.src) === href) {
      return true;
    }
  }
  if (/^(data|blob):/i.test(href)) return false;
  for (const source of Array.from(
    document.querySelectorAll('picture > source[srcset]'),
  )) {
    const srcset = source.getAttribute('srcset') ?? '';
    if (srcsetUrls(srcset).some((candidate) => resolved(candidate) === href))
      return true;
  }
  return performance
    .getEntriesByType('resource')
    .some((entry) => resolved(entry.name) === href);
};

/**
 * The `content:fetchImage` handler: only for the extension itself, never a
 * page, only while this is still the page clipped, and only for an image
 * this page has loaded.
 */
export const onFetchImage = async ({
  data,
  sender,
}: {
  data: { url: string; pageUrl: string };
  sender: MessageSenderLike;
}): Promise<PageImage | null> => {
  if (!fromExtensionContext(sender)) {
    log.warn('[page-image] content:fetchImage not from the extension, ignored');
    return null;
  }
  if (typeof data?.url !== 'string') return null;
  if (!isClippedPage(data.pageUrl)) {
    log.debug('[page-image] Not the page clipped, no fetch for', data.pageUrl);
    return null;
  }
  if (!pageShowsImage(data.url)) {
    log.debug('[page-image] Not an image of this page, no fetch for', data.url);
    return null;
  }
  return await fetchImageInPage(data.url);
};
