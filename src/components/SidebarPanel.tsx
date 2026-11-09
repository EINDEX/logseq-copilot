import type { MouseEvent } from 'react';
import { IconNotes, IconRefresh, IconSettings } from '@tabler/icons-react';
import { X } from 'lucide-react';
import { HighlightList } from '@/components/HighlightList';
import { LogseqResultList } from '@/components/LogseqResultList';
import { Button } from '@/components/ui/button';
import type { PageRecallState } from '@/hooks/use-page-recall';
import type { HighlightData } from '@/types/highlight';
import type { LogseqSearchResult } from '@/types/logseqBlock';
import { graphUrl } from '@/utils/logseq-url';

/** Whether the list of a recall result would show anything. */
const hasRecall = (result: LogseqSearchResult | null): result is LogseqSearchResult =>
  !!result &&
  ((result.blocks ?? []).some((block) => block.html) ||
    (result.pages ?? []).some((page) => !!page?.name));

/**
 * Web links in Logseq blocks open in a new tab: followed in place they would
 * take the sidebar page (or, drawn on a page, the page itself) elsewhere.
 * `logseq:` links are the host's (openLogseqLinksFromBackground).
 */
const openWebLinksInNewTab = (event: MouseEvent) => {
  if (event.defaultPrevented || event.button !== 0) return;
  // No instanceof: in a content script the element may come from another
  // realm (Firefox Xrays).
  const link = (event.target as Element | null)?.closest?.('a[href]') as
    | HTMLAnchorElement
    | null
    | undefined;
  if (!link || typeof link.href !== 'string' || !/^https?:$/.test(link.protocol)) return;
  event.preventDefault();
  window.open(link.href, '_blank', 'noopener,noreferrer');
};

export interface SidebarPanelProps {
  /**
   * `loading` while the highlights of the page are being read, `unavailable`
   * for a page that cannot have highlights (or none at all), `ready` once
   * `highlights` are those of the page.
   */
  status: 'loading' | 'unavailable' | 'ready';
  highlights: HighlightData[];
  /** A message about the last action on a highlight, above the panel body. */
  notice: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onUpdateNote: (id: string, note: string) => Promise<void>;
  /** What the Logseq graph has about the page (usePageRecall). */
  recall: PageRecallState;
  onRetryRecall: () => void;
  onOpenSettings: () => void;
  /** Shows a close button in the header. */
  onClose?: () => void;
}

/**
 * The sidebar: the browser's own (an extension page) and the one drawn on
 * pages of browsers without it. The page's highlights, then what Logseq has
 * about the page, a full-width line between them; a part with nothing to
 * show is left out. It only renders its props (`logseq:` links are left to
 * the host), and fills the height of its parent. Keep it free of imports from
 * the content script entrypoint.
 */
export function SidebarPanel({
  status,
  highlights,
  notice,
  onSelect,
  onDelete,
  onUpdateNote,
  recall,
  onRetryRecall,
  onOpenSettings,
  onClose,
}: SidebarPanelProps) {
  const graph = recall.result?.graph;
  const showHighlights = status === 'ready' && highlights.length > 0;
  const recallResult = hasRecall(recall.result) ? recall.result : null;
  const showRecall = !!recall.error || !!recallResult;
  // Nothing at all only once both are known: no empty state that flashes
  // before the results.
  const settled = status !== 'loading' && !recall.loading;
  const unavailable = status === 'unavailable';

  return (
    <div className="flex h-full flex-col bg-background text-foreground">
      <header className="flex h-12 shrink-0 items-center gap-1 border-b px-3">
        {graph && (
          <a
            href={graphUrl(graph)}
            title={`Open ${graph} in Logseq`}
            className="inline-flex h-7 min-w-0 items-center gap-2 rounded-md px-1.5 text-sm font-semibold hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
          >
            <span
              aria-hidden
              className="grid h-4 w-4 shrink-0 place-items-center rounded-[4px] bg-highlight"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-[#002b36]" />
            </span>
            <span className="truncate">{graph}</span>
          </a>
        )}
        <Button
          variant="ghost"
          size="sm"
          aria-label="Settings"
          title="Settings"
          onClick={onOpenSettings}
          className="ml-auto h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
        >
          <IconSettings className="h-4 w-4" stroke={1.75} />
        </Button>
        {onClose && (
          <Button
            variant="ghost"
            size="sm"
            aria-label="Close"
            onClick={onClose}
            className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </Button>
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
      <main className="flex-1 overflow-y-auto overscroll-contain px-3 pb-4 pt-2">
        {showHighlights && (
          <section aria-label="Highlights">
            <HighlightList
              highlights={highlights}
              onSelect={onSelect}
              onDelete={onDelete}
              onUpdateNote={onUpdateNote}
            />
          </section>
        )}

        {showHighlights && showRecall && (
          <div role="separator" className="-mx-3 my-2.5 h-px bg-border" />
        )}

        {showRecall && (
          // Rows keep their hover padding; their text lines up with the highlights.
          <section aria-label="In Logseq" className="-mx-1.5" onClick={openWebLinksInNewTab}>
            {recall.error ? (
              <div role="alert" className="flex items-start gap-2 px-1.5 py-1">
                <p className="min-w-0 flex-1 py-1 text-xs leading-4 text-muted-foreground">
                  {recall.error}
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onRetryRecall}
                  className="h-6 shrink-0 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
                >
                  <IconRefresh className="h-3.5 w-3.5" stroke={1.75} />
                  Retry
                </Button>
              </div>
            ) : (
              recallResult && (
                <LogseqResultList
                  graph={recallResult.graph}
                  blocks={recallResult.blocks ?? []}
                  pages={recallResult.pages}
                  variant="sidebar"
                />
              )
            )}
          </section>
        )}

        {!showHighlights && !showRecall && settled && (
          <div className="py-10 text-center">
            <IconNotes
              aria-hidden
              className="mx-auto mb-2 h-7 w-7 text-muted-foreground/50"
              stroke={1.5}
            />
            <p className="text-sm text-muted-foreground">
              {unavailable ? 'Not available on this page' : 'Nothing for this page yet'}
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
