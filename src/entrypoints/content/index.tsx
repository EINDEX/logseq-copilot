import { getLogseqCopliotConfig } from '@/config';
import { fixDuckDuckGoDark } from '@/utils';
import { searchEngineConfig } from '@/utils/storage';
import { createRoot } from 'react-dom/client';
import { browser } from 'wxt/browser';
import { LogseqCopliot } from './LogseqCopliot';
import mountQuickCapture from './QuickCapture';
import searchEngines, {
  Baidu,
  Bing,
  Ecosia,
  DuckDuckGo,
  Google,
  SearX,
  Yandex,
  CustomSearchEngine,
} from './searchingEngines/searchingEngines';

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

    async function getEngine() {
      // Get enabled search engines from storage
      const enabledEngines = await searchEngineConfig.getValue();
      const enabledEngineIds = new Set(
        enabledEngines.filter(e => e.enabled).map(e => e.id)
      );

      // First try built-in search engines
      for (const engine of searchEngines) {
        if (engine.isMatch() && enabledEngineIds.has(engine.getId())) {
          return engine;
        }
      }

      // Then try custom search engines
      const customEngines = enabledEngines.filter(e => e.enabled && e.isCustom);
      for (const engineConfig of customEngines) {
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

    const connect = browser.runtime.connect();

    const mount = async (container: Element, query: string) => {
      const root = createRoot(container);

      connect.postMessage({ type: 'query', query: query });

      root.render(<LogseqCopliot connect={connect} />);
      return root;
    };

    async function run(
      searchEngine: Google | Bing | Ecosia | DuckDuckGo | Yandex | SearX | Baidu | CustomSearchEngine,
    ) {
      console.debug('Logseq copliot', window.location.hostname);

      if (searchEngine instanceof DuckDuckGo) {
        fixDuckDuckGoDark()
      }

              const query = searchEngine.getQuery();
        if (query) {
          console.log(`match ${typeof searchEngine}, query ${query}`);
          const container = await searchEngine.gotElement();
          if (!container) {
            console.warn('Failed to get container element for search engine');
            return;
          }
          // Executed when content script is loaded, can be async
          const searchEngineUi = await createShadowRootUi(ctx, {
          name: 'logseq-copilot-search-engine',
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

    const searchEngine = await getEngine();

    await new Promise(resolve => setTimeout(resolve, 200));

    if (searchEngine) {
      run(searchEngine);
      if (searchEngine.reload) {
        searchEngine.reload(() => run(searchEngine));
      }
    }

    const { enableClipNoteFloatButton } = await getLogseqCopliotConfig();
    if (!enableClipNoteFloatButton) return;
    // Executed when content script is loaded, can be async
    const popupUi = await createShadowRootUi(ctx, {
      name: 'logseq-copilot-popup',
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


  },
})

