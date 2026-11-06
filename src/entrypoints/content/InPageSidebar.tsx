import { createRoot, type Root } from 'react-dom/client';
import type { ContentScriptContext } from 'wxt/utils/content-script-context';
import {
  createShadowRootUi,
  type ShadowRootContentScriptUi,
} from 'wxt/utils/content-script-ui/shadow-root';
import { HighlightsPanel } from '@/components/HighlightsPanel';
import { ThemeProvider } from '@/components/ThemeProvider';
import { usePageHighlights } from '@/hooks/use-page-highlights';
import { HighlightManager } from '@/utils/highlight-manager';
import log from '@/utils/logger';
import { shadowRootMode } from '@/utils/shadow-mode';
import { inPageSidebarOpenItem } from '@/utils/storage';
import { zIndex } from '@/utils/z-index';
import '@/assets/globals.css';

interface InPageSidebarProps {
  url: string;
  title: string;
}

/**
 * The highlights sidebar for browsers without one of their own (Safari,
 * Firefox for Android): the same panel as the browser sidebar, docked to the
 * right edge of the page. It covers the page and leaves its layout alone.
 */
export function InPageSidebar({ url, title }: InPageSidebarProps) {
  const { highlights, notice, setNotice, deleteHighlight, updateNote } =
    usePageHighlights(url);

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
        <HighlightsPanel
          page={{ title, url }}
          status={highlights === null ? 'loading' : 'ready'}
          highlights={highlights ?? []}
          notice={notice}
          onSelect={handleSelect}
          onDelete={deleteHighlight}
          onUpdateNote={updateNote}
          onClose={close}
        />
      </div>
    </ThemeProvider>
  );
}

const renderSidebar = (root: Root, url = location.href) =>
  root.render(<InPageSidebar url={url} title={document.title} />);

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
      // WXT sends this from the Navigation API's navigate event, before the
      // address changes: location.href is still the old page.
      ctx.addEventListener(window, 'wxt:locationchange', ({ newUrl }) => {
        if (ui?.mounted) renderSidebar(ui.mounted, newUrl.href);
      });
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
