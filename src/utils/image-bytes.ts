/*
 * Reading image bytes, shared by the background (image-download.ts) and the
 * content script (content/page-image.ts) for "Save images to Logseq": the
 * size cap while reading, the kind of image by its first bytes, and the
 * base64 form an image takes in a runtime message (Chrome sends messages as
 * JSON, where bytes do not survive).
 */

/** An image the content script fetched for the background, as a runtime message carries it. */
export interface PageImage {
  /** The bytes, base64. */
  base64: string;
  /** The Content-Type of the response ('' without one). */
  contentType: string;
}

/** Larger downloads are not used: the download stops as soon as it has more. */
export const MAX_DOWNLOAD_BYTES = 8 * 1024 * 1024;

/** The longest base64 text of an image of MAX_DOWNLOAD_BYTES at most. */
export const MAX_DOWNLOAD_BASE64_LENGTH = Math.ceil(MAX_DOWNLOAD_BYTES / 3) * 4;

export const MIME_BY_EXT: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  bmp: 'image/bmp',
  svg: 'image/svg+xml',
};

export const startsWith = (
  bytes: Uint8Array,
  signature: number[],
  offset = 0,
) => signature.every((b, i) => bytes[offset + i] === b);

export const ascii = (text: string) => [...text].map((c) => c.charCodeAt(0));

/** The kind of image the bytes are, by their first bytes. */
export const sniffImageExt = (bytes: Uint8Array): string | undefined => {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47])) return 'png';
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'jpg';
  if (startsWith(bytes, ascii('GIF8'))) return 'gif';
  if (startsWith(bytes, ascii('RIFF')) && startsWith(bytes, ascii('WEBP'), 8))
    return 'webp';
  if (startsWith(bytes, ascii('ftypavif'), 4)) return 'avif';
  if (startsWith(bytes, ascii('BM'))) return 'bmp';
  return undefined;
};

/**
 * The extension of an image with these bytes and this Content-Type, or
 * undefined when it is not one: the bytes decide, the header only for what
 * has no signature (SVG).
 */
export const imageExtOf = (
  bytes: Uint8Array,
  contentType: string | null | undefined,
) => {
  const type = contentType?.split(';')[0].trim().toLowerCase() ?? '';
  return sniffImageExt(bytes) ?? (type === 'image/svg+xml' ? 'svg' : undefined);
};

/** The body of `resp`, or null once it has more than `cap` bytes (it stops reading then). */
export const readCapped = async (
  resp: Response,
  cap: number,
): Promise<Uint8Array | null> => {
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

/** `bytes` as base64. */
export const bytesToBase64 = (bytes: Uint8Array): string => {
  let binary = '';
  // In pieces: String.fromCharCode takes a limited number of arguments.
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
};

/** The bytes of base64 `text`. Throws when it is not base64. */
export const base64ToBytes = (text: string): Uint8Array => {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
};
