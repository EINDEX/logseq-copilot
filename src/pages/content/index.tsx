import './index.scss';
import { createRoot } from 'react-dom/client';
import { LogseqCopliot } from './components/LogseqCopliot';

const connect = chrome.runtime.connect();

const mount = async (query: string) => {
  const container = document.createElement('div');
  const asideElement = document.getElementById('rhs');

  const hasAside = !!asideElement;

  if (hasAside) {
    asideElement.insertBefore(container, asideElement.firstChild);
  } else {
    const noAsideElement = document.getElementById('rcnt');
    noAsideElement!.appendChild(container);
  }

  const root = createRoot(container);

  connect.postMessage({ type: 'query', query: query });

  root.render(<LogseqCopliot connect={connect} hasAside={hasAside} />);
};

async function run() {
  console.debug('Logseq copliot', window.location.hostname);

  const searchURL = new URL(window.location.href);
  const query = searchURL.searchParams.get('q');
  if (!query) {
    return;
  }

  if (window.location.hostname === 'www.google.com') {
    await mount(query);
  }
}

run();
