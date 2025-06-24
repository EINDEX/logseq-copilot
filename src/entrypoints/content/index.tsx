import { getLogseqCopliotConfig } from '@/config';
import { fixDuckDuckGoDark } from '@/utils';
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

    function getEngine() {
      for (const engine of searchEngines) {
        if (engine.isMatch()) {
          return engine;
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
      searchEngine: Google | Bing | Ecosia | DuckDuckGo | Yandex | SearX | Baidu,
    ) {
      console.debug('Logseq copliot', window.location.hostname);

      if (searchEngine instanceof DuckDuckGo) {
        fixDuckDuckGoDark()
      }

      const query = searchEngine.getQuery();
      if (query) {
        console.log(`match ${typeof searchEngine}, query ${query}`);
        const container = await searchEngine.gotElement();
        // Executed when content script is loaded, can be async
        const searchEngineUi = await createShadowRootUi(ctx, {
          name: 'logseq-copilot-search-engine',
          position: 'inline',
          anchor: container,
          append: 'first',
          onMount: async (container) => {
            // Container is a body, and React warns when creating a root on the body, so create a wrapper div
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

    const searchEngine = getEngine();

    await new Promise(resolve => setTimeout(resolve, 200));

    if (searchEngine) {
      run(searchEngine);
      if (searchEngine.reload) {
        searchEngine.reload(() => run(searchEngine));
      }
    }


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

        const { enableClipNoteFloatButton } = await getLogseqCopliotConfig();
        if (!enableClipNoteFloatButton) return;
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

