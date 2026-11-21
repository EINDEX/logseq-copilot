import { beforeEach, describe, expect, it, vi } from 'vitest';
import { bytesToBase64, MAX_DOWNLOAD_BASE64_LENGTH } from '@/utils/image-bytes';

const { sendMessage } = vi.hoisted(() => ({ sendMessage: vi.fn() }));
vi.mock('@/types/messaging', () => ({ sendMessage }));

import { fetchImageFromTab } from './page-image';

const PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0,
]);
const URL_NO_EXT = 'https://media.example/api/titles/347/backdrop';
const PAGE_URL = 'https://media.example/titles/347';

beforeEach(() => {
  sendMessage.mockReset();
});

describe('fetchImageFromTab', () => {
  it('asks the top frame of the tab, and names the image after its URL', async () => {
    sendMessage.mockResolvedValue({
      base64: bytesToBase64(PNG),
      contentType: 'text/plain',
    });
    expect(await fetchImageFromTab(4, URL_NO_EXT, PAGE_URL)).toEqual({
      bytes: PNG,
      ext: 'png',
      name: 'backdrop',
    });
    expect(sendMessage).toHaveBeenCalledWith(
      'content:fetchImage',
      { url: URL_NO_EXT, pageUrl: PAGE_URL },
      { tabId: 4, frameId: 0 },
    );
  });

  it('takes an SVG by the Content-Type the page had', async () => {
    const svg = new TextEncoder().encode('<svg/>');
    sendMessage.mockResolvedValue({
      base64: bytesToBase64(svg),
      contentType: 'image/svg+xml',
    });
    expect((await fetchImageFromTab(4, URL_NO_EXT, PAGE_URL))?.ext).toBe('svg');
  });

  it('checks the answer again: no image, too large, no bytes, not base64', async () => {
    for (const answer of [
      null,
      undefined,
      {},
      { base64: 42 },
      {
        base64: bytesToBase64(new TextEncoder().encode('<html>')),
        contentType: 'image/png',
      },
      { base64: 'A'.repeat(MAX_DOWNLOAD_BASE64_LENGTH + 4) },
      { base64: '' },
      { base64: '!!!' },
    ]) {
      sendMessage.mockResolvedValueOnce(answer);
      expect(
        await fetchImageFromTab(4, URL_NO_EXT, PAGE_URL),
        JSON.stringify(answer),
      ).toBeNull();
    }
  });

  it('is null when the tab has no content script to answer', async () => {
    sendMessage.mockRejectedValue(
      new Error(
        'Could not establish connection. Receiving end does not exist.',
      ),
    );
    expect(await fetchImageFromTab(4, URL_NO_EXT, PAGE_URL)).toBeNull();
  });
});
