import log from '@/utils/logger';
import { isPrivateHost } from '@/utils/private-host';

/*
 * Downloading an image the page names, from the background, for "Save images
 * to Logseq" (logseq/image-assets.ts). The URL is the page's, and the
 * extension can fetch any host (`<all_urls>`, CORS does not stop it): so only
 * http(s), no host of this machine or the local network, no redirects, no
 * cookies, no Referer, a size cap while reading, a timeout, and nothing is
 * decoded before its header says a size it can take.
 *
 * DNS rebinding (a public name that resolves to a local address) cannot be
 * blocked from an extension without new permissions: hosts are checked as
 * written in the URL. What is left is a credential-less GET whose response
 * only goes to the user's own graph, never back to the page.
 */

/** An image downloaded from a page. */
export interface ImageFile {
  bytes: Uint8Array;
  /** File extension, lower case, without the dot: `png`, `jpg`, ... */
  ext: string;
  /** A file name for it, from its URL, without extension: [A-Za-z0-9_-] only. */
  name: string;
}

/** Larger downloads are not used: the download stops as soon as it has more. */
export const MAX_DOWNLOAD_BYTES = 8 * 1024 * 1024;
/**
 * An image with more pixels is never decoded (24 MP, about 96 MB once
 * decoded): a small file can say it is a huge image.
 */
export const MAX_DECODE_PIXELS = 24_000_000;
const DOWNLOAD_TIMEOUT_MS = 15_000;

export const MIME_BY_EXT: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  bmp: 'image/bmp',
  svg: 'image/svg+xml',
};

const startsWith = (bytes: Uint8Array, signature: number[], offset = 0) =>
  signature.every((b, i) => bytes[offset + i] === b);

const ascii = (text: string) => [...text].map((c) => c.charCodeAt(0));

/** The kind of image the bytes are, by their first bytes. */
export const sniffImageExt = (bytes: Uint8Array): string | undefined => {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47])) return 'png';
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'jpg';
  if (startsWith(bytes, ascii('GIF8'))) return 'gif';
  if (startsWith(bytes, ascii('RIFF')) && startsWith(bytes, ascii('WEBP'), 8)) return 'webp';
  if (startsWith(bytes, ascii('ftypavif'), 4)) return 'avif';
  if (startsWith(bytes, ascii('BM'))) return 'bmp';
  return undefined;
};

/** The width and height an image's header gives, or null when it cannot be read. */
export const imageDimensions = (
  bytes: Uint8Array,
): { width: number; height: number } | null => {
  const be16 = (i: number) => (bytes[i] << 8) | bytes[i + 1];
  const le16 = (i: number) => bytes[i] | (bytes[i + 1] << 8);
  const le24 = (i: number) => bytes[i] | (bytes[i + 1] << 8) | (bytes[i + 2] << 16);
  const be32 = (i: number) => ((bytes[i] << 24) >>> 0) + ((bytes[i + 1] << 16) | (bytes[i + 2] << 8) | bytes[i + 3]);
  const le32 = (i: number) => (bytes[i] | (bytes[i + 1] << 8) | (bytes[i + 2] << 16) | (bytes[i + 3] << 24));
  const size = (width: number, height: number) =>
    width > 0 && height > 0 ? { width, height } : null;

  switch (sniffImageExt(bytes)) {
    case 'png':
      return bytes.length >= 24 && startsWith(bytes, ascii('IHDR'), 12) ? size(be32(16), be32(20)) : null;
    case 'gif':
      return bytes.length >= 10 ? size(le16(6), le16(8)) : null;
    case 'bmp':
      return bytes.length >= 26 ? size(Math.abs(le32(18)), Math.abs(le32(22))) : null;
    case 'webp':
      if (startsWith(bytes, ascii('VP8 '), 12) && bytes.length >= 30) {
        return size(le16(26) & 0x3fff, le16(28) & 0x3fff);
      }
      if (startsWith(bytes, ascii('VP8L'), 12) && bytes.length >= 25) {
        const [b0, b1, b2, b3] = [bytes[21], bytes[22], bytes[23], bytes[24]];
        return size(1 + (((b1 & 0x3f) << 8) | b0), 1 + (((b3 & 0xf) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6)));
      }
      if (startsWith(bytes, ascii('VP8X'), 12) && bytes.length >= 30) {
        return size(1 + le24(24), 1 + le24(27));
      }
      return null;
    case 'jpg': {
      // The first start-of-frame marker has the size.
      let i = 2;
      while (i + 9 < bytes.length) {
        if (bytes[i] !== 0xff) return null;
        const marker = bytes[i + 1];
        if (marker === 0xff) {
          i++;
          continue;
        }
        if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
          return size(be16(i + 7), be16(i + 5));
        }
        if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) {
          i += 2;
          continue;
        }
        i += 2 + be16(i + 2);
      }
      return null;
    }
    default:
      // AVIF and anything else: not read, so never decoded.
      return null;
  }
};

/** A file name from the last part of the URL's path: [A-Za-z0-9_-], or `image`. */
export const imageName = (url: string): string => {
  let base = '';
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'data:') {
      base = decodeURIComponent(parsed.pathname.split('/').pop() ?? '');
    }
  } catch {
    // not a URL: `image`
  }
  const name = base
    .replace(/\.[^.]*$/, '')
    .replace(/[^A-Za-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
  return name || 'image';
};

// ---- Which URLs are fetched ----------------------------------------------------

/**
 * Whether the background may download the image at `url` for a clip of the
 * page `pageUrl`. The URL comes from the page, and the extension can fetch
 * any host: only http(s) without credentials in it, and no host of this
 * machine or the local network (Logseq's own API, a router), unless the page
 * itself is on that origin.
 */
export const isFetchableImageUrl = (url: string, pageUrl?: string): boolean => {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
  if (parsed.username || parsed.password) return false;
  if (!isPrivateHost(parsed.hostname)) return true;
  try {
    return !!pageUrl && new URL(pageUrl).origin === parsed.origin;
  } catch {
    return false;
  }
};

/** The body of `resp`, or null once it has more than `cap` bytes (it stops reading then). */
const readCapped = async (resp: Response, cap: number): Promise<Uint8Array | null> => {
  if (Number(resp.headers.get('content-length')) > cap) {
    await resp.body?.cancel().catch(() => {});
    return null;
  }
  if (!resp.body) return new Uint8Array(0);
  const reader = resp.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > cap) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, at);
    at += chunk.length;
  }
  return bytes;
};

/**
 * The image at `url`, or null when it cannot be had: a URL that is not
 * fetched (`isFetchableImageUrl`), a redirect, a failed or refused request
 * (hosts that check the Referer refuse it), not an image, or larger than
 * MAX_DOWNLOAD_BYTES. No cookies and no Referer are sent, and it gives up
 * after DOWNLOAD_TIMEOUT_MS.
 *
 * Redirects are not followed (`redirect: 'error'`): only the URL that was
 * checked is requested. Following them would request a target that is checked
 * only afterwards, and `redirect: 'manual'` gives no Location to check first
 * (that needs the webRequest permission).
 */
export const downloadImage = async (url: string, pageUrl?: string): Promise<ImageFile | null> => {
  if (!isFetchableImageUrl(url, pageUrl)) return null;

  try {
    const resp = await fetch(url, {
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      redirect: 'error',
      signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
    });
    // Defence in depth: `redirect: 'error'` rejects a redirect already.
    if (!resp.ok || resp.redirected) {
      await resp.body?.cancel().catch(() => {});
      return null;
    }
    const bytes = await readCapped(resp, MAX_DOWNLOAD_BYTES);
    if (!bytes || bytes.length === 0) return null;

    const type = resp.headers.get('content-type')?.split(';')[0].trim().toLowerCase() ?? '';
    // The bytes decide, the header only for what has no signature (SVG).
    const ext = sniffImageExt(bytes) ?? (type === 'image/svg+xml' ? 'svg' : undefined);
    if (!ext) return null;
    return { bytes, ext, name: imageName(url) };
  } catch (error) {
    log.debug('[image-download] Could not download', url, error);
    return null;
  }
};

/**
 * `image` decoded, or null. Never decoded: an image whose header does not say
 * its size (AVIF, SVG, a broken header) or says more than MAX_DECODE_PIXELS.
 *
 * The header can disagree with the decoder (a lying IHDR, several JPEG
 * frame markers, EXIF orientation), so the decoder is told the size to make
 * (`resizeWidth`/`resizeHeight`, from the header): its bitmap is never larger
 * than that. A browser that does not resize gives the bitmap at its own size;
 * a bitmap larger than the header said, either way round, is dropped before
 * anything draws it. Animated images give their first frame. The caller
 * closes the bitmap.
 */
export const decodeImage = async (image: ImageFile): Promise<ImageBitmap | null> => {
  if (typeof createImageBitmap !== 'function') return null;
  const declared = imageDimensions(image.bytes);
  if (!declared || declared.width * declared.height > MAX_DECODE_PIXELS) {
    log.debug('[image-download] Not decoded, size unknown or too large', declared);
    return null;
  }
  const { width: resizeWidth, height: resizeHeight } = declared;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(
      new Blob([image.bytes as BlobPart], { type: MIME_BY_EXT[image.ext] }),
      { resizeWidth, resizeHeight, resizeQuality: 'high' },
    );
  } catch (error) {
    log.debug('[image-download] Could not decode the image', error);
    return null;
  }
  const within = (width: number, height: number) =>
    (bitmap.width <= width && bitmap.height <= height) ||
    (bitmap.width <= height && bitmap.height <= width);
  if (!within(declared.width, declared.height) || bitmap.width * bitmap.height > MAX_DECODE_PIXELS) {
    log.debug('[image-download] Decoded larger than its header said', bitmap.width, bitmap.height);
    bitmap.close?.();
    return null;
  }
  return bitmap;
};
