import { getLogseqCopliotConfig } from '@/config';
import { fixDuckDuckGoDark } from '@/utils';
import { searchEngineConfig } from '@/utils/storage';
import { createRoot } from 'react-dom/client';
import { browser } from 'wxt/browser';
import { LogseqCopliot } from './LogseqCopliot';
import mountQuickCapture from './QuickCapture';
import { CustomSearchEngine } from './searchingEngines/searchingEngines';
import { onMessage } from '@/types/messaging';
import { HighlightManager } from '@/utils/highlight-manager';
import { contentEvents } from '@/utils/content-events';
import { HighlightsSidebarContainer } from '@/components/HighlightsSidebarContainer';
import log from '@/utils/logger';
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
    onMessage('content:quickCapture', async (message) => {
      // QuickCapture subscribes to the in-memory content event bus
      contentEvents.emit('quickCapture', undefined);
    });

    onMessage('content:quickCaptureWithSelection', async (message) => {
      // Trigger quick capture with selection
      contentEvents.emit('quickCaptureWithSelection', undefined);
    });

    onMessage('content:quickCapturePage', async (message) => {
      // Trigger quick capture page
      contentEvents.emit('quickCapturePage', undefined);
    });

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

    const mount = async (container: Element, query: string) => {
      const root = createRoot(container);

      root.render(<LogseqCopliot query={query} />);
      return root;
    };

    async function run(searchEngine: CustomSearchEngine) {
      log.debug('Logseq copliot', window.location.hostname);

      if (searchEngine.getId() === 'duckduckgo') {
        fixDuckDuckGoDark()
      }

      const query = searchEngine.getQuery();
      if (query) {
        log.debug(`match ${typeof searchEngine}, query ${query}`);
        const container = await searchEngine.gotElement();
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
          onMount: async (container) => {
            const app = document.createElement('div');
            container.append(app);
            return mount(app, query);
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
          // 4. Mount the UI
          searchEngineUi.mount();
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

      const { enableClipNoteFloatButton } = await getLogseqCopliotConfig();
      if (!enableClipNoteFloatButton) return;
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


          return mountQuickCapture(app);
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
        // 4. Mount the UI
        popupUi.mount();
      }

      // Mount the highlights sidebar
      const sidebarUi = await createShadowRootUi(ctx, {
        name: 'logseq-copilot-highlights-sidebar',
        mode: shadowRootMode,
        position: 'inline',
        anchor: 'body',
        onMount: async (container) => {
          const app = document.createElement('div');
          app.id = 'logseq-copilot-highlights-sidebar';
          container.append(app);

          const root = createRoot(app);
          root.render(<HighlightsSidebarContainer />);
          return root;
        },
        onRemove: async (root) => {
          if (root) {
            const toUnmount = await root;
            toUnmount?.unmount();
          }
        },
      });

      if (sidebarUi) {
        sidebarUi.mount();
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

