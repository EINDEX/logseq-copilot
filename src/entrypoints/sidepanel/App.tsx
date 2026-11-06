import { HighlightsPanel } from '@/components/HighlightsPanel';
import { useActiveTab } from '@/hooks/use-active-tab';
import { usePageHighlights } from '@/hooks/use-page-highlights';
import { sendMessage } from '@/types/messaging';
import log from '@/utils/logger';

/**
 * The highlights of the page in the active tab, in the browser sidebar (Chrome
 * and Edge side panel, Firefox sidebar). It only holds what it can read again
 * on mount, from the active tab and from storage: Edge reloads the side panel
 * when the tab changes.
 */
export default function App() {
  const { tab, loading: tabLoading } = useActiveTab();
  const url = tab?.url ?? null;
  const { highlights, notice, setNotice, deleteHighlight, updateNote } =
    usePageHighlights(url);

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

  const status =
    tabLoading || (url && highlights === null)
      ? 'loading'
      : !url || !highlights
      ? 'unavailable'
      : 'ready';

  return (
    <div className="h-screen">
      <HighlightsPanel
        page={tab}
        status={status}
        highlights={highlights ?? []}
        notice={notice}
        onSelect={handleSelect}
        onDelete={deleteHighlight}
        onUpdateNote={updateNote}
      />
    </div>
  );
}
