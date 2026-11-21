import { describe, expect, it } from 'vitest';
import {
  base64ToBytes,
  bytesToBase64,
  imageExtOf,
  MAX_DOWNLOAD_BASE64_LENGTH,
  MAX_DOWNLOAD_BYTES,
  readCapped,
} from './image-bytes';

const PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0,
]);

describe('base64', () => {
  it('round-trips every byte value, also past one piece of String.fromCharCode', () => {
    const bytes = new Uint8Array(0x8000 * 2 + 7).map((_, i) => (i * 31) % 256);
    const text = bytesToBase64(bytes);
    expect(text).toMatch(/^[A-Za-z0-9+/]+=*$/);
    expect(base64ToBytes(text)).toEqual(bytes);
    expect(base64ToBytes(bytesToBase64(new Uint8Array(0)))).toEqual(
      new Uint8Array(0),
    );
  });

  it('gives the length the cap allows for the largest image', () => {
    expect(bytesToBase64(new Uint8Array(MAX_DOWNLOAD_BYTES)).length).toBe(
      MAX_DOWNLOAD_BASE64_LENGTH,
    );
  });

  it('throws on text that is not base64', () => {
    expect(() => base64ToBytes('not base64!')).toThrow();
  });
});

describe('imageExtOf', () => {
  it('goes by the bytes, the Content-Type only for SVG', () => {
    expect(imageExtOf(PNG, 'text/html')).toBe('png');
    expect(
      imageExtOf(
        new TextEncoder().encode('<svg/>'),
        'image/svg+xml; charset=utf-8',
      ),
    ).toBe('svg');
    expect(
      imageExtOf(new TextEncoder().encode('<html>'), 'image/png'),
    ).toBeUndefined();
    expect(
      imageExtOf(new TextEncoder().encode('<html>'), null),
    ).toBeUndefined();
  });
});

describe('readCapped', () => {
  const streamOf = (chunks: Uint8Array[]) => {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        const next = chunks.shift();
        if (next) controller.enqueue(next);
        else controller.close();
      },
      cancel() {
        cancelled = true;
      },
    });
    return { body, cancelled: () => cancelled };
  };

  it('reads a body of at most the cap', async () => {
    const { body } = streamOf([PNG.slice(0, 4), PNG.slice(4)]);
    expect(await readCapped(new Response(body), PNG.length)).toEqual(PNG);
  });

  it('stops reading once there is more than the cap', async () => {
    const stream = streamOf([
      new Uint8Array(6),
      new Uint8Array(6),
      new Uint8Array(6),
    ]);
    expect(await readCapped(new Response(stream.body), 10)).toBeNull();
    expect(stream.cancelled()).toBe(true);
  });

  it('reads nothing when the Content-Length says more than the cap', async () => {
    const resp = new Response(PNG, { headers: { 'Content-Length': '11' } });
    expect(await readCapped(resp, 10)).toBeNull();
  });

  it('gives no bytes for no body', async () => {
    expect(await readCapped(new Response(null), 10)).toEqual(new Uint8Array(0));
  });
});
