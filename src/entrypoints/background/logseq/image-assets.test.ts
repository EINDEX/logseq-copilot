import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildTurndownService, imageMarkdown } from '@/utils/utils';
import { escapeForLogseq } from '@/utils/logseq-format';
import type { ClipBlock } from '@/utils/clip-template';
import {
  assertStorableImage,
  assetMarkdown,
  destUrl,
  findImages,
  fitImage,
  MAX_IMAGES_PER_CLIP,
  replaceImages,
  saveClipImages,
  unescapeLabel,
  type ImageAssetStore,
  type ImageFile,
} from './image-assets';
import { MAX_DECODE_PIXELS } from '../image-download';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

describe('findImages', () => {
  it('finds the images the clip writes, with label and destination as written', () => {
    const text = `a ${imageMarkdown('x [1] \\ y', 'https://e.com/a b.png')} b ![](https://e.com/c.png)`;
    expect(findImages(text).map(({ label, dest }) => [label, dest])).toEqual([
      ['x \\[1\\] \\\\ y', 'https://e.com/a%20b.png'],
      ['', 'https://e.com/c.png'],
    ]);
  });

  it('keeps pairs of parentheses and escaped ones in the destination', () => {
    const md = imageMarkdown('w', 'https://en.wikipedia.org/wiki/Foo_(bar).png');
    expect(findImages(md)[0].dest).toBe('https://en.wikipedia.org/wiki/Foo_(bar).png');
    const odd = imageMarkdown('w', 'https://e.com/a).png');
    expect(findImages(odd)[0].dest).toBe('https://e.com/a\\).png');
    expect(destUrl(findImages(odd)[0].dest)).toBe('https://e.com/a).png');
  });

  it('finds the images of a clipped selection (turndown)', () => {
    const div = document.createElement('div');
    div.innerHTML = '<p>Text <img alt="a ] b" src="https://e.com/i.png"> more</p>';
    const md = buildTurndownService().turndown(div);
    expect(findImages(md).map((i) => i.dest)).toEqual(['https://e.com/i.png']);
  });

  it('does not take text for an image: escaped marks, page text, broken syntax', () => {
    // turndown escapes the brackets of page text, the block escape keeps them.
    const p = document.createElement('p');
    p.textContent = 'look ![x](https://e.com/y.png)';
    const pageText = escapeForLogseq(buildTurndownService().turndown(p), { context: 'block' });
    for (const text of [
      '\\![x](https://e.com/y.png)',
      pageText,
      '![x] (https://e.com/y.png)',
      '![x](https://e.com/y.png',
      '![x\n](https://e.com/y.png)',
      '![x]()',
    ]) {
      expect(findImages(text), text).toEqual([]);
    }
  });
});

describe('replaceImages and assetMarkdown', () => {
  it('replaces the images it is given text for, and nothing else', () => {
    const text = '![a](u1) and ![b](u2)';
    expect(replaceImages(text, (i) => (i.dest === 'u2' ? 'B' : undefined))).toBe('![a](u1) and B');
  });

  it('shows a stored image by path (file graph) or by reference (DB graph)', () => {
    expect(assetMarkdown({ kind: 'path', path: '../assets/a.png' }, 'x \\[1\\]')).toBe(
      '![x \\[1\\]](../assets/a.png)',
    );
    expect(assetMarkdown({ kind: 'ref', uuid: 'u-1' }, 'x')).toBe('[[u-1]]');
  });

  it('reads an escaped label back as plain text', () => {
    expect(unescapeLabel('x \\[1\\] \\\\ y')).toBe('x [1] \\ y');
  });
});

describe('assertStorableImage', () => {
  it('takes a name from imageName and a known extension', () => {
    expect(() => assertStorableImage({ bytes: PNG, ext: 'png', name: 'My_Photo-1' })).not.toThrow();
  });

  it.each([
    ['a path in the name', { name: '../../etc/x', ext: 'png' }],
    ['a space or a newline', { name: 'a b\nc', ext: 'png' }],
    ['an empty name', { name: '', ext: 'png' }],
    ['a long name', { name: 'a'.repeat(41), ext: 'png' }],
    ['an unknown extension', { name: 'a', ext: 'png/../x' }],
    ['an inherited key as extension', { name: 'a', ext: 'constructor' }],
  ])('refuses %s', (_, file) => {
    expect(() => assertStorableImage({ bytes: PNG, ...file })).toThrow();
  });

  it('refuses no bytes', () => {
    expect(() => assertStorableImage({ bytes: new Uint8Array(0), ext: 'png', name: 'a' })).toThrow();
  });
});

/** `size` bytes that start like a PNG of `width` x `height`. */
const pngOf = (size: number, width = 1000, height = 500) => {
  const bytes = new Uint8Array(Math.max(size, 24));
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
  bytes.set(new TextEncoder().encode('IHDR'), 12);
  new DataView(bytes.buffer).setUint32(16, width);
  new DataView(bytes.buffer).setUint32(20, height);
  return bytes;
};

describe('fitImage', () => {
  const image = (size: number, ext = 'png'): ImageFile => ({
    bytes: ext === 'png' ? pngOf(size) : new Uint8Array(size),
    ext,
    name: 'a',
  });

  /** An OffscreenCanvas whose encoded size follows its area: `bytesPerPixel`. */
  const stubCanvas = (bytesPerPixel: number, webp = true, decoded = { width: 1000, height: 500 }) => {
    const sizes: [number, number][] = [];
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ ...decoded, close() {} })));
    vi.stubGlobal(
      'OffscreenCanvas',
      class {
        constructor(
          public width: number,
          public height: number,
        ) {
          sizes.push([width, height]);
        }
        getContext() {
          return { drawImage() {} };
        }
        async convertToBlob({ type }: { type: string }) {
          const out = webp || type !== 'image/webp' ? type : 'image/png';
          return new Blob([new Uint8Array(Math.round(this.width * this.height * bytesPerPixel))], {
            type: out,
          });
        }
      },
    );
    return sizes;
  };

  afterEach(() => vi.unstubAllGlobals());

  it('keeps an image that fits as it is', async () => {
    const small = image(100);
    expect(await fitImage(small, 100)).toBe(small);
  });

  it('re-encodes a larger image as WebP at a smaller size until it fits', async () => {
    const sizes = stubCanvas(1);
    const fitted = await fitImage(image(1_000_000), 200_000);
    expect(fitted?.ext).toBe('webp');
    expect(fitted!.bytes.length).toBeLessThanOrEqual(200_000);
    expect(sizes[0]).toEqual([1000, 500]);
    expect(sizes.at(-1)![0]).toBeLessThan(1000);
  });

  it('writes JPEG where the browser cannot write WebP', async () => {
    stubCanvas(0.1, false);
    expect((await fitImage(image(1_000_000), 200_000))?.ext).toBe('jpg');
  });

  it('gives up when even the smallest try is too large', async () => {
    stubCanvas(100);
    expect(await fitImage(image(1_000_000), 1_000)).toBeNull();
  });

  it('never re-encodes a GIF (animation) or an SVG', async () => {
    stubCanvas(0.001);
    expect(await fitImage(image(1_000, 'gif'), 10)).toBeNull();
    expect(await fitImage(image(1_000, 'svg'), 10)).toBeNull();
  });

  it('never decodes an image whose header says more than MAX_DECODE_PIXELS (decompression bomb)', async () => {
    const sizes = stubCanvas(0.001);
    const bomb: ImageFile = { bytes: pngOf(1_000_000, 50_000, 50_000), ext: 'png', name: 'a' };
    expect(50_000 * 50_000).toBeGreaterThan(MAX_DECODE_PIXELS);
    expect(await fitImage(bomb, 200_000)).toBeNull();
    expect(createImageBitmap).not.toHaveBeenCalled();
    expect(sizes).toEqual([]);
  });

  it('never decodes an image whose size it cannot read (AVIF, a broken header)', async () => {
    stubCanvas(0.001);
    const avif: ImageFile = {
      bytes: new Uint8Array([...new TextEncoder().encode('\0\0\0\0ftypavif'), ...new Uint8Array(1000)]),
      ext: 'avif',
      name: 'a',
    };
    expect(await fitImage(avif, 10)).toBeNull();
    expect(await fitImage({ bytes: new Uint8Array(1000), ext: 'png', name: 'a' }, 10)).toBeNull();
    expect(createImageBitmap).not.toHaveBeenCalled();
  });

  it('decodes at the size its header says', async () => {
    stubCanvas(0.1);
    await fitImage(image(1_000_000), 200_000);
    expect(vi.mocked(createImageBitmap).mock.calls[0][1]).toMatchObject({ resizeWidth: 1000, resizeHeight: 500 });
  });

  it('draws nothing when the decoded image is larger than its header said', async () => {
    const sizes = stubCanvas(0.001, true, { width: 50_000, height: 50_000 });
    expect(await fitImage(image(1_000_000), 200_000)).toBeNull();
    expect(sizes).toEqual([]);
  });

  it('cannot make it smaller without OffscreenCanvas', async () => {
    vi.stubGlobal('OffscreenCanvas', undefined);
    expect(await fitImage(image(1_000), 10)).toBeNull();
  });
});

describe('saveClipImages', () => {
  const store = (overrides: Partial<ImageAssetStore> = {}) => ({
    imageAssetLimit: 1_000_000,
    saveImageAsset: vi.fn(async (image: ImageFile, _title: string) => ({
      kind: 'path' as const,
      path: `../assets/${image.name}.png`,
    })),
    ...overrides,
  });
  const fetchMock = vi.fn(async (url: string, _init?: RequestInit) =>
    url.includes('missing')
      ? new Response(null, { status: 404 })
      : new Response(PNG, { headers: { 'Content-Type': 'image/png' } }),
  );
  const block = (content: string, children: ClipBlock[] = []): ClipBlock => ({
    content,
    children,
  });

  beforeEach(() => {
    fetchMock.mockClear();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('stores the clipped images, wherever the template put them, each once', async () => {
    const cat = imageMarkdown('a cat', 'https://e.com/cat.png');
    const data = `${cat} and ${cat}`;
    const s = store();
    const root = block(`[Page](https://e.com/p) ${data}`, [block(`> ${data}`)]);
    const saved = await saveClipImages(root, data, s);
    expect(saved).toEqual(
      block('[Page](https://e.com/p) ![a cat](../assets/cat.png) and ![a cat](../assets/cat.png)', [
        block('> ![a cat](../assets/cat.png) and ![a cat](../assets/cat.png)'),
      ]),
    );
    expect(s.saveImageAsset).toHaveBeenCalledTimes(1);
    expect(s.saveImageAsset).toHaveBeenCalledWith(expect.anything(), 'a cat');
  });

  it("leaves the template's own images alone", async () => {
    const template = imageMarkdown('logo', 'https://e.com/logo.png');
    const data = imageMarkdown('', 'https://e.com/cat.png');
    const saved = await saveClipImages(block(`${template} ${data}`), data, store());
    expect(saved.content).toBe(`${template} ![](../assets/cat.png)`);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('keeps the URL of an image it cannot download or store', async () => {
    const missing = imageMarkdown('m', 'https://e.com/missing.png');
    const refused = imageMarkdown('r', 'https://e.com/refused.png');
    const s = store({
      saveImageAsset: vi.fn(async () => {
        throw new Error('413');
      }),
    });
    const data = `${missing} ${refused}`;
    expect((await saveClipImages(block(data), data, s)).content).toBe(data);
  });

  it('keeps the URL of an image on the local network, unless the page clipped is on that origin', async () => {
    const data = imageMarkdown('api', 'http://127.0.0.1:12315/api');
    expect((await saveClipImages(block(data), data, store(), 'https://evil.example/')).content).toBe(data);
    expect(fetchMock).not.toHaveBeenCalled();

    const local = imageMarkdown('chart', 'http://127.0.0.1:8080/chart.png');
    const saved = await saveClipImages(block(local), local, store(), 'http://127.0.0.1:8080/report');
    expect(saved.content).toBe('![chart](../assets/chart.png)');
  });

  it('a DB graph shows the stored image as a reference to its Asset', async () => {
    const data = imageMarkdown('a cat', 'https://e.com/cat.png');
    const s = store({ saveImageAsset: vi.fn(async () => ({ kind: 'ref' as const, uuid: 'u-1' })) });
    expect((await saveClipImages(block(`Look ${data}`), data, s)).content).toBe('Look [[u-1]]');
  });

  it(`stores ${MAX_IMAGES_PER_CLIP} images of a clip at most`, async () => {
    const data = Array.from({ length: MAX_IMAGES_PER_CLIP + 2 }, (_, i) =>
      imageMarkdown('', `https://e.com/${i}.png`),
    ).join(' ');
    const s = store();
    const saved = await saveClipImages(block(data), data, s);
    expect(s.saveImageAsset).toHaveBeenCalledTimes(MAX_IMAGES_PER_CLIP);
    expect(saved.content).toContain(`https://e.com/${MAX_IMAGES_PER_CLIP}.png`);
  });

  it('does nothing for a clip without images', async () => {
    const root = block('text only');
    expect(await saveClipImages(root, 'text only', store())).toBe(root);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
