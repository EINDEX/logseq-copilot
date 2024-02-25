import { buildTurndownService } from '@/utils';
import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import Browser from 'webextension-polyfill';
import logo from '../../assets/img/logo.png';
import scssStyles from './index.module.scss';

const logseqCopilotPopupId = 'logseq-copilot-popup';
export const zIndex = '2147483647';
const highlights = CSS.highlights;

const QuickCapture = () => {
  const [position, setPostion] = useState({
    x: 0,
    y: 0,
  });
  const [show, setShow] = useState(false);

  const setHighlight = (range: Range) => {
    if(!highlights.has("copilot-highlight")) {
      highlights.set('copilot-highlight', new Highlight())
    }
    const highlight = highlights.get('copilot-highlight');
    highlight.add(range);
  }

  const capture = () => {
    const selection = getSelection();
    if (selection !== null) {
      const range = selection.getRangeAt(0);
      setHighlight(range);
      const clonedSelection = range.cloneContents();
      const turndownService = buildTurndownService();
      selection.empty();
      Browser.runtime.sendMessage({
        type: 'clip-with-selection',
        data: turndownService.turndown(clonedSelection),
      });
    } else {
      clipPage();
    }
  };

  const clipPage = () => {
    Browser.runtime.sendMessage({
      type: 'clip-page'
    })
  };


  const clicked = (event: MouseEvent) => {
    const selection = getSelection();
    const haveSelection = selection && selection.toString().trim().length > 0;
    const isButton = event.target && event.target.className && event.target.className.includes("quickCapture")
    if (isButton) {
      if (event.type === "mouseup") {
        setShow(false);
      }
      return;
    }
    if (haveSelection && event.type === "mouseup") {
      setShow(true);
      setPostion({ x: event.pageX + 10, y: event.pageY + 10 });
    } else {
      setShow(false)
    }
  };

  useEffect(() => {
    document.addEventListener('mouseup', clicked);
    document.addEventListener('mousedown', clicked);
    Browser.runtime.onMessage.addListener((request) => {
      if (request.type === 'clip-with-selection' || request.type === 'clip') {
        capture();
      } else if (request.type === 'clip-page') {
        clipPage();
      }
    });
  }, []);

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
        className={`${scssStyles.popupButton} quickCapture`}
        src={logo}
        onClick={capture}
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
