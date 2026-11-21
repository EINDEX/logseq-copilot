import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import zlib from 'node:zlib';
import type { Page } from '@playwright/test';
import { expect, nonce, test, type Extension, type Logseq } from './fixtures';
import { fixtureImage } from './pages';

/*
 * "Save images to Logseq" for images only the page can have. The
 * background's own download (no cookies, no redirects, no host of this
 * machine unless it is the page's own origin) cannot get them; the page's
 * request, made by the content script, can:
 * - a URL without a file extension on the page's host that answers 302 to a
 *   login page without the session cookie, and the PNG with it;
 * - a URL on another host of this machine that serves anyone
 *   (`Access-Control-Allow-Origin: *`), which refuses a request with
 *   credentials.
 */

const PNG = fixtureImage();
const IMAGE_PATH = '/api/titles/347/backdrop';

/**
 * The fixture PNG with `id` after its end: another file for each test, so a
 * DB graph does not take it for the Asset an earlier test stored.
 */
const uniquePng = (id: string) => Buffer.concat([PNG, Buffer.from(id)]);

/**
 * A 320x480 PNG of about 460 KB (stored, not deflated): more than a DB graph
 * takes (270 KB), so the extension makes it a smaller WebP; less than a file
 * graph takes (760 KB). Its first row comes from `id`: another image, and
 * another WebP, for each test.
 */
const largePng = (id: string) => {
  const [width, height] = [320, 480];
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
  const seed = crypto.createHash('sha256').update(id).digest();
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const at = y * (width * 3 + 1) + 1 + x * 3;
      raw[at] = y === 0 ? seed[x % 32] : (x * 255) / width;
      raw[at + 1] = y === 0 ? seed[(x + 7) % 32] : (y * 255) / height;
      raw[at + 2] = 140;
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 0 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
};

/** The site: pages, login, the image behind the cookie. */
let site: http.Server;
let origin: string;
/** Requests for the image: with the session cookie or not. */
const imageRequests: { cookie: boolean }[] = [];
let session = '';
let sitePng = PNG;

/** Another origin on this machine: a media server for anyone, without cookies. */
let media: http.Server;
let mediaOrigin: string;
let mediaRequests = 0;
let mediaPng = PNG;

const listen = async (server: http.Server) => {
  // Port 0: whatever is free, never the Logseq ports (12315, 12399).
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
};

test.beforeAll(async () => {
  site = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (url.pathname === IMAGE_PATH) {
      const cookie =
        !!session && (req.headers.cookie ?? '').includes(`session=${session}`);
      imageRequests.push({ cookie });
      if (!cookie) {
        res.writeHead(302, {
          Location: `/login?next=${encodeURIComponent(IMAGE_PATH)}`,
        });
        return res.end();
      }
      // Never from a cache: every request has to bring the cookie.
      res.writeHead(200, {
        'Content-Type': 'image/png',
        'Cache-Control': 'no-store',
      });
      return res.end(sitePng);
    }
    if (url.pathname === '/login') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      return res.end(
        '<!doctype html><title>Sign in</title><form>Sign in</form>',
      );
    }
    if (url.pathname.startsWith('/titles/')) {
      const alt = url.searchParams.get('alt') ?? '';
      const src = url.searchParams.get('src') ?? IMAGE_PATH;
      res.writeHead(200, { 'Content-Type': 'text/html' });
      return res.end(`<!doctype html>
<html><head><meta charset="utf-8"><title>Title 347</title></head>
<body><h1>Title 347</h1><p>Backdrop below.</p>
<figure><img id="target-image" src="${src}" alt="${alt}" width="320" height="200"></figure>
</body></html>`);
    }
    res.writeHead(404);
    res.end();
  });
  origin = await listen(site);

  media = http.createServer((_req, res) => {
    mediaRequests++;
    res.writeHead(200, {
      'Content-Type': 'image/png',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
    });
    res.end(mediaPng);
  });
  mediaOrigin = await listen(media);
});

test.afterAll(async () => {
  await new Promise((resolve) => site.close(resolve));
  await new Promise((resolve) => media.close(resolve));
});

/** "Save images to Logseq" on, images clipped below the link of the page. */
const setUp = async (ext: Extension) => {
  await ext.connect();
  await ext.setStorage({
    saveImagesToLogseq: true,
    templates: [
      {
        id: 'image-outline',
        name: 'Image outline',
        content: '- [{{title}}]({{url}})\n  - {{content}}',
        clipNoteLocation: 'customPage',
        clipNoteCustomPage: 'Copilot Test Page',
      },
    ],
  });
};

/** The page's image, once the page shows it, and its URL. */
const shownImage = async (page: Page) => {
  await expect(page.locator('logseq-copilot-popup')).toBeAttached();
  const image = page.locator('#target-image');
  await expect
    .poll(() =>
      image.evaluate(
        (img: HTMLImageElement) => img.complete && img.naturalWidth,
      ),
    )
    .toBe(320);
  return {
    image,
    src: await image.evaluate((img: HTMLImageElement) => img.src),
  };
};

/** "Clip image" in the context menu; the text of the block it made in Logseq. */
const clipImage = async (
  page: Page,
  ext: Extension,
  logseq: Logseq,
  shown: Awaited<ReturnType<typeof shownImage>>,
  alt: string,
) => {
  await shown.image.click({ button: 'right' });
  await page.keyboard.press('Escape');
  await ext.sendToTab(page, 'content:quickCaptureImage', { srcUrl: shown.src });

  const stored = async () =>
    ((await ext.getStorage('highlights')) ?? []).filter(
      (h: any) => h.image?.src === shown.src && h.image?.alt === alt,
    );
  await expect
    .poll(async () => (await stored())[0]?.logseq?.nodeUuid, {
      timeout: 30_000,
    })
    .toBeTruthy();
  const [saved] = await stored();

  const text = (block: any): string =>
    String(block.content ?? block.title ?? '');
  const children = async (): Promise<string[]> =>
    (
      (
        await logseq.callApi('logseq.Editor.getBlock', [
          saved.logseq.nodeUuid,
          { includeChildren: true },
        ])
      )?.children ?? []
    ).map(text);
  await expect
    .poll(async () => (await children()).length, { timeout: 30_000 })
    .toBe(1);
  return (await children())[0];
};

/**
 * `content` shows the stored image `alt`: `bytes` in a file named `name_...`
 * (a file graph), a `type` Asset (a DB graph).
 */
const expectAsset = async (
  logseq: Logseq,
  content: string,
  alt: string,
  name: string,
  bytes: Buffer,
  type = 'png',
) => {
  expect(content).not.toContain('http');
  if (logseq.isDB) {
    // A DB graph: a reference to the Asset node of the image.
    const match = content.match(/^\[\[([0-9a-f-]{36})\]\]$/);
    expect(match, content).not.toBeNull();
    const asset = await logseq.callApi('logseq.Editor.getBlock', [match![1]]);
    expect(asset.title).toBe(alt);
    const property = (key: string) =>
      asset[`:logseq.property.asset/${key}`] ??
      asset.properties?.[`:logseq.property.asset/${key}`];
    expect(property('type')).toBe(type);
    // The file of the Asset: what its size and checksum say.
    const graph = await logseq.callApi('logseq.App.getCurrentGraph');
    const file = fs.readFileSync(
      path.join(graph.path, 'assets', `${match![1]}.${type}`),
    );
    expect(property('size')).toBe(file.length);
    expect(property('checksum')).toBe(
      crypto.createHash('sha256').update(file).digest('hex'),
    );
    if (type === 'png') expect(file.equals(bytes)).toBe(true);
    if (type === 'webp') {
      expect(file.subarray(0, 4).toString()).toBe('RIFF');
      expect(file.subarray(8, 12).toString()).toBe('WEBP');
      expect(file.length).toBeLessThan(270_000);
    }
  } else {
    // A file graph: the stored file, the same bytes the page showed.
    const escapedAlt = alt.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = content.match(
      new RegExp(
        `^!\\[${escapedAlt}\\]\\(\\.\\./assets/(${name}_[A-Za-z0-9_]+\\.png)\\)$`,
      ),
    );
    expect(match, content).not.toBeNull();
    const graph = await logseq.callApi('logseq.App.getCurrentGraph');
    expect(
      fs.readFileSync(path.join(graph.path, 'assets', match![1])).equals(bytes),
    ).toBe(true);
  }
};

test.describe('save images to Logseq', () => {
  test('an image behind a login cookie, without file extension, is stored as an asset', async ({
    page,
    ext,
    logseq,
  }) => {
    const id = nonce('img');
    const alt = `Backdrop ${id}`;
    session = id;
    sitePng = uniquePng(id);
    imageRequests.length = 0;
    await setUp(ext);

    // The site's login sets the cookie; the page then shows the image.
    await page.goto(`${origin}/login`);
    await page.evaluate((value) => {
      document.cookie = `session=${value}; path=/`;
    }, id);
    await page.goto(`${origin}/titles/347?alt=${encodeURIComponent(alt)}`);
    const shown = await shownImage(page);
    expect(shown.src).toBe(`${origin}${IMAGE_PATH}`);
    // Without the cookie the URL is the login redirect.
    expect((await fetch(shown.src, { redirect: 'manual' })).status).toBe(302);
    const loadedByPage = imageRequests.length;

    const content = await clipImage(page, ext, logseq, shown, alt);
    await expectAsset(logseq, content, alt, 'backdrop', sitePng);
    // The page's own request brought the cookie.
    expect(imageRequests.slice(loadedByPage).some((r) => r.cookie)).toBe(true);
  });

  test('an image of another local host that serves anyone is stored as an asset', async ({
    page,
    ext,
    logseq,
  }) => {
    const id = nonce('img');
    const alt = `Poster ${id}`;
    mediaPng = uniquePng(id);
    await setUp(ext);

    const src = `${mediaOrigin}/media/poster`;
    await page.goto(
      `${origin}/titles/348?alt=${encodeURIComponent(
        alt,
      )}&src=${encodeURIComponent(src)}`,
    );
    const shown = await shownImage(page);
    expect(shown.src).toBe(src);
    const loadedByPage = mediaRequests;

    const content = await clipImage(page, ext, logseq, shown, alt);
    await expectAsset(logseq, content, alt, 'poster', mediaPng);
    expect(mediaRequests).toBeGreaterThan(loadedByPage);
  });

  test('a large image behind a login, with a CJK alt text, is stored (a smaller WebP in a DB graph)', async ({
    page,
    ext,
    logseq,
  }) => {
    const id = nonce('img');
    const alt = '赛博朋克：边缘行者背景图';
    session = id;
    sitePng = largePng(id);
    expect(sitePng.length).toBeGreaterThan(270_000);
    await setUp(ext);
    // A DB graph with an entity its own validation refuses (a graph imported
    // from a file graph can have hundreds): Asset nodes are made all the same.
    const holder = logseq.isDB
      ? await logseq.callApi('logseq.Editor.appendBlockInPage', [
          'Copilot Test Page',
          `invalid holder ${id}`,
        ])
      : undefined;
    if (holder) {
      await logseq.callApi('logseq.Editor.upsertBlockProperty', [
        holder.uuid,
        'logseq.property.asset/checksum',
        'x',
      ]);
    }
    try {
      await page.goto(`${origin}/login`);
      await page.evaluate((value) => {
        document.cookie = `session=${value}; path=/`;
      }, id);
      await page.goto(`${origin}/titles/347?alt=${encodeURIComponent(alt)}`);
      const shown = await shownImage(page);

      const content = await clipImage(page, ext, logseq, shown, alt);
      await expectAsset(
        logseq,
        content,
        alt,
        'backdrop',
        sitePng,
        logseq.isDB ? 'webp' : 'png',
      );
    } finally {
      if (holder) await logseq.callApi('logseq.Editor.removeBlock', [holder.uuid]);
    }
  });
});
