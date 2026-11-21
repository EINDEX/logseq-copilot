import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing';
import { base64ToBytes, MAX_DOWNLOAD_BYTES } from '@/utils/image-bytes';
import {
  fetchImageInPage,
  isClippedPage,
  onFetchImage,
  pageShowsImage,
  srcsetUrls,
} from './page-image';

const PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 255,
]);
const URL_NO_EXT = 'https://media.example/api/titles/347/backdrop';

const fetchMock = vi.fn(
  async (_url: string, _init?: RequestInit): Promise<Response> =>
    new Response(PNG, { headers: { 'Content-Type': 'image/png' } }),
);
const background = { id: fakeBrowser.runtime.id };

/** An image of the page at `src`. */
const showImage = (src: string) => {
  const img = document.createElement('img');
  img.src = src;
  document.body.append(img);
  return img;
};

beforeEach(() => {
  fetchMock.mockClear();
  vi.stubGlobal('fetch', fetchMock);
  // The page shows the image the clip has.
  document.body.innerHTML = '';
  showImage(URL_NO_EXT);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('onFetchImage', () => {
  it('answers the extension with the bytes as base64, which survive JSON', async () => {
    const answer = await onFetchImage({
      data: { url: URL_NO_EXT, pageUrl: location.href },
      sender: background,
    });
    expect(answer).toEqual({
      base64: expect.any(String),
      contentType: 'image/png',
    });
    const sent = JSON.parse(JSON.stringify(answer));
    expect(base64ToBytes(sent.base64)).toEqual(PNG);
  });

  it('fetches as the page does: its cookies, its cache, redirects followed', async () => {
    await onFetchImage({
      data: { url: URL_NO_EXT, pageUrl: location.href },
      sender: background,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      URL_NO_EXT,
      expect.objectContaining({
        credentials: 'include',
        cache: 'force-cache',
        redirect: 'follow',
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it('answers nobody else: another extension, a content script, a page', async () => {
    for (const sender of [
      {},
      { id: 'other-extension' },
      {
        id: fakeBrowser.runtime.id,
        tab: { id: 3, url: 'https://evil.example/' },
      },
    ]) {
      expect(
        await onFetchImage({
          data: { url: URL_NO_EXT, pageUrl: location.href },
          sender,
        }),
      ).toBeNull();
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fetches only on the page clipped, its #hash aside', async () => {
    const page = new URL(location.href);
    const withHash = Object.assign(new URL(page), { hash: '#section-2' }).href;
    expect(isClippedPage(location.href)).toBe(true);
    expect(isClippedPage(withHash)).toBe(true);
    expect(
      await onFetchImage({
        data: { url: URL_NO_EXT, pageUrl: withHash },
        sender: background,
      }),
    ).not.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('refuses when the tab is on another page, or the page clipped is not named', async () => {
    const other = Object.assign(new URL(location.href), {
      pathname: '/another-page',
    }).href;
    const query = Object.assign(new URL(location.href), {
      search: '?b=2',
    }).href;
    for (const pageUrl of [
      other,
      query,
      'https://evil.example/',
      '',
      'not a url',
      undefined,
    ]) {
      expect(isClippedPage(pageUrl), String(pageUrl)).toBe(false);
      expect(
        await onFetchImage({
          data: { url: URL_NO_EXT, pageUrl } as never,
          sender: background,
        }),
      ).toBeNull();
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses an image this page has not loaded (a frame inside it chose the URL)', async () => {
    document.body.innerHTML = '';
    expect(
      await onFetchImage({
        data: { url: URL_NO_EXT, pageUrl: location.href },
        sender: background,
      }),
    ).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('answers null without a URL', async () => {
    expect(
      await onFetchImage({ data: {} as never, sender: background }),
    ).toBeNull();
    expect(
      await onFetchImage({ data: undefined as never, sender: background }),
    ).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('fetchImageInPage', () => {
  it('takes no answer that is not an image, whatever its Content-Type says', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response('<html>Sign in</html>', {
        headers: { 'Content-Type': 'image/png' },
      }),
    );
    expect(await fetchImageInPage(URL_NO_EXT)).toBeNull();
  });

  it('takes an SVG by its Content-Type', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response('<svg xmlns="http://www.w3.org/2000/svg"/>', {
        headers: { 'Content-Type': 'image/svg+xml' },
      }),
    );
    expect((await fetchImageInPage(URL_NO_EXT))?.contentType).toBe(
      'image/svg+xml',
    );
  });

  it('takes no failed answer', async () => {
    fetchMock.mockResolvedValueOnce(new Response(PNG, { status: 403 }));
    expect(await fetchImageInPage(URL_NO_EXT)).toBeNull();
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 200 }));
    expect(await fetchImageInPage(URL_NO_EXT)).toBeNull();
  });

  it('reads no more than MAX_DOWNLOAD_BYTES', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(PNG, {
        headers: { 'Content-Length': String(MAX_DOWNLOAD_BYTES + 1) },
      }),
    );
    expect(await fetchImageInPage(URL_NO_EXT)).toBeNull();

    const big = new Uint8Array(MAX_DOWNLOAD_BYTES + 1);
    big.set(PNG);
    fetchMock.mockResolvedValueOnce(new Response(big));
    expect(await fetchImageInPage(URL_NO_EXT)).toBeNull();
  });

  it('is null when the page cannot fetch it (CORS, network)', async () => {
    fetchMock
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'));
    expect(await fetchImageInPage(URL_NO_EXT)).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('asks a cross-origin host that refuses credentials once more without them', async () => {
    // `Access-Control-Allow-Origin: *` with credentials: a CORS failure.
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    expect(await fetchImageInPage(URL_NO_EXT)).not.toBeNull();
    expect(fetchMock.mock.calls.map(([, init]) => init?.credentials)).toEqual([
      'include',
      'omit',
    ]);
  });

  it('asks once on its own origin, and once after a timeout', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    expect(await fetchImageInPage(`${location.origin}/backdrop`)).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fetchMock.mockClear();
    fetchMock.mockRejectedValueOnce(
      new DOMException('The operation timed out.', 'TimeoutError'),
    );
    expect(await fetchImageInPage(URL_NO_EXT)).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('fetches only what a page loads images from', async () => {
    for (const url of [
      'javascript:alert(1)',
      'file:///etc/passwd',
      'chrome-extension://abc/icon.png',
      'not a url',
    ]) {
      expect(await fetchImageInPage(url), url).toBeNull();
    }
    expect(fetchMock).not.toHaveBeenCalled();

    for (const url of [
      'http://192.168.1.2/p',
      'data:image/png;base64,iVBORw0KGgo=',
      'blob:https://e.com/1',
    ]) {
      expect(await fetchImageInPage(url), url).not.toBeNull();
    }
  });
});

describe('pageShowsImage', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('takes an image of the page by its src, also written relative', () => {
    showImage('/media/poster');
    expect(pageShowsImage(new URL('/media/poster', location.href).href)).toBe(
      true,
    );
    expect(pageShowsImage('/media/poster')).toBe(true);
    expect(pageShowsImage(new URL('/media/other', location.href).href)).toBe(
      false,
    );
  });

  it('takes the image the browser picked (currentSrc)', () => {
    const img = showImage('https://e.com/small.png');
    Object.defineProperty(img, 'currentSrc', {
      value: 'https://e.com/large.png',
    });
    expect(pageShowsImage('https://e.com/large.png')).toBe(true);
    expect(pageShowsImage('https://e.com/small.png')).toBe(true);
  });

  it('takes a candidate of a <source srcset> of a <picture>', () => {
    document.body.innerHTML = `<picture>
      <source srcset="https://cdn.example/w_640,h_480/a.webp 1x, /b.avif 2x" type="image/avif">
      <img src="https://cdn.example/fallback.jpg">
    </picture>
    <source srcset="https://cdn.example/not-in-a-picture.webp">`;
    expect(pageShowsImage('https://cdn.example/w_640,h_480/a.webp')).toBe(true);
    expect(pageShowsImage(new URL('/b.avif', location.href).href)).toBe(true);
    expect(pageShowsImage('https://cdn.example/not-in-a-picture.webp')).toBe(
      false,
    );
  });

  it('takes a resource the page loaded (a CSS background)', () => {
    vi.spyOn(performance, 'getEntriesByType').mockReturnValue([
      { name: 'https://e.com/bg.jpg' } as PerformanceEntry,
    ]);
    expect(pageShowsImage('https://e.com/bg.jpg')).toBe(true);
    expect(pageShowsImage('https://e.com/other.jpg')).toBe(false);
    expect(performance.getEntriesByType).toHaveBeenCalledWith('resource');
  });

  it('takes a data: or blob: URL only as an image of the page', () => {
    const data = 'data:image/png;base64,iVBORw0KGgo=';
    const blob = 'blob:https://e.com/1234';
    vi.spyOn(performance, 'getEntriesByType').mockReturnValue([
      { name: data } as PerformanceEntry,
      { name: blob } as PerformanceEntry,
    ]);
    expect(pageShowsImage(data)).toBe(false);
    expect(pageShowsImage(blob)).toBe(false);
    showImage(data);
    showImage(blob);
    expect(pageShowsImage(data)).toBe(true);
    expect(pageShowsImage(blob)).toBe(true);
  });

  it('takes nothing that is not a URL', () => {
    showImage('https://e.com/a.png');
    expect(pageShowsImage('')).toBe(false);
    expect(pageShowsImage('http://[bad')).toBe(false);
  });
});

describe('srcsetUrls', () => {
  it('reads the URLs of the candidates, commas inside URLs kept', () => {
    expect(srcsetUrls('a.png')).toEqual(['a.png']);
    expect(srcsetUrls('a.png 1x, b.png 2x')).toEqual(['a.png', 'b.png']);
    expect(srcsetUrls('a.png 640w,b.png 1280w')).toEqual(['a.png', 'b.png']);
    expect(srcsetUrls('https://c.example/w_1,h_2/a.png 1x')).toEqual([
      'https://c.example/w_1,h_2/a.png',
    ]);
    expect(srcsetUrls('a.png, b.png,')).toEqual(['a.png', 'b.png']);
    expect(srcsetUrls(' , ')).toEqual([]);
  });
});
