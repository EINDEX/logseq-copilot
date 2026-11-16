import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { contentEvents } from '@/utils/content-events';
import { templates } from '@/utils/storage';
import { zIndex } from '@/utils/z-index';
import log from '@/utils/logger';

/** How long the confirmation of a clip stays, in ms. */
export const CLIP_TOAST_MS = 4_000;

/**
 * Where a clip made from the page was saved (shortcut, context menu, float
 * button). Only with two or more templates: with one, a clip is saved as it
 * always was, with no word about it. Inline px, like the clip error: it must not depend on the host
 * page's stylesheet or rem size.
 */
export const ClipToast = () => {
  const [page, setPage] = useState<string | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let current = true;
    const off = contentEvents.on('clipped', ({ result, feedback }) => {
      if (feedback !== 'page') return;
      void (async () => {
        try {
          if ((await templates.getValue()).length < 2 || !current) return;
        } catch (error) {
          // The clip is done: the confirmation is a convenience.
          log.debug('[ClipToast] Not shown', error);
          return;
        }
        setPage(result.page);
        clearTimeout(timer);
        timer = setTimeout(() => setPage(null), CLIP_TOAST_MS);
      })();
    });
    return () => {
      current = false;
      off();
      clearTimeout(timer);
    };
  }, []);

  if (page === null) return null;

  return (
    <div
      role="status"
      data-clip-toast
      onClick={() => setPage(null)}
      style={{
        position: 'fixed',
        right: '16px',
        bottom: '16px',
        zIndex,
        boxSizing: 'border-box',
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        maxWidth: 'min(360px, calc(100vw - 32px))',
        padding: '8px 12px',
        background: 'var(--background)',
        color: 'var(--foreground)',
        border: '1px solid var(--border)',
        borderRadius: '8px',
        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
        font: '13px/18px system-ui, -apple-system, "Segoe UI", sans-serif',
        cursor: 'pointer',
      }}
    >
      <Check
        aria-hidden
        size={14}
        strokeWidth={2.5}
        style={{ flex: 'none', color: 'var(--primary)' }}
      />
      <span
        data-clip-toast-page
        style={{
          fontWeight: 600,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {page}
      </span>
    </div>
  );
};
