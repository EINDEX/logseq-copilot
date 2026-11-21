import type { ClipBlock } from '@/utils/clip-template';
import log from '@/utils/logger';
import { decodeImage, downloadImage, MIME_BY_EXT, type ImageFile } from '../image-download';
import { fetchImageFromTab } from '../page-image';

export type { ImageFile } from '../image-download';

/*
 * "Save images to Logseq" (experimental): the images of a clip are downloaded
 * and stored in the graph's assets, and the clip shows the stored file instead
 * of the remote URL. Each image is asked of the clip's tab first, as the page
 * gets it (../page-image.ts), then downloaded by the background itself
 * (../image-download.ts). Whatever goes wrong with an image (download, size,
 * upload), the clip keeps its remote URL and is saved all the same.
 */

/** How a clip shows an image stored in the graph. */
export type AssetRef =
  /** A file graph: `![label](path)`, the path relative to a page. */
  | { kind: 'path'; path: string }
  /** A DB graph: the Asset node, as `[[uuid]]`. */
  | { kind: 'ref'; uuid: string };

/** What a Logseq service needs to store images. */
export interface ImageAssetStore {
  /** The largest image, in bytes, `saveImageAsset` can store in one request. */
  readonly imageAssetLimit: number;
  /**
   * Store the image in the graph's assets. `title` is the image's alt text
   * (a DB graph names the Asset with it). Throws when it is not stored.
   */
  saveImageAsset(image: ImageFile, title: string): Promise<AssetRef>;
}

/** Images of one clip that are stored at most: the others keep their URL. */
export const MAX_IMAGES_PER_CLIP = 10;

// ---- Markdown images ---------------------------------------------------------

/** One `![label](dest)` in a text: where it is, and its two parts as written. */
export interface MarkdownImage {
  start: number;
  end: number;
  label: string;
  dest: string;
}

/** Number of backslashes right before `index`. */
const backslashesBefore = (text: string, index: number) => {
  let count = 0;
  while (index - count - 1 >= 0 && text[index - count - 1] === '\\') count++;
  return count;
};

/**
 * The images of Markdown as written by the clip (turndown, `imageMarkdown`):
 * `![label](dest)` on one line, label and destination escaped with
 * backslashes, no title. An escaped `\[` or `\!` is text, not an image.
 */
export const findImages = (text: string): MarkdownImage[] => {
  const images: MarkdownImage[] = [];
  let from = 0;
  for (;;) {
    const start = text.indexOf('![', from);
    if (start === -1) return images;
    from = start + 2;
    if (backslashesBefore(text, start) % 2 === 1) continue;

    // The label: up to the first `]` that is not escaped.
    let i = start + 2;
    while (i < text.length && text[i] !== ']' && text[i] !== '\n') {
      i += text[i] === '\\' ? 2 : 1;
    }
    if (text[i] !== ']' || text[i + 1] !== '(') continue;
    const label = text.slice(start + 2, i);

    // The destination: up to the `)` that closes it, pairs of `()` inside.
    let j = i + 2;
    let depth = 0;
    while (j < text.length && !/\s/.test(text[j])) {
      if (text[j] === '\\') j++;
      else if (text[j] === '(') depth++;
      else if (text[j] === ')') {
        if (depth === 0) break;
        depth--;
      }
      j++;
    }
    if (text[j] !== ')' || j === i + 2) continue;
    images.push({ start, end: j + 1, label, dest: text.slice(i + 2, j) });
    from = j + 1;
  }
};

/** The URL a destination written by `escapeForLogseq` (`linkDest`) stands for. */
export const destUrl = (dest: string) => dest.replace(/\\\)/g, ')');

/** `text` with each image that `replace` returns text for replaced by that text. */
export const replaceImages = (
  text: string,
  replace: (image: MarkdownImage) => string | undefined,
): string => {
  let out = '';
  let at = 0;
  for (const image of findImages(text)) {
    const replacement = replace(image);
    if (replacement === undefined) continue;
    out += text.slice(at, image.start) + replacement;
    at = image.end;
  }
  return out + text.slice(at);
};

/** The Markdown that shows a stored image where `![label](...)` was. */
export const assetMarkdown = (ref: AssetRef, label: string) =>
  ref.kind === 'path' ? `![${label}](${ref.path})` : `[[${ref.uuid}]]`;

/** `label` as written (escaped like `linkText`) back to plain text, one line. */
export const unescapeLabel = (label: string) =>
  label.replace(/\\(.)/g, '$1').replace(/\s+/g, ' ').trim();

// ---- Storing -------------------------------------------------------------------

const SAFE_NAME = /^[A-Za-z0-9_-]{1,40}$/;

/**
 * Throws unless `image` is safe to name a file of the graph after: its name
 * from `imageName`, a known extension, some bytes. The stores check it again,
 * whatever made the ImageFile: the name goes into a path and a git patch.
 */
export const assertStorableImage = (image: ImageFile) => {
  if (
    !SAFE_NAME.test(image.name) ||
    !Object.prototype.hasOwnProperty.call(MIME_BY_EXT, image.ext) ||
    image.bytes.length === 0
  ) {
    throw new Error('Not an image file the graph can take.');
  }
};

/** Quality of a re-encoded image. */
const QUALITY = 0.82;

/**
 * `image` if it is at most `limit` bytes. A larger still image is made smaller
 * to fit: drawn at a smaller size and encoded as WebP (JPEG where the browser
 * cannot write WebP). Null when it does not fit: an animated GIF or an SVG is
 * never re-encoded, nor anything where the background has no OffscreenCanvas,
 * nor anything `decodeImage` does not decode (too many pixels, unknown size).
 */
export const fitImage = async (
  image: ImageFile,
  limit: number,
): Promise<ImageFile | null> => {
  if (image.bytes.length <= limit) return image;
  if (image.ext === 'gif' || image.ext === 'svg') return null;
  if (typeof OffscreenCanvas === 'undefined' || typeof createImageBitmap !== 'function') {
    return null;
  }
  const bitmap = await decodeImage(image);
  if (!bitmap) return null;

  try {
    const shrink = Math.min(1, Math.sqrt(limit / image.bytes.length));
    for (const scale of [1, shrink, shrink * 0.7, shrink * 0.5]) {
      const width = Math.max(1, Math.round(bitmap.width * scale));
      const height = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = new OffscreenCanvas(width, height);
      const context = canvas.getContext('2d');
      if (!context) return null;
      context.drawImage(bitmap, 0, 0, width, height);
      let blob = await canvas.convertToBlob({ type: 'image/webp', quality: QUALITY });
      if (blob.type !== 'image/webp') {
        blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: QUALITY });
      }
      if (blob.size <= limit) {
        return {
          bytes: new Uint8Array(await blob.arrayBuffer()),
          ext: blob.type === 'image/webp' ? 'webp' : 'jpg',
          name: image.name,
        };
      }
    }
    return null;
  } catch (error) {
    log.debug('[image-assets] Could not make the image smaller', error);
    return null;
  } finally {
    bitmap.close?.();
  }
};

// ---- A clip ----------------------------------------------------------------------

const mapBlocks = (block: ClipBlock, map: (content: string) => string): ClipBlock => ({
  ...block,
  content: map(block.content),
  children: block.children.map((child) => mapBlocks(child, map)),
});

const collectImages = (block: ClipBlock, into: MarkdownImage[] = []) => {
  into.push(...findImages(block.content));
  block.children.forEach((child) => collectImages(child, into));
  return into;
};

/**
 * The clip `root` with the images of the clipped content (`data`: the
 * selection as Markdown, before the template) stored in the graph: each one
 * shows the stored file. Images of the template itself are left alone, and so
 * is every image that cannot be stored. Never throws: on any failure the
 * blocks come back as they were.
 */
export const saveClipImages = async (
  root: ClipBlock,
  data: string,
  store: ImageAssetStore,
  /** The page clipped: its own origin may be a local one (`isFetchableImageUrl`). */
  pageUrl?: string,
  /** The tab of the page clipped: it is asked for each image first. */
  tabId?: number,
): Promise<ClipBlock> => {
  try {
    const clipped = new Set(findImages(data).map((image) => image.dest));
    if (clipped.size === 0) return root;

    // Each destination once, in order, the labels it is shown with.
    const labels = new Map<string, string>();
    for (const image of collectImages(root)) {
      if (clipped.has(image.dest) && !labels.has(image.dest)) {
        labels.set(image.dest, image.label);
      }
    }

    const stored = new Map<string, AssetRef>();
    for (const [dest, label] of [...labels].slice(0, MAX_IMAGES_PER_CLIP)) {
      const ref = await storeImage(destUrl(dest), unescapeLabel(label), store, pageUrl, tabId);
      if (ref) stored.set(dest, ref);
    }
    if (stored.size === 0) return root;

    return mapBlocks(root, (content) =>
      replaceImages(content, (image) => {
        const ref = stored.get(image.dest);
        return ref && assetMarkdown(ref, image.label);
      }),
    );
  } catch (error) {
    log.warn('[image-assets] The clip keeps the URLs of its images', error);
    return root;
  }
};

/**
 * The image at `url`: as the page of tab `tabId` gets it when the clip has a
 * tab and that tab is still on `pageUrl`, otherwise (or when the page cannot
 * give it) downloaded by the background itself, without cookies or
 * redirects. Null when neither has it.
 */
const getImage = async (
  url: string,
  pageUrl?: string,
  tabId?: number,
): Promise<ImageFile | null> =>
  // Only with the page clipped: the tab answers only while it is still on it.
  (tabId !== undefined && tabId >= 0 && pageUrl
    ? await fetchImageFromTab(tabId, url, pageUrl)
    : null) ??
  (await downloadImage(url, pageUrl));

/** Download, fit and store one image. Null, never a throw, when it is not stored. */
const storeImage = async (
  url: string,
  title: string,
  store: ImageAssetStore,
  pageUrl?: string,
  tabId?: number,
): Promise<AssetRef | null> => {
  const downloaded = await getImage(url, pageUrl, tabId);
  if (!downloaded) {
    log.debug('[image-assets] Keeps the URL, no image at', url);
    return null;
  }
  const image = await fitImage(downloaded, store.imageAssetLimit);
  if (!image) {
    log.debug('[image-assets] Keeps the URL, too large:', url, downloaded.bytes.length);
    return null;
  }
  try {
    return await store.saveImageAsset(image, title);
  } catch (error) {
    log.warn('[image-assets] Keeps the URL, Logseq did not store', url, error);
    return null;
  }
};
