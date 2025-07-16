import { buildTurndownService } from '@/utils';
import { useEffect, useState } from 'react';
import { Container, createRoot } from 'react-dom/client';
import { browser, type Browser } from 'wxt/browser';
import logo from '../../assets/img/logo.png';
import { ThemeProvider } from '@/components/ThemeProvider';
import '@/assets/globals.css';
import scssStyles from './index.module.scss';


const logseqCopilotPopupId = 'logseq-copilot-popup';
export const zIndex = '2147483647';
const highlights = CSS.highlights;

const capture = () => {
  const selection = getSelection();
  if (selection !== null) {
    const range = selection.getRangeAt(0);
    setHighlight(range);
    const clonedSelection = range.cloneContents();
    const turndownService = buildTurndownService();
    selection.empty();
    browser.runtime.sendMessage({
      type: 'clip-with-selection',
      data: turndownService.turndown(clonedSelection),
    });
  } else {
    clipPage();
  }
};

const clipPage = () => {
  browser.runtime.sendMessage({
    type: 'clip-page'
  })
};

const setHighlight = (range: Range) => {
  try {
    if (!highlights.has("copilot-highlight")) {
      highlights.set('copilot-highlight', new Highlight())
    }
    const highlight = highlights.get('copilot-highlight');
    if (highlight) {
      highlight.add(range);
    }
  } catch (error) {
    console.debug("platform not support highlight function")
  }
}


browser.runtime.onMessage.addListener((request) => {
  if (request.type === 'clip-with-selection' || request.type === 'clip') {
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
    const selection = getSelection();
    const haveSelection = selection && selection.toString().trim().length > 0;
    const target = event.target as HTMLElement;
    const isButton = target && target.className && target.className.includes("quickCapture")
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

    return () => {
      document.removeEventListener('mouseup', clicked);
      document.removeEventListener('mousedown', clicked);
    };
  }, []);

  const styles = (): React.CSSProperties => {
    return {
      display: show ? 'block' : 'none',
      position: 'absolute',
      left: `${position.x}px`,
      top: `${position.y}px`,
      zIndex: zIndex,
      background: 'var(--background, #fff)',
      border: '1px solid var(--border, #e5e7eb)',
      borderRadius: '8px',
      padding: '4px',
      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
    };
  };

  return (
    <div className={scssStyles.popupButton} style={styles()}>
      <img
        className={`${scssStyles.popupButton} quickCapture`}
        src={logo}
        onClick={capture}
        alt={'clip-button'}
        style={{
          filter: 'var(--logo-filter, none)',
          opacity: 0.8,
        }}
      />
    </div>
  );
};

const ThemedQuickCapture = () => {
  return (
    <ThemeProvider>
      <QuickCapture />
    </ThemeProvider>
  );
};

const mountQuickCapture = (contrainer: Container) => {
  const root = createRoot(contrainer);
  root.render(<ThemedQuickCapture />);
  return root;
};

export default mountQuickCapture;
