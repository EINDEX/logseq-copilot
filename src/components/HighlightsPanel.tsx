import type { ReactNode } from 'react';
import { IconHighlight } from '@tabler/icons-react';
import { X } from 'lucide-react';
import { HighlightList } from '@/components/HighlightList';
import { Button } from '@/components/ui/button';
import type { HighlightData } from '@/types/highlight';

const hostnameOf = (url: string) => {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
};

/** A centered message, for when there is nothing to list. */
function EmptyState({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="py-8 text-center">
      <IconHighlight className="mx-auto mb-2 h-8 w-8 text-muted-foreground/60" />
      <p className="text-sm text-muted-foreground">{title}</p>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

export interface HighlightsPanelProps {
  /**
   * The page the highlights belong to, named under the heading (by its
   * hostname when it has no title). `url` is null for a page that cannot have
   * highlights. Without a page there is no second line.
   */
  page: { title: string; url: string | null } | null;
  /**
   * `loading` while the page or its highlights are being read, `unavailable`
   * for a page that cannot have highlights (or none at all), `ready` once
   * `highlights` are those of the page.
   */
  status: 'loading' | 'unavailable' | 'ready';
  highlights: HighlightData[];
  /** A message about the last action, above the list. */
  notice: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onUpdateNote: (id: string, note: string) => Promise<void>;
  /** Shows a close button in the heading. */
  onClose?: () => void;
}

/**
 * The highlights sidebar: the browser's own (an extension page) and the one
 * drawn on pages of browsers without it. It only renders its props, and fills
 * the height of its parent. Keep it free of imports from the content script
 * entrypoint.
 */
export function HighlightsPanel({
  page,
  status,
  highlights,
  notice,
  onSelect,
  onDelete,
  onUpdateNote,
  onClose,
}: HighlightsPanelProps) {
  let content: ReactNode;
  if (status === 'loading') {
    content = (
      <p className="py-10 text-center text-sm text-muted-foreground">
        Loading highlights...
      </p>
    );
  } else if (status === 'unavailable') {
    content = (
      <EmptyState
        title="Highlights aren't available on this page"
        hint="Open a web page to see its highlights"
      />
    );
  } else {
    content = (
      <HighlightList
        highlights={highlights}
        onSelect={onSelect}
        onDelete={onDelete}
        onUpdateNote={onUpdateNote}
        empty={
          <EmptyState
            title="No highlights on this page"
            hint="Select text and clip it to create a highlight"
          />
        }
      />
    );
  }

  return (
    <div className="flex h-full flex-col bg-background text-foreground">
      <header className="border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <IconHighlight className="h-5 w-5 shrink-0 text-primary" />
          <h1 className="text-lg font-semibold">Highlights</h1>
          {status === 'ready' && (
            <span className="text-sm text-muted-foreground">
              {highlights.length}
            </span>
          )}
          {onClose && (
            <Button
              variant="ghost"
              size="sm"
              aria-label="Close"
              onClick={onClose}
              className="ml-auto h-7 w-7 p-0 text-muted-foreground"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
        {page && (
          <div
            className="mt-1 truncate text-sm text-muted-foreground"
            title={page.title}
          >
            {page.title || (page.url && hostnameOf(page.url))}
          </div>
        )}
      </header>

      {notice && (
        <div
          role="status"
          className="border-b bg-accent/50 px-4 py-2 text-sm text-muted-foreground"
        >
          {notice}
        </div>
      )}

      {/* Contained: scrolling past the end does not scroll the page under an
          in-page sidebar. */}
      <main className="flex-1 overflow-y-auto overscroll-contain px-4 pb-4 pt-2">
        {content}
      </main>
    </div>
  );
}
