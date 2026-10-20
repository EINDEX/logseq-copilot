import { buildTurndownService } from '@/utils';
import { useEffect, useState } from 'react';
import { Container, createRoot } from 'react-dom/client';
import { browser, type Browser } from 'wxt/browser';
import logo from '../../assets/img/logo.png';
import { ThemeProvider } from '@/components/ThemeProvider';
import { sendMessage } from '@/types/messaging';
import { HighlightManager } from '@/utils/highlight-manager';
import { ThemedHighlightCommentPopup } from '@/components/HighlightCommentPopup';
import type { HighlightData } from '@/types/highlight';
import { contentEvents } from '@/utils/content-events';
import '@/assets/globals.css';
import scssStyles from './index.module.scss';


const logseqCopilotPopupId = 'logseq-copilot-popup';
export const zIndex = '2147483647';

const capture = async () => {
  const selection = getSelection();
  // getSelection() is never null in practice; with no selection rangeCount is 0.
  if (selection && selection.rangeCount > 0 && !selection.isCollapsed) {
    const range = selection.getRangeAt(0);
    const clonedSelection = range.cloneContents();
    const turndownService = buildTurndownService();
    selection.empty();
    // Clip first so a highlight failure never blocks the clip itself.
    sendMessage('logseq:clipWithSelection', turndownService.turndown(clonedSelection));

    try {
      // Add temporary highlight for immediate feedback, then persist it.
      const highlightManager = HighlightManager.getInstance();
      highlightManager.addTemporaryHighlight(range);
      const savedHighlight = await highlightManager.addHighlight(range);

      // Notify the sidebar of the new highlight
      if (savedHighlight) {
        contentEvents.emit('highlightAdded', savedHighlight);
      }
    } catch (error) {
      console.debug('[QuickCapture] Failed to save highlight', error);
    }
  } else {
    clipPage();
  }
};

const clipPage = () => {
  sendMessage('logseq:clipPage');
};




// Commands relayed from the content script message handlers (in-memory bus,
// not DOM events that page scripts could dispatch to trigger a clip)
contentEvents.on('quickCapture', capture);
contentEvents.on('quickCaptureWithSelection', capture);
contentEvents.on('quickCapturePage', clipPage);

const QuickCapture = () => {
  const [position, setPostion] = useState({
    x: 0,
    y: 0,
  });
  const [show, setShow] = useState(false);
  const [commentPopup, setCommentPopup] = useState<{
    show: boolean;
    highlightData: HighlightData | null;
    position: { x: number; y: number };
  }>({
    show: false,
    highlightData: null,
    position: { x: 0, y: 0 }
  });



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

    // HighlightManager asks for the comment popup through the in-memory
    // content-script event bus; DOM events on document could be forged by
    // page scripts.
    const offShowHighlightComment = contentEvents.on(
      'showHighlightComment',
      ({ highlightData, clickPosition }) => {
        setCommentPopup({
          show: true,
          highlightData,
          position: clickPosition,
        });
      },
    );

    return () => {
      document.removeEventListener('mouseup', clicked);
      document.removeEventListener('mousedown', clicked);
      offShowHighlightComment();
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

  const handleCommentPopupClose = () => {
    setCommentPopup({
      show: false,
      highlightData: null,
      position: { x: 0, y: 0 }
    });
  };

  const handleCommentUpdate = (updatedHighlight: HighlightData) => {
    // Optionally refresh highlight data or notify other components
    console.log('Highlight updated:', updatedHighlight);
  };

  const handleCommentDelete = (highlightId: string) => {
    // Optionally refresh highlight data or notify other components
    console.log('Highlight deleted:', highlightId);
  };

  return (
    <>
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

      {/* Comment Popup */}
      {commentPopup.show && commentPopup.highlightData && (
        <ThemedHighlightCommentPopup
          highlightData={commentPopup.highlightData}
          position={commentPopup.position}
          onClose={handleCommentPopupClose}
          onUpdate={handleCommentUpdate}
          onDelete={handleCommentDelete}
        />
      )}
    </>
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
