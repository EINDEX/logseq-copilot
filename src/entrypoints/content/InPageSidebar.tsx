import { createRoot, type Root } from 'react-dom/client';
import type { ContentScriptContext } from 'wxt/utils/content-script-context';
import {
  createShadowRootUi,
  type ShadowRootContentScriptUi,
} from 'wxt/utils/content-script-ui/shadow-root';
import { SidebarPanel } from '@/components/SidebarPanel';
import { ThemeProvider } from '@/components/ThemeProvider';
import { usePageHighlights } from '@/hooks/use-page-highlights';
import { usePageRecall } from '@/hooks/use-page-recall';
import { sendMessage } from '@/types/messaging';
import { HighlightManager } from '@/utils/highlight-manager';
import log from '@/utils/logger';
import { openLogseqLinksFromBackground } from '@/utils/logseq-links';
import { shadowRootMode } from '@/utils/shadow-mode';
import { inPageSidebarOpenItem } from '@/utils/storage';
import { zIndex } from '@/utils/z-index';
import '@/assets/globals.css';

interface InPageSidebarProps {
  url: string;
}

const openSettings = () => {
  sendMessage('app:openOptions').catch((error) =>
    log.error('[InPageSidebar] Failed to open the options page:', error),
  );
};

/**
 * The sidebar for browsers without one of their own (Safari, Firefox for
 * Android): the same panel as the browser sidebar, docked to the right edge
 * of the page. It covers the page and leaves its layout alone. Its `logseq:`
 * links are opened by the background (openLogseqLinksFromBackground on the
 * shadow root, in startInPageSidebar).
 */
export function InPageSidebar({ url }: InPageSidebarProps) {
  const { highlights, notice, setNotice, deleteHighlight, updateNote } =
    usePageHighlights(url);
  const { retry: retryRecall, ...recall } = usePageRecall(url);

  const handleSelect = async (id: string) => {
    setNotice(null);
    const found = await HighlightManager.getInstance().scrollToHighlight(id);
    if (!found) setNotice("Couldn't find this highlight on the page");
  };

  // Closes it in every tab.
  const close = () => {
    inPageSidebarOpenItem
      .setValue(false)
      .catch((error) =>
        log.error('[InPageSidebar] Failed to close the sidebar:', error),
      );
  };

  return (
    <ThemeProvider>
      <div
        data-in-page-sidebar
        className="fixed inset-y-0 right-0 w-[min(360px,100vw)] overflow-hidden border-l bg-background shadow-[-2px_0_12px_rgb(0_0_0/0.05)] dark:shadow-[-2px_0_12px_rgb(0_0_0/0.35)]"
        style={{ zIndex }}
      >
        <SidebarPanel
          status={highlights === null ? 'loading' : 'ready'}
          highlights={highlights ?? []}
          notice={notice}
          onSelect={handleSelect}
          onDelete={deleteHighlight}
          onUpdateNote={updateNote}
          recall={recall}
          onRetryRecall={retryRecall}
          onOpenSettings={openSettings}
          onClose={close}
        />
      </div>
    </ThemeProvider>
  );
}

const renderSidebar = (root: Root) =>
  root.render(<InPageSidebar url={location.href} />);

/**
 * Show the in-page sidebar while `inPageSidebarOpen` is set, and follow the
 * page: in-page navigations of single-page apps change the list. Call it once,
 * in the top frame of a web page.
 */
export async function startInPageSidebar(
  ctx: ContentScriptContext,
): Promise<void> {
  let ui: ShadowRootContentScriptUi<Root> | null = null;
  let shown = false;
  // Creating the UI is async (it loads the stylesheet): changes apply one
  // after the other, so a quick open and close ends closed.
  let applied = Promise.resolve();

  const show = async (open: boolean) => {
    if (open === shown) return;
    if (open && !ui) {
      ui = await createShadowRootUi(ctx, {
        name: 'logseq-copilot-highlights',
        mode: shadowRootMode,
        position: 'inline',
        anchor: 'body',
        // Typing a note must not run the page's keyboard shortcuts.
        isolateEvents: true,
        onMount: (container) => {
          const app = document.createElement('div');
          container.append(app);
          const root = createRoot(app);
          renderSidebar(root);
          return root;
        },
        onRemove: (root) => root?.unmount(),
      });
      openLogseqLinksFromBackground(ui.shadow);
      // Redraw for the address the tab is at, once it has changed. Not for the
      // newUrl of wxt:locationchange: with the Navigation API, WXT sends it
      // from the navigate event, before the navigation happens. That URL is
      // any address the page asks for, and the navigation can still be
      // cancelled (by the page too) or fail: a page could go to another
      // site's address, cancel, and have that site's highlights and notes
      // drawn on it.
      const follow = () => {
        if (ui?.mounted) renderSidebar(ui.mounted);
      };
      // TypeScript's DOM types do not have the Navigation API yet.
      const { navigation } = globalThis as { navigation?: EventTarget };
      if (typeof navigation?.addEventListener === 'function') {
        // Fires once a same-document navigation has changed the address:
        // pushState, replaceState, a new hash, back and forward. Not for
        // cancelled navigations, nor for ones that load another document (the
        // content script runs again there).
        ctx.addEventListener(navigation, 'currententrychange', follow);
      } else {
        // Without it WXT polls location.href and sends this after a change.
        ctx.addEventListener(window, 'wxt:locationchange', follow);
      }
    }
    if (open) ui!.mount();
    else ui!.remove();
    shown = open;
  };

  const apply = (open: boolean) => {
    applied = applied
      .then(() => show(open))
      .catch((error) =>
        log.error('[InPageSidebar] Failed to show or hide the sidebar:', error),
      );
  };

  // Watching comes first, so a change while reading is not missed.
  let changed = false;
  inPageSidebarOpenItem.watch((open) => {
    changed = true;
    apply(open);
  });
  const open = await inPageSidebarOpenItem.getValue();
  if (!changed) apply(open);
}
