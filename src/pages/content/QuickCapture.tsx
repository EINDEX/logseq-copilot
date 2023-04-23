import { buildTurndownService } from '@/utils';
import { debounce } from '@/utils';
import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import Browser from 'webextension-polyfill';
import logo from '../../assets/img/logo.png';
import scssStyles from './index.module.scss';

const logseqCopilotPopupId = 'logseq-copilot-popup';
export const zIndex = '2147483647';

const connect = Browser.runtime.connect();

const capture = () => {
  const selection = getSelection();
  const range = selection!.getRangeAt(0);
  const clonedSelection = range.cloneContents();
  const turndownService = buildTurndownService();
  selection?.removeAllRanges();
  connect.postMessage({
    type: 'clip-with-selection',
    data: turndownService.turndown(clonedSelection),
  });
};

const clipPage = () => {
  connect.postMessage({
    type: 'clip-page'
  });
};

Browser.runtime.onMessage.addListener((request) => {
  if (request.type === 'clip-with-selection') {
    capture();
  } else if (request.type === 'clip-page') {
    clipPage();
  }
});

const QuickCapture = () => {
  const [position, setPostion] = useState({
    x: 0,
    y: 0,
  });
  const [show, setShow] = useState(false);

  const clicked = (event: MouseEvent) => {
    if (show) {
      return;
    }
    const selection = getSelection();
    if (selection && selection.toString().trim() !== '') {
      setShow(true);
      setPostion({ x: event.pageX + 10, y: event.pageY + 10 });
      console.log('clicked');
    }
  };

  const release = (event: MouseEvent) => {
    setShow(false);
  };

  const quickCapture = () => {
    setShow(false);
    capture();
  };

  useEffect(() => {
    document.addEventListener('mouseup', debounce(clicked, 100));
    document.addEventListener('mousedown', debounce(release, 100));
  });

  const styles = (): React.CSSProperties => {
    return {
      display: show ? 'block' : 'none',
      position: 'absolute',
      left: `${position.x}px`,
      top: `${position.y}px`,
      zIndex: zIndex,
      background: '#fff',
    };
  };

  return (
    <div className={scssStyles.popupButton} style={styles()}>
      <img
        className={scssStyles.popupButton}
        src={logo}
        onClick={quickCapture}
        alt={'clip-button'}
      />
    </div>
  );
};

const mountQuickCapture = () => {
  const contrainer = document.createElement('div');
  contrainer.id = logseqCopilotPopupId;
  document.getElementsByTagName('body')[0].appendChild(contrainer);
  const root = createRoot(contrainer);

  root.render(<QuickCapture />);
};

export default mountQuickCapture;
