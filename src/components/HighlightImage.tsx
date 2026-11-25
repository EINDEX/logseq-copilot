import { useState } from 'react';
import { IconPhoto } from '@tabler/icons-react';
import type { SerializableImage } from '@/types/highlight';
import { isPrivateHost } from '@/utils/private-host';
import { cn } from '@/lib/utils';
import { useTranslation } from '@/i18n/react';

/**
 * The image's own URL, when an extension page may load it: http(s) only, and
 * no host of this machine or the local network (the URL comes from the page,
 * and an extension page could reach hosts the page itself cannot).
 */
const displayableSrc = (src: string): string | undefined => {
  try {
    const url = new URL(src);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined;
    return isPrivateHost(url.hostname) ? undefined : url.href;
  } catch {
    return undefined;
  }
};

/**
 * The image of an image highlight, small: in the highlight lists and the
 * comment popup. It loads the image from the page's URL, without a Referer;
 * no copy of it is kept. An image icon instead when that URL is not loaded
 * (see displayableSrc) or the image does not load.
 */
export function HighlightImage({
  image,
  className,
}: {
  image: SerializableImage;
  className?: string;
}) {
  const { t } = useTranslation();
  const [failed, setFailed] = useState(false);
  const src = displayableSrc(image.src);

  if (!src || failed) {
    return (
      <span
        role="img"
        aria-label={image.alt || t('common.image')}
        className={cn(
          'flex h-12 w-16 items-center justify-center rounded-sm bg-muted text-muted-foreground',
          className,
        )}
      >
        <IconPhoto className="h-5 w-5" />
      </span>
    );
  }

  return (
    <img
      src={src}
      alt={image.alt}
      referrerPolicy="no-referrer"
      loading="lazy"
      decoding="async"
      draggable={false}
      onError={() => setFailed(true)}
      className={cn('block max-h-24 max-w-full rounded-sm object-contain', className)}
    />
  );
}
