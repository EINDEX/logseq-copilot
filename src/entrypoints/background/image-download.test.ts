import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  decodeImage,
  downloadImage,
  imageDimensions,
  imageName,
  isFetchableImageUrl,
  MAX_DECODE_PIXELS,
  MAX_DOWNLOAD_BYTES,
  sniffImageExt,
} from './image-download';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0]);

/** `size` bytes that start like a PNG of `width` x `height`. */
const pngOf = (size: number, width = 1000, height = 500) => {
  const bytes = new Uint8Array(Math.max(size, 24));
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
  bytes.set(new TextEncoder().encode('IHDR'), 12);
  new DataView(bytes.buffer).setUint32(16, width);
  new DataView(bytes.buffer).setUint32(20, height);
  return bytes;
};

describe('sniffImageExt and imageName', () => {
  it('knows images by their first bytes', () => {
    expect(sniffImageExt(PNG)).toBe('png');
    expect(sniffImageExt(JPEG)).toBe('jpg');
    expect(sniffImageExt(new TextEncoder().encode('GIF89a'))).toBe('gif');
    expect(sniffImageExt(new TextEncoder().encode('RIFF\0\0\0\0WEBPVP8 '))).toBe('webp');
    expect(sniffImageExt(new TextEncoder().encode('<html>'))).toBeUndefined();
  });

  it('names a file after the last part of the URL path', () => {
    expect(imageName('https://e.com/a/My Photo (1).final.png?x=1')).toBe('My_Photo_1_final');
    expect(imageName('https://e.com/')).toBe('image');
    expect(imageName('data:image/png;base64,AAAA')).toBe('image');
    expect(imageName('https://e.com/%E7%8C%AB.png')).toBe('image');
  });
});

describe('downloadImage', () => {
  const respond = (body: BodyInit | null, init: ResponseInit = {}) =>
    vi.fn(async (_url: string, _init?: RequestInit) => new Response(body, init));

  afterEach(() => vi.unstubAllGlobals());

  it('downloads an image without cookies or Referer', async () => {
    const fetchMock = respond(PNG, { headers: { 'Content-Type': 'image/png' } });
    vi.stubGlobal('fetch', fetchMock);
    expect(await downloadImage('https://e.com/a.png')).toEqual({
      bytes: PNG,
      ext: 'png',
      name: 'a',
    });
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
    });
  });

  it('goes by the bytes, not the header', async () => {
    vi.stubGlobal('fetch', respond(JPEG, { headers: { 'Content-Type': 'image/png' } }));
    expect((await downloadImage('https://e.com/a.png'))?.ext).toBe('jpg');
  });

  it('takes an SVG by its header', async () => {
    vi.stubGlobal('fetch', respond('<svg/>', { headers: { 'Content-Type': 'image/svg+xml' } }));
    expect((await downloadImage('https://e.com/a.svg'))?.ext).toBe('svg');
  });

  it.each([
    ['a refused request (e.g. a host that checks the Referer)', respond(PNG, { status: 403 })],
    ['a page that is not an image', respond('<html></html>', { headers: { 'Content-Type': 'text/html' } })],
    [
      'an image larger than the limit',
      respond(PNG, { headers: { 'Content-Length': String(MAX_DOWNLOAD_BYTES + 1) } }),
    ],
    ['a network error', vi.fn(async () => Promise.reject(new TypeError('Failed to fetch')))],
  ])('has nothing for %s', async (_, fetchMock) => {
    vi.stubGlobal('fetch', fetchMock);
    expect(await downloadImage('https://e.com/a.png')).toBeNull();
  });

  it('never fetches other schemes, a host of the local network, or a URL with credentials', async () => {
    const fetchMock = respond(PNG);
    vi.stubGlobal('fetch', fetchMock);
    for (const url of [
      'file:///etc/a.png',
      'data:image/png;base64,iVBORw0KGgo=',
      'javascript:alert(1)',
      'chrome-extension://abc/a.png',
      'ftp://e.com/a.png',
      'not a url',
      'http://127.0.0.1:12315/api',
      'http://localhost:12315/api',
      'http://192.168.1.1/admin.png',
      'http://169.254.169.254/latest/meta-data',
      'http://[::1]/a.png',
      'http://router/a.png',
      'https://user:pass@e.com/a.png',
    ]) {
      expect(await downloadImage(url), url).toBeNull();
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('downloads from a host of the local network when the page clipped is on that origin', async () => {
    const fetchMock = respond(PNG, { headers: { 'Content-Type': 'image/png' } });
    vi.stubGlobal('fetch', fetchMock);
    expect(await downloadImage('http://192.168.1.5:8080/a.png', 'http://192.168.1.5:8080/wiki')).not.toBeNull();
    expect(await downloadImage('http://192.168.1.5:9000/a.png', 'http://192.168.1.5:8080/wiki')).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('never follows a redirect: the browser fails the request, and no image comes of it', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.redirect === 'error') throw new TypeError('Failed to fetch (redirect)');
      return new Response(PNG, { headers: { 'Content-Type': 'image/png' } });
    });
    vi.stubGlobal('fetch', fetchMock);
    expect(await downloadImage('https://e.com/redirects.png')).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ redirect: 'error' });
  });

  it('drops a response that says it was redirected (defence in depth)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        const resp = new Response(PNG, { headers: { 'Content-Type': 'image/png' } });
        Object.defineProperty(resp, 'redirected', { value: true });
        Object.defineProperty(resp, 'url', { value: 'http://127.0.0.1:12315/api' });
        return resp;
      }),
    );
    expect(await downloadImage('https://e.com/a.png')).toBeNull();
  });

  it('stops reading a body without Content-Length once it has more than MAX_DOWNLOAD_BYTES', async () => {
    const chunk = new Uint8Array(1024 * 1024);
    chunk.set(PNG);
    let pulled = 0;
    const cancel = vi.fn();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) => {
        expect(init).toMatchObject({ credentials: 'omit', referrerPolicy: 'no-referrer' });
        expect(init?.signal).toBeInstanceOf(AbortSignal);
        // Endless: a body that never ends must not be read to the end.
        return new Response(
          new ReadableStream({
            pull: (c) => {
              pulled++;
              c.enqueue(chunk);
            },
            cancel,
          }),
          { headers: { 'Content-Type': 'image/png' } },
        );
      }),
    );
    expect(await downloadImage('https://e.com/endless.png')).toBeNull();
    expect(cancel).toHaveBeenCalled();
    expect(pulled * chunk.length).toBeLessThanOrEqual(MAX_DOWNLOAD_BYTES + 2 * chunk.length);
  });

  it('reads a body without Content-Length up to MAX_DOWNLOAD_BYTES', async () => {
    const chunk = new Uint8Array(1024 * 1024);
    chunk.set(PNG);
    let left = 3;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          new ReadableStream({ pull: (c) => (left-- > 0 ? c.enqueue(chunk) : c.close()) }),
        ),
      ),
    );
    expect((await downloadImage('https://e.com/a.png'))?.bytes.length).toBe(3 * chunk.length);
  });
});

describe('isFetchableImageUrl', () => {
  it('reads the host the way URL writes it: numeric and hex IPv4, IPv4 in IPv6', () => {
    for (const url of [
      'http://2130706433/',
      'http://0x7f.1/',
      'http://017700000001/',
      'http://[::ffff:127.0.0.1]/',
      'http://127.0.0.1.:12315/',
      'HTTP://LOCALHOST/',
    ]) {
      expect(isFetchableImageUrl(url), url).toBe(false);
    }
    expect(isFetchableImageUrl('https://e.com/a.png')).toBe(true);
  });
});

describe('imageDimensions', () => {
  const ascii = (text: string) => [...text].map((c) => c.charCodeAt(0));
  const bytes = (length: number, parts: [number, number[]][]) => {
    const out = new Uint8Array(length);
    for (const [at, values] of parts) out.set(values, at);
    return out;
  };

  it('reads the size from the header of PNG, GIF, BMP, JPEG and WebP', () => {
    expect(imageDimensions(pngOf(30, 640, 480))).toEqual({ width: 640, height: 480 });
    expect(imageDimensions(bytes(12, [[0, ascii('GIF89a')], [6, [0x40, 0x01, 0xf0, 0x00]]]))).toEqual({
      width: 320,
      height: 240,
    });
    // A top-down BMP has a negative height.
    expect(
      imageDimensions(bytes(30, [[0, ascii('BM')], [18, [0x10, 0, 0, 0]], [22, [0xf0, 0xff, 0xff, 0xff]]])),
    ).toEqual({ width: 16, height: 16 });
    // JPEG: an APP0 segment, then SOF0 with height 0x0258 (600) and width 0x0320 (800).
    expect(
      imageDimensions(
        bytes(40, [
          [0, [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0, 0]],
          [8, [0xff, 0xc0, 0x00, 0x11, 0x08, 0x02, 0x58, 0x03, 0x20]],
        ]),
      ),
    ).toEqual({ width: 800, height: 600 });
    const webp = (chunk: string, at: number, size: number[]) =>
      bytes(32, [[0, ascii('RIFF')], [8, ascii('WEBP')], [12, ascii(chunk)], [at, size]]);
    expect(imageDimensions(webp('VP8 ', 26, [0x80, 0x02, 0xe0, 0x01]))).toEqual({ width: 640, height: 480 });
    expect(imageDimensions(webp('VP8X', 24, [0x7f, 0x02, 0x00, 0xdf, 0x01, 0x00]))).toEqual({
      width: 640,
      height: 480,
    });
    // VP8L: 14 bits each, minus one: 639 = 0x27f, 479 = 0x1df.
    expect(imageDimensions(webp('VP8L', 20, [0x2f, 0x7f, 0xc2, 0x77, 0x00]))).toEqual({ width: 640, height: 480 });
  });

  it('has nothing for a header it cannot read', () => {
    expect(imageDimensions(new Uint8Array(4))).toBeNull();
    expect(imageDimensions(new TextEncoder().encode('\0\0\0\0ftypavif'))).toBeNull();
    expect(imageDimensions(pngOf(30, 0, 10))).toBeNull();
    expect(imageDimensions(JPEG)).toBeNull();
  });
});

describe('decodeImage', () => {
  afterEach(() => vi.unstubAllGlobals());

  const stubDecoder = (decoded = { width: 1000, height: 500 }) => {
    const close = vi.fn();
    const decode = vi.fn(async () => ({ ...decoded, close }));
    vi.stubGlobal('createImageBitmap', decode);
    return { decode, close };
  };

  it('tells the decoder the size its header says, so it never makes a larger bitmap', async () => {
    const { decode } = stubDecoder();
    expect(await decodeImage({ bytes: pngOf(100), ext: 'png', name: 'a' })).toMatchObject({ width: 1000 });
    expect(decode).toHaveBeenCalledTimes(1);
    expect((decode.mock.calls[0] as unknown[])[1]).toEqual({
      resizeWidth: 1000,
      resizeHeight: 500,
      resizeQuality: 'high',
    });
  });

  it('takes the bitmap of a browser that does not resize, when it is no larger than the header said (either way round)', async () => {
    stubDecoder({ width: 500, height: 1000 });
    expect(await decodeImage({ bytes: pngOf(100), ext: 'png', name: 'a' })).toMatchObject({ width: 500 });
  });

  it('never decodes more than MAX_DECODE_PIXELS by the header, nor a size it cannot read', async () => {
    const { decode } = stubDecoder();
    expect(await decodeImage({ bytes: pngOf(100, 50_000, 50_000), ext: 'png', name: 'a' })).toBeNull();
    expect(await decodeImage({ bytes: new Uint8Array(100), ext: 'avif', name: 'a' })).toBeNull();
    expect(decode).not.toHaveBeenCalled();
    expect(50_000 * 50_000).toBeGreaterThan(MAX_DECODE_PIXELS);
  });

  it.each([
    ['far larger (a lying header)', { width: 50_000, height: 50_000 }],
    ['one side larger', { width: 1001, height: 500 }],
    ['larger in area, the other way round', { width: 600, height: 1000 }],
  ])('drops a bitmap larger than its header said: %s', async (_, decoded) => {
    const { close } = stubDecoder(decoded);
    expect(await decodeImage({ bytes: pngOf(100), ext: 'png', name: 'a' })).toBeNull();
    expect(close).toHaveBeenCalled();
  });
});
