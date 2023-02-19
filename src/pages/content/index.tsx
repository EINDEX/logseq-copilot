import './index.scss';
import { createRoot } from 'react-dom/client';
import { LogseqCopliot } from './components/LogseqCopliot';
import searchEngins from './searchingEngines/searchingEngines';
import { Container } from '@chakra-ui/react';

const connect = chrome.runtime.connect();

const mount = async (container: Element, query: string) => {
  const root = createRoot(container);

  connect.postMessage({ type: 'query', query: query });

  root.render(<LogseqCopliot connect={connect} />);
};

async function run(searchEngine) {
  console.debug('Logseq copliot', window.location.hostname);

  if (searchEngine.isMatch()) {
    const query = searchEngine.getQuery();
    if (query) {
      console.log(`match ${typeof searchEngine}, query ${query}`);
      const container = await searchEngine.gotElement();
      await mount(container, query);
    }
  }
}

function getEngine() {
  for (const engine of searchEngins) {
    if (engine.isMatch()) {
      return engine;
    }
  }
}

const searchEngine = getEngine();

run(searchEngine);

if (searchEngine.reload) {
  searchEngine.reload(() => run(searchEngine));
}
