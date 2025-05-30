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

  // // Set include/exclude if the background should be removed from some builds
  // include: undefined | string[],
  // exclude: undefined | string[],

  // // Configure how CSS is injected onto the page
  // cssInjectionMode: undefined | "manifest" | "manual" | "ui",

  // // Configure how/when content script will be registered
  // registration: undefined | "manifest" | "runtime",

  main(ctx) {
    // Executed when content script is loaded, can be async
    const connect = browser.runtime.connect();

    const mount = async (container: Element, query: string) => {
      const root = createRoot(container);

      connect.postMessage({ type: 'query', query: query });

      root.render(<LogseqCopliot connect={connect} />);
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
        await mount(container, query);
      }
    }

    function getEngine() {
      for (const engine of searchEngines) {
        if (engine.isMatch()) {
          return engine;
        }
      }
    }

    const searchEngine = getEngine();

    if (searchEngine) {
      setTimeout(() => run(searchEngine), 200);
      if (searchEngine.reload) {
        searchEngine.reload(() => run(searchEngine));
      }
    }

    getLogseqCopliotConfig().then(({ enableClipNoteFloatButton }) => {
      if (!enableClipNoteFloatButton) return;
      mountQuickCapture();
    });

  },
})

