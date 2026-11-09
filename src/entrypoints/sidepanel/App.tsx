import { useEffect, useRef } from 'react';
import { SidebarPanel } from '@/components/SidebarPanel';
import { useActiveTab } from '@/hooks/use-active-tab';
import { usePageHighlights } from '@/hooks/use-page-highlights';
import { usePageRecall } from '@/hooks/use-page-recall';
import { sendMessage } from '@/types/messaging';
import log from '@/utils/logger';
import { openLogseqLinksFromBackground } from '@/utils/logseq-links';

/**
 * This page has no tab of its own, so `logseq:openLink` (which opens the link
 * in its sender's tab) would be ignored. `app:openPage` has the background
 * open it in the active tab, the page beside this sidebar; a `logseq:` URL
 * launches Logseq and leaves that page where it is.
 */
const openInActiveTab = (url: string) => sendMessage('app:openPage', { url });

const openSettings = () => {
  sendMessage('app:openOptions').catch((error) =>
    log.error('Failed to open the options page:', error),
  );
};

/**
 * The highlights of the page in the active tab and what Logseq has about it,
 * in the browser sidebar (Chrome and Edge side panel, Firefox sidebar). It
 * only holds what it can read again on mount, from the active tab and from
 * storage: Edge reloads the side panel when the tab changes.
 */
export default function App() {
  const { tab, loading: tabLoading } = useActiveTab();
  const url = tab?.url ?? null;
  const { highlights, notice, setNotice, deleteHighlight, updateNote } =
    usePageHighlights(url);
  const { retry: retryRecall, ...recall } = usePageRecall(url);

  // `logseq:` links are opened by the background, like in the sidebar drawn
  // on pages: followed here, they would load in this page.
  const root = useRef<HTMLDivElement>(null);
  useEffect(
    () => openLogseqLinksFromBackground(root.current!, openInActiveTab),
    [],
  );

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
    <div ref={root} className="h-screen">
      <SidebarPanel
        status={status}
        highlights={highlights ?? []}
        notice={notice}
        onSelect={handleSelect}
        onDelete={deleteHighlight}
        onUpdateNote={updateNote}
        recall={recall}
        onRetryRecall={retryRecall}
        onOpenSettings={openSettings}
      />
    </div>
  );
}
