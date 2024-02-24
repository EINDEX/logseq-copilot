import { getLogseqCopliotConfig } from '@/config';
import { fixDuckDuckGoDark } from '@/utils';
import { createRoot } from 'react-dom/client';
import Browser from 'webextension-polyfill';
import { LogseqCopliot } from './LogseqCopliot';
import mountQuickCapture from './QuickCapture';
import searchEngines, {
  Baidu,
  Bing,
  DuckDuckGo,
  Google,
  SearX,
  Yandex,
} from './searchingEngines/searchingEngines';

const connect = Browser.runtime.connect();

const mount = async (container: Element, query: string) => {
  const root = createRoot(container);

  connect.postMessage({ type: 'query', query: query });

  root.render(<LogseqCopliot connect={connect} />);
};

async function run(
  searchEngine: Google | Bing | DuckDuckGo | Yandex | SearX | Baidu,
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
