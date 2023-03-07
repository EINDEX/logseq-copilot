import _ from 'lodash';
import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import TurndownService from 'turndown';
import Browser from 'webextension-polyfill';
import logo from '../../assets/img/logo.png';
import scssStyles from './index.module.scss';

const logseqCopilotPopupId = 'logseq-copilot-popup';
export const zIndex = '2147483647';

const connect = Browser.runtime.connect();

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

  // const capture = async (data: string) => {
  //   const tab = await Browser.tabs.query({ active: true, currentWindow: true });
  //   if (!tab) return;
  //   const activeTab = tab[0];
  //   window.open(
  //     `logseq://x-callback-url/quickCapture?title=${
  //       activeTab.title
  //     }&url=${encodeURIComponent(activeTab.url)}&content=${data}`,
  //   );
  // };

  const quickCapture = () => {
    setShow(false);
    const selection = getSelection();
    const range = selection!.getRangeAt(0);
    const clonedSelection = range.cloneContents();
    const turndownService = new TurndownService();
    selection?.removeAllRanges();
    connect.postMessage({
      type: 'quick-capture',
      data: turndownService.turndown(clonedSelection),
    });
    console.log('quick-capture');
  };

  useEffect(() => {
    document.addEventListener('mouseup', _.debounce(clicked, 100));
    document.addEventListener('mousedown', _.debounce(release, 100));
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
        alt={'logseq-quickcapture-button'}
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
