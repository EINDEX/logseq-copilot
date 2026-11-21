/**
 * "Save images to Logseq" (experimental, background/logseq/image-assets.ts)
 * against a real Logseq, for both graph types: a clip's images go to the
 * graph's assets, and every image that cannot (missing, not an image, too
 * large) keeps its URL without failing the clip. With the setting off, the
 * clip is what it always was. Images are served by a local HTTP server.
 */
import { afterAll, beforeAll, describe, expect, inject, test } from 'vitest';
import { fakeBrowser } from 'wxt/testing';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import {
  logseqAuthTokenItem,
  logseqHostNameItem,
  logseqPortItem,
  saveImagesToLogseqItem,
  templates,
} from '@/utils/storage';
import { imageMarkdown } from '@/utils/utils';
import { clipToLogseq } from '@/entrypoints/background/clip';
import { blockTexts } from '@/entrypoints/background/logseq/clip-blocks';
import { FILE_GRAPH_IMAGE_LIMIT } from '@/entrypoints/background/logseq/markdown/image-store';
import { MAX_DOWNLOAD_BYTES } from '@/entrypoints/background/image-download';

const variant = inject('logseqVariant');
const TEST_PAGE = 'Copilot Test Page';

const api = async (method: string, args: unknown[] = []) => {
  const resp = await fetch(`${inject('logseqApi')}/api`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${inject('logseqToken')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ method, args }),
  });
  const text = await resp.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};

/** A PNG of `width` x `height`: one color, or noise that does not compress. */
const png = (width: number, height: number, noise = false) => {
  const crc = (buf: Buffer) => {
    let c = ~0;
    for (const byte of buf) {
      c ^= byte;
      for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
    }
    return ~c >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const head = Buffer.alloc(4);
    head.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const tail = Buffer.alloc(4);
    tail.writeUInt32BE(crc(body));
    return Buffer.concat([head, body, tail]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.set([8, 2, 0, 0, 0], 8);
  const row = (y: number) =>
    Buffer.concat([
      Buffer.from([0]),
      noise
        ? crypto.randomBytes(width * 3)
        : Buffer.from(Array.from({ length: width }, (_, x) => [x * 4, y * 4, 160]).flat()),
    ]);
  const raw = Buffer.concat(Array.from({ length: height }, (_, y) => row(y)));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 0 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
};

const PHOTO = png(64, 48);
const OTHER = png(32, 32);
// Larger than any graph takes; Node has no OffscreenCanvas to make it smaller.
const HUGE = png(600, 600, true);
/** A 16x9 WebP (cwebp -q 80), what the extension makes of a large image. */
const WEBP = Buffer.from(
  'UklGRlQAAABXRUJQVlA4IEgAAADQAQCdASoQAAkAAUAmJbACdAEOu4iZAAD+/GvXdmh+L/yzxE/iyNapfr/5MV/hW7a/4U2rMl/+/f4B/zVr7r//3WGkvmoAAAA=',
  'base64',
);

let server: http.Server;
let base: string;
/** Paths the image server was asked for. */
const requested: string[] = [];
/** What /endless.png sent before the connection closed. */
const endless = { sent: 0, closed: false };
let target: http.Server;
let targetBase: string;
/** Paths the redirect target was asked for. */
const targetRequested: string[] = [];

const location = { clipNoteLocation: 'customPage', clipNoteCustomPage: TEST_PAGE };
const FLAT = { id: 'img-flat', name: 'Images', content: '{{content}}', ...location };

beforeAll(async () => {
  fakeBrowser.reset();
  const apiUrl = new URL(inject('logseqApi'));
  await logseqHostNameItem.setValue(apiUrl.hostname);
  await logseqPortItem.setValue(Number(apiUrl.port));
  await logseqAuthTokenItem.setValue(inject('logseqToken'));
  await templates.setValue([FLAT]);

  server = http.createServer((req, res) => {
    requested.push(req.url ?? '');
    const send = (type: string, body: Buffer | string) => {
      res.writeHead(200, { 'Content-Type': type });
      res.end(body);
    };
    if (req.url?.startsWith('/endless.png')) {
      // No Content-Length, never ends: only the client can stop it.
      res.writeHead(200, { 'Content-Type': 'image/png' });
      endless.sent = 0;
      endless.closed = false;
      res.on('close', () => (endless.closed = true));
      const chunk = Buffer.concat([PHOTO, Buffer.alloc(256 * 1024 - PHOTO.length)]);
      const write = () => {
        while (!res.destroyed && endless.sent < 200 * 1024 * 1024) {
          endless.sent += chunk.length;
          if (!res.write(chunk)) return void res.once('drain', write);
        }
      };
      return write();
    }
    if (req.url?.startsWith('/redirect.png')) {
      res.writeHead(302, { Location: `${targetBase}/photo.png?redirected` });
      return res.end();
    }
    if (req.url?.startsWith('/photo.png')) return send('image/png', PHOTO);
    if (req.url?.startsWith('/other.png')) return send('image/png', OTHER);
    if (req.url?.startsWith('/huge.png')) return send('image/png', HUGE);
    if (req.url?.startsWith('/api/titles/347/backdrop')) return send('image/webp', WEBP);
    if (req.url?.startsWith('/page.png')) return send('text/html', '<p>not an image</p>');
    res.writeHead(404);
    res.end();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  // Another origin on this machine, where /redirect.png points.
  target = http.createServer((req, res) => {
    targetRequested.push(req.url ?? '');
    res.writeHead(200, { 'Content-Type': 'image/png' });
    res.end(PHOTO);
  });
  await new Promise<void>((resolve) => target.listen(0, '127.0.0.1', resolve));
  targetBase = `http://127.0.0.1:${(target.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await saveImagesToLogseqItem.setValue(false);
  await new Promise((resolve) => server.close(resolve));
  await new Promise((resolve) => target.close(resolve));
});

/**
 * The text of the block a flat clip of `pageUrl` wrote. The images are on
 * 127.0.0.1, which is only fetched for a page of that origin.
 */
const clipText = async (data: string, pageUrl = `${base}/article`) => {
  const clip = await clipToLogseq({ url: pageUrl, title: 'Images', data, templateId: FLAT.id });
  const block = await api('logseq.Editor.getBlock', [clip.rootUuid]);
  return blockTexts(block)[0] ?? '';
};

const graphDir = async () => {
  if (variant === 'file') return (await api('logseq.App.getCurrentGraph')).path as string;
  // A DB graph's assets folder: where write_assetsdir_file puts its files.
  const written = await api('logseq.App.write_assetsdir_file', ['probe.txt', 'x', '']);
  return path.dirname(path.dirname(String(written)));
};

describe(`save images to Logseq (${variant} graph)`, () => {
  test('with the setting off, a clip keeps the URLs of its images', async () => {
    await saveImagesToLogseqItem.setValue(false);
    const data = `Look ${imageMarkdown('a photo', `${base}/photo.png?off`)} here`;
    expect(await clipText(data)).toBe(data);
  });

  test('an image goes to the assets and the clip shows the stored file', async () => {
    await saveImagesToLogseqItem.setValue(true);
    const url = `${base}/photo.png?on`;
    const text = await clipText(`Look ${imageMarkdown('a [photo]', url)} here`);
    expect(text).not.toContain(base);
    const dir = await graphDir();

    if (variant === 'file') {
      const match = text.match(/^Look !\[a \\\[photo\\\]\]\(\.\.\/assets\/(photo_\d+_[a-z0-9]+\.png)\) here$/);
      expect(match, text).not.toBeNull();
      const file = path.join(dir, 'assets', match![1]);
      expect(fs.readFileSync(file).equals(PHOTO)).toBe(true);
      // Nothing is left in the graph but the image.
      expect(fs.readdirSync(path.join(dir, 'assets')).some((f) => f.endsWith('.patch'))).toBe(false);
    } else {
      const match = text.match(/^Look \[\[([0-9a-f-]{36})\]\] here$/);
      expect(match, text).not.toBeNull();
      const uuid = match![1];
      const asset = await api('logseq.Editor.getBlock', [uuid]);
      expect(asset.title).toBe('a photo');
      expect(asset[':logseq.property.asset/type'] ?? asset.properties?.[':logseq.property.asset/type']).toBe('png');
      expect(asset.page?.title).toBe('Asset');
      expect(fs.readFileSync(path.join(dir, 'assets', `${uuid}.png`)).equals(PHOTO)).toBe(true);

      // The same image again: the Asset it already has.
      const again = await clipText(imageMarkdown('again', `${base}/photo.png?again`));
      expect(again).toBe(`[[${uuid}]]`);
    }
  });

  test('images that cannot be stored keep their URLs, and the clip is saved', async () => {
    await saveImagesToLogseqItem.setValue(true);
    const missing = imageMarkdown('missing', `${base}/missing.png`);
    const notImage = imageMarkdown('page', `${base}/page.png`);
    const huge = imageMarkdown('huge', `${base}/huge.png`);
    expect(HUGE.length).toBeGreaterThan(FILE_GRAPH_IMAGE_LIMIT);
    const data = `${missing} ${notImage} ${huge}`;
    expect(await clipText(data)).toBe(data);
  });

  test('an image on this machine, clipped from a page elsewhere, keeps its URL and is never requested', async () => {
    await saveImagesToLogseqItem.setValue(true);
    const data = `${imageMarkdown('api', `${base}/photo.png?elsewhere`)} ${imageMarkdown('logseq', `${inject('logseqApi')}/api`)}`;
    expect(await clipText(data, 'https://example.com/article')).toBe(data);
    expect(requested.some((url) => url.includes('elsewhere'))).toBe(false);
  });

  test('a redirect is not followed: the clip keeps the URL and the target is never requested', async () => {
    await saveImagesToLogseqItem.setValue(true);
    const data = imageMarkdown('moved', `${base}/redirect.png`);
    expect(await clipText(data)).toBe(data);
    expect(requested.some((url) => url.startsWith('/redirect.png'))).toBe(true);
    expect(targetRequested).toEqual([]);
  });

  test('a download that never ends is stopped, and the clip keeps the URL', async () => {
    await saveImagesToLogseqItem.setValue(true);
    const data = imageMarkdown('endless', `${base}/endless.png`);
    expect(await clipText(data)).toBe(data);
    await expect.poll(() => endless.closed, { timeout: 10_000 }).toBe(true);
    // The cap and what the sockets buffer, far from the 200 MB it would send.
    expect(endless.sent).toBeLessThan(MAX_DOWNLOAD_BYTES + 16 * 1024 * 1024);
  });

  test('an alt text with Logseq syntax makes no page, tag or property', async () => {
    await saveImagesToLogseqItem.setValue(true);
    const alt = '~:logseq.class/Tag [[Evil image page]] #evilimagetag {{embed x}} key:: value';
    const text = await clipText(imageMarkdown(alt, `${base}/photo.png?alt`));
    expect(text).not.toContain(base);
    for (const page of ['Evil image page', 'evilimagetag', 'key']) {
      expect(await api('logseq.Editor.getPage', [page]), page).toBeFalsy();
    }
    // DB graph: the Asset of this file is the one an earlier test made (same
    // checksum); a new one with this alt text is the next test.
    expect(text).toMatch(
      variant === 'db' ? /^\[\[[0-9a-f-]{36}\]\]$/ : /^!\[.*\]\(\.\.\/assets\/photo_\d+_[a-z0-9]+\.png\)$/,
    );
  });

  test('a new image with Logseq syntax in its alt text names its Asset as plain text (DB graph)', async () => {
    if (variant !== 'db') return;
    await saveImagesToLogseqItem.setValue(true);
    const alt = '~:logseq.class/Tag [[Other evil page]] #othereviltag';
    const text = await clipText(imageMarkdown(alt, `${base}/other.png`));
    const uuid = text.match(/^\[\[([0-9a-f-]{36})\]\]$/)?.[1];
    expect(uuid, text).toBeTruthy();
    const asset = await api('logseq.Editor.getBlock', [uuid]);
    expect(asset.title).toBe('~:logseq.class/Tag Other evil page othereviltag');
    for (const page of ['Other evil page', 'othereviltag']) {
      expect(await api('logseq.Editor.getPage', [page]), page).toBeFalsy();
    }
  });

  test('a WebP with a CJK alt text is stored though the graph has an invalid entity (DB graph)', async () => {
    if (variant !== 'db') return;
    await saveImagesToLogseqItem.setValue(true);
    // A block the graph's own validation refuses (a graph imported from a
    // file graph can have hundreds): Logseq takes the property, but an
    // import_edn after it fails ("1 validation error(s)").
    const holder = await api('logseq.Editor.appendBlockInPage', [TEST_PAGE, 'invalid holder']);
    await api('logseq.Editor.upsertBlockProperty', [holder.uuid, 'logseq.property.asset/checksum', 'x']);
    try {
      const alt = '赛博朋克：边缘行者背景图';
      const text = await clipText(imageMarkdown(alt, `${base}/api/titles/347/backdrop`));
      const uuid = text.match(/^\[\[([0-9a-f-]{36})\]\]$/)?.[1];
      expect(uuid, text).toBeTruthy();
      const asset = await api('logseq.DB.datascriptQuery', [
        `[:find (pull ?e [:block/title {:block/page [:db/ident]} {:block/tags [:db/ident]} :logseq.property.asset/type :logseq.property.asset/size :logseq.property.asset/checksum]) . :where [?e :block/uuid #uuid "${uuid}"]]`,
      ]);
      expect(asset).toMatchObject({
        title: alt,
        page: { ident: ':logseq.class/Asset' },
        tags: [{ ident: ':logseq.class/Asset' }],
        ':logseq.property.asset/type': 'webp',
        ':logseq.property.asset/size': WEBP.length,
        ':logseq.property.asset/checksum': crypto.createHash('sha256').update(WEBP).digest('hex'),
      });
      const dir = await graphDir();
      expect(fs.readFileSync(path.join(dir, 'assets', `${uuid}.webp`)).equals(WEBP)).toBe(true);
    } finally {
      await api('logseq.Editor.removeBlock', [holder.uuid]);
    }
  });
});
