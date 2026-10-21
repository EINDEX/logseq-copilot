import { useEffect, useState, type ReactNode } from 'react';
import { IconHighlight } from '@tabler/icons-react';
import { HighlightList } from '@/components/HighlightList';
import { useActiveTab } from '@/hooks/use-active-tab';
import { sendMessage } from '@/types/messaging';
import type { HighlightData } from '@/types/highlight';
import {
  deleteHighlight,
  getHighlightsForUrl,
  updateHighlightNote,
  watchHighlights,
} from '@/utils/highlight-service';
import log from '@/utils/logger';

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

/**
 * The highlights of the page in the active tab, in the browser sidebar (Chrome
 * and Edge side panel, Firefox sidebar). It only holds what it can read again
 * on mount, from the active tab and from storage: Edge reloads the side panel
 * when the tab changes.
 */
export default function App() {
  const { tab, loading: tabLoading } = useActiveTab();
  const url = tab?.url ?? null;
  // null while they are being read
  const [highlights, setHighlights] = useState<HighlightData[] | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    setHighlights(null);
    setNotice(null);
    if (!url) return;

    let disposed = false;
    let latestLoad = 0;
    const load = async () => {
      const thisLoad = ++latestLoad;
      const pageHighlights = await getHighlightsForUrl(url);
      if (!disposed && thisLoad === latestLoad) setHighlights(pageHighlights);
    };

    // Watching comes first, so a change while loading is not missed.
    const unwatch = watchHighlights(() => void load());
    void load();

    return () => {
      disposed = true;
      unwatch();
    };
  }, [url]);

  const handleSelect = async (id: string) => {
    if (!tab) return;
    setNotice(null);
    try {
      const found = await sendMessage(
        'content:scrollToHighlight',
        { id },
        tab.id,
      );
      if (!found) setNotice("Couldn't find this highlight on the page");
    } catch (error) {
      // There is no content script in the tab: a restricted page, or a tab
      // that was already open when the extension was installed or updated.
      log.warn('Failed to scroll to the highlight:', error);
      setNotice('Reload the page to jump to highlights');
    }
  };

  const handleDelete = async (id: string) => {
    setNotice(null);
    const result = await deleteHighlight(id);
    if (!result.success) setNotice("Couldn't delete the highlight");
  };

  const handleUpdateNote = async (id: string, note: string) => {
    setNotice(null);
    const result = await updateHighlightNote(id, note);
    if (!result.success) {
      setNotice("Couldn't save the note");
      throw new Error(result.message);
    }
  };

  let content: ReactNode;
  if (tabLoading || (url && highlights === null)) {
    content = (
      <p className="py-10 text-center text-sm text-muted-foreground">
        Loading highlights...
      </p>
    );
  } else if (!url || !highlights) {
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
        onSelect={handleSelect}
        onDelete={handleDelete}
        onUpdateNote={handleUpdateNote}
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
    <div className="flex h-screen flex-col bg-background text-foreground">
      <header className="border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <IconHighlight className="h-5 w-5 shrink-0 text-primary" />
          <h1 className="text-lg font-semibold">Highlights</h1>
          {highlights && (
            <span className="text-sm text-muted-foreground">
              {highlights.length}
            </span>
          )}
        </div>
        {tab && (
          <div
            className="mt-1 truncate text-sm text-muted-foreground"
            title={tab.title}
          >
            {tab.title || (tab.url && hostnameOf(tab.url))}
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

      <main className="flex-1 overflow-y-auto px-4 pb-4 pt-2">{content}</main>
    </div>
  );
}
