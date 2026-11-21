import { sendMessage } from '@/types/messaging';
import log from '@/utils/logger';
import {
  base64ToBytes,
  imageExtOf,
  MAX_DOWNLOAD_BASE64_LENGTH,
  MAX_DOWNLOAD_BYTES,
} from '@/utils/image-bytes';
import { imageName, type ImageFile } from './image-download';

/**
 * The image at `url` as the page in tab `tabId` gets it (content/page-image.ts),
 * or null when the tab cannot give it: no content script there, the tab is
 * no longer on `pageUrl` (the page clipped), a request the page itself cannot
 * make, not an image. Never throws. The answer is checked again here, the way
 * downloadImage checks a download: the size, and the kind of image by its
 * bytes.
 */
export const fetchImageFromTab = async (
  tabId: number,
  url: string,
  pageUrl: string,
): Promise<ImageFile | null> => {
  try {
    // The top frame: where the clip came from.
    const answer = await sendMessage(
      'content:fetchImage',
      { url, pageUrl },
      { tabId, frameId: 0 },
    );
    if (
      !answer ||
      typeof answer.base64 !== 'string' ||
      answer.base64.length > MAX_DOWNLOAD_BASE64_LENGTH
    ) {
      return null;
    }
    const bytes = base64ToBytes(answer.base64);
    if (bytes.length === 0 || bytes.length > MAX_DOWNLOAD_BYTES) return null;
    const ext = imageExtOf(
      bytes,
      typeof answer.contentType === 'string' ? answer.contentType : '',
    );
    if (!ext) return null;
    return { bytes, ext, name: imageName(url) };
  } catch (error) {
    log.debug('[page-image] The tab did not give the image', url, error);
    return null;
  }
};
