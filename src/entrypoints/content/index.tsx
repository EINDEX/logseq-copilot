import { getLogseqCopliotConfig } from '@/config';
import { fixDuckDuckGoDark } from '@/utils';
import { searchEngineConfig } from '@/utils/storage';
import { createRoot } from 'react-dom/client';
import { browser } from 'wxt/browser';
import { LogseqCopliot } from './LogseqCopliot';
import { startInPageSidebar } from './InPageSidebar';
import mountQuickCapture, {
  hasClippableSelection,
  runClipCommand,
} from './QuickCapture';
import { CustomSearchEngine } from './searchingEngines/searchingEngines';
import { keepOnPage } from './searchingEngines/keep-on-page';
import { onMessage } from '@/types/messaging';
import { HighlightManager } from '@/utils/highlight-manager';
import log from '@/utils/logger';
import { openLogseqLinksFromBackground } from '@/utils/logseq-links';
import { shadowRootMode } from '@/utils/shadow-mode';

export default defineContentScript({
  // Set manifest options
  matches: ['http://*/*', 'https://*/*', '<all_urls>'],
  // excludeMatches: undefined | [],
  // includeGlobs: undefined | [],
  // excludeGlobs: undefined | [],
  // allFrames: undefined | true | false,
  // runAt: undefined | 'document_start' | 'document_end' | 'document_idle',
  // matchAboutBlank: undefined | true | false,
  // matchOriginAsFallback: undefined | true | false,
  // world: undefined | 'ISOLATED' | 'MAIN',

  // Set include/exclude if the background should be removed from some builds
  // include: undefined | string[],
  // exclude: undefined | string[],

  // Configure how CSS is injected onto the page
  cssInjectionMode: "ui",

  // Configure how/when content script will be registered
  // registration: undefined | "manifest" | "runtime",
  // 2. Set cssInjectionMode

  async main(ctx) {
    // Register every message handler first, synchronously: nothing awaited
    // before this point, so a shortcut pressed while the page is still
    // starting up (or restoring highlights) is never dropped.
    // Setup message listeners for background script communication
    // Clip commands: the clip shortcut and the context menu (from the
    // background), "Clip selection" (from the toolbar popup).
    onMessage('content:quickCapture', ({ data }) =>
      runClipCommand('selectionOrPage', data),
    );

    onMessage('content:quickCaptureWithSelection', ({ data }) =>
      runClipCommand('selectionOrPage', data),
    );

    onMessage('content:quickCapturePage', ({ data }) =>
      runClipCommand('page', data),
    );

    // From the toolbar popup: it offers "Clip selection" only when there is one.
    onMessage('content:hasSelection', () => hasClippableSelection());

    // From the browser sidebar: scroll to a highlight of this page. The
    // manager waits for the restore itself.
    onMessage('content:scrollToHighlight', async (message) => {
      return HighlightManager.getInstance().scrollToHighlight(message.data.id);
    });

    // Browsers without a sidebar of their own get it drawn on the page
    // (src/utils/sidebar.ts): once per tab, so in the top frame of web pages.
    if (window.top === window && /^https?:$/.test(location.protocol)) {
      startInPageSidebar(ctx).catch((error) =>
        log.error('[content] Failed to start the in-page sidebar', error),
      );
    }

    async function getEngine() {
      // Get enabled search engines from storage
      const enabledEngines = await searchEngineConfig.getValue();
      const enabledEngineConfigs = enabledEngines.filter(e => e.enabled);

      // Try all enabled search engines (both built-in and custom)
      for (const engineConfig of enabledEngineConfigs) {
        if (engineConfig.urlPattern && engineConfig.querySelector && engineConfig.elementSelector) {
          const customEngine = new CustomSearchEngine({
            id: engineConfig.id,
            name: engineConfig.name,
            urlPattern: engineConfig.urlPattern,
            querySelector: engineConfig.querySelector,
            elementSelector: engineConfig.elementSelector,
            insertPosition: engineConfig.insertPosition || 'last',
          });

          if (customEngine.isMatch()) {
            return customEngine;
          }
        }
      }
    }

    const mount = async (container: Element, query: string, hostFont: string) => {
      const root = createRoot(container);

      root.render(<LogseqCopliot query={query} hostFont={hostFont} />);
      return root;
    };

    // The search card on the page. A search that reruns run() (Baidu's
    // reload) replaces it.
    let searchCard: { remove: () => void } | undefined;

    async function run(searchEngine: CustomSearchEngine) {
      log.debug('Logseq copliot', window.location.hostname);
      searchCard?.remove();
      searchCard = undefined;

      if (searchEngine.getId() === 'duckduckgo') {
        fixDuckDuckGoDark()
      }

      const query = searchEngine.getQuery();
      if (query) {
        log.debug(`match ${typeof searchEngine}, query ${query}`);
        await searchEngine.whenReady();
        const container = searchEngine.gotElement();
        if (!container) {
          log.warn('Failed to get container element for search engine');
          return;
        }
        // Executed when content script is loaded, can be async
        const searchEngineUi = await createShadowRootUi(ctx, {
          name: 'logseq-copilot-search-engine',
          mode: shadowRootMode,
          position: 'inline',
          anchor: container,
          append: 'first',
          onMount: async (uiContainer) => {
            const app = document.createElement('div');
            uiContainer.append(app);
            // Text in the sidebar uses the host page's font (Arial on
            // Google, Segoe UI on Bing, ...); the shadow root resets it.
            return mount(app, query, getComputedStyle(container).fontFamily);
          },
          onRemove: async (root) => {
            // Unmount the root when the UI is removed
            if (root) {
              const toUnmount = await root
              toUnmount?.unmount()
            }
          },
        });

        if (searchEngineUi) {
          openLogseqLinksFromBackground(searchEngineUi.shadow);
          // 4. Mount the UI. The host element is inline by default; as a
          // block it takes the full width of the host column.
          searchEngineUi.shadowHost.style.display = 'block';
          searchEngineUi.mount();
          // Pages that render their columns again take the card out
          // (Brave); put it back.
          const stopFollowing = keepOnPage(ctx, searchEngineUi.shadowHost, {
            place: () => searchEngine.gotElement({ quiet: true }),
            // After a search that loads no document, the card of the old
            // query does not belong on the new results.
            wanted: () => searchEngine.getQuery() === query,
            onLost: () => searchEngineUi.remove(),
          });
          searchCard = {
            remove: () => {
              stopFollowing();
              searchEngineUi.remove();
            },
          };
        }
      }
    }

    const mountUi = async () => {
      const searchEngine = await getEngine();

      await new Promise(resolve => setTimeout(resolve, 200));

      if (searchEngine) {
        run(searchEngine);
        searchEngine.reload(() => run(searchEngine));
      }

      // Highlights (restore, comment popup) do not depend on the floating
      // clip button; the option only controls the button itself.
      const { enableClipNoteFloatButton } = await getLogseqCopliotConfig();
      // Executed when content script is loaded, can be async
      const popupUi = await createShadowRootUi(ctx, {
        name: 'logseq-copilot-popup',
        mode: shadowRootMode,
        position: 'inline',
        anchor: 'body',
        onMount: async (container) => {
          // Container is a body, and React warns when creating a root on the body, so create a wrapper div
          const app = document.createElement('div');
          app.id = 'logseq-copilot-popup';
          container.append(app);


          return mountQuickCapture(app, {
            showFloatButton: enableClipNoteFloatButton,
          });
        },
        onRemove: async (root) => {
          // Unmount the root when the UI is removed
          if (root) {
            const toUnmount = await root
            toUnmount?.unmount()
          }
        },
      });

      if (popupUi) {
        openLogseqLinksFromBackground(popupUi.shadow);
        // 4. Mount the UI
        popupUi.mount();
      }
    };

    // Mount the UI without blocking the handlers above, then restore saved
    // highlights in the background. Do not await the restore here: it can be
    // slow, and the things that need it (saving a highlight after a clip,
    // scrolling to or removing one) await HighlightManager.ready themselves.
    const uiMounted = mountUi().catch((error) =>
      log.error('[content] Failed to mount the UI', error),
    );
    void HighlightManager.getInstance().initialize();
    await uiMounted;

  },
})

