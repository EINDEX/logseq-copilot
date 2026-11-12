import { buildTurndownService } from '@/utils';
import { useEffect, useRef, useState } from 'react';
import { Container, createRoot } from 'react-dom/client';
import { browser, type Browser } from 'wxt/browser';
import logo from '../../assets/img/logo.png';
import { ThemeProvider } from '@/components/ThemeProvider';
import { sendMessage } from '@/types/messaging';
import { HighlightManager } from '@/utils/highlight-manager';
import { ThemedHighlightCommentPopup } from '@/components/HighlightCommentPopup';
import type { HighlightData } from '@/types/highlight';
import { contentEvents } from '@/utils/content-events';
import { zIndex } from '@/utils/z-index';
import '@/assets/globals.css';
// Content-script only rules (search keyword highlight).
import './index.module.scss';
import log from '@/utils/logger';
import { clipErrorMessage, type ClipCommandOptions } from '@/utils/clip-feedback';


const logseqCopilotPopupId = 'logseq-copilot-popup';

/** The page has a selection that a clip would take instead of the page link. */
export const hasClippableSelection = (
  selection: Selection | null = getSelection(),
): selection is Selection =>
  // getSelection() is never null in practice; with no selection rangeCount is 0.
  !!selection && selection.rangeCount > 0 && !selection.isCollapsed;

/**
 * Clip the selection (as Markdown, and highlight it) or, without one, the page
 * link. Resolves once the clip is in Logseq and rejects with the readable error
 * when it is not; saving the highlight does not hold it up.
 */
const capture = async () => {
  const selection = getSelection();
  if (!hasClippableSelection(selection)) {
    await clipPage();
    return;
  }
  const range = selection.getRangeAt(0);
  const clonedSelection = range.cloneContents();
  const turndownService = buildTurndownService();
  selection.empty();
  // Clip first so a highlight failure never blocks the clip itself.
  const clipped = sendMessage('logseq:clipWithSelection', turndownService.turndown(clonedSelection));
  void saveHighlight(range);
  await clipped;
};

const saveHighlight = async (range: Range) => {
  try {
    // Add temporary highlight for immediate feedback, then persist it.
    const highlightManager = HighlightManager.getInstance();
    highlightManager.addTemporaryHighlight(range);
    // Only saving needs the restored highlight state; the clip must not wait
    // for a slow restore.
    await highlightManager.ready;
    await highlightManager.addHighlight(range);
  } catch (error) {
    log.debug('[QuickCapture] Failed to save highlight', error);
  }
};

const clipPage = async () => {
  await sendMessage('logseq:clipPage');
};

/** A clip started in the page: a failure is shown in the page (ClipError). */
const clipInPage = async (clip: () => Promise<void>) => {
  try {
    await clip();
  } catch (error) {
    log.error('[QuickCapture] Clip failed', error);
    contentEvents.emit('clipFailed', { message: clipErrorMessage(error) });
  }
};

/**
 * Clip commands from the content script's message handlers: the clip shortcut
 * and the context menu (the background), "Clip selection" (the browser
 * sidebar). The sidebar drawn on the page calls it directly.
 */
export const runClipCommand = (
  command: 'selectionOrPage' | 'page',
  { feedback = 'page' }: ClipCommandOptions = {},
): Promise<void> => {
  const clip = command === 'page' ? clipPage : capture;
  return feedback === 'sender' ? clip() : clipInPage(clip);
};

/** Outer size of the floating button in CSS px (img + padding + border). */
export const FLOAT_BUTTON_SIZE = 32;
const FLOAT_BUTTON_ICON = 22;
const FLOAT_BUTTON_GAP = 6;

/**
 * Page coordinates for the floating button: just after the end of the
 * selection, vertically centred on its last line, so it never covers the
 * selected text. Falls back to below the end of the selection when there is
 * no room on the right, and to the pointer when the selection has no box.
 */
const floatButtonPosition = (selection: Selection, event: MouseEvent) => {
  const range = selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
  const rects = range ? Array.from(range.getClientRects()) : [];
  const last = rects.filter((r) => r.width > 0 || r.height > 0).pop();
  if (!last) return { x: event.pageX + 10, y: event.pageY + 10 };

  const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
  let x = last.right + FLOAT_BUTTON_GAP;
  let y = last.top + last.height / 2 - FLOAT_BUTTON_SIZE / 2;
  if (x + FLOAT_BUTTON_SIZE > viewportWidth - FLOAT_BUTTON_GAP) {
    x = Math.max(FLOAT_BUTTON_GAP, last.right - FLOAT_BUTTON_SIZE);
    y = last.bottom + FLOAT_BUTTON_GAP;
  }
  return { x: x + window.scrollX, y: y + window.scrollY };
};

/**
 * The floating clip button that follows a text selection. Only rendered when
 * the "floating button" option is on.
 *
 * Sizes are inline px (and on the img itself): the button lives in a shadow
 * root on any host page, and must not depend on a stylesheet class or on the
 * page's rem size. Without them the logo showed at its intrinsic 192px.
 */
const FloatButton = () => {
  const [position, setPostion] = useState({
    x: 0,
    y: 0,
  });
  const [show, setShow] = useState(false);

  const buttonRef = useRef<HTMLDivElement>(null);

  const clicked = (event: MouseEvent) => {
    const selection = getSelection();
    const haveSelection = selection && selection.toString().trim().length > 0;
    const target = event.target;
    // On `document`, a click inside our shadow root is retargeted to its host.
    // Elements outside it (SVG ones included, whose `className` is not a
    // string) are matched by selector.
    const root = buttonRef.current?.getRootNode();
    const isButton =
      (root instanceof ShadowRoot && target === root.host) ||
      (target instanceof Element && target.closest('.quickCapture') !== null);
    if (isButton) {
      if (event.type === "mouseup") {
        setShow(false);
      }
      return;
    }
    if (haveSelection && event.type === "mouseup") {
      setShow(true);
      setPostion(floatButtonPosition(selection, event));
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
      boxSizing: 'border-box',
      width: `${FLOAT_BUTTON_SIZE}px`,
      height: `${FLOAT_BUTTON_SIZE}px`,
      padding: `${(FLOAT_BUTTON_SIZE - FLOAT_BUTTON_ICON - 2) / 2}px`,
      lineHeight: 0,
      background: 'var(--background)',
      border: '1px solid var(--border)',
      borderRadius: '8px',
      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
      cursor: 'pointer',
    };
  };

  return (
    <div ref={buttonRef} style={styles()} title="Clip to Logseq">
      <img
        className="quickCapture"
        src={logo}
        onClick={() => clipInPage(capture)}
        alt={'clip-button'}
        width={FLOAT_BUTTON_ICON}
        height={FLOAT_BUTTON_ICON}
        draggable={false}
        style={{
          display: 'block',
          width: `${FLOAT_BUTTON_ICON}px`,
          height: `${FLOAT_BUTTON_ICON}px`,
          maxWidth: 'none',
          borderRadius: '9999px',
        }}
      />
    </div>
  );
};

/** How long the message of a failed clip stays, in ms. A click closes it. */
const CLIP_ERROR_MS = 8_000;

/**
 * The message of a failed clip started in the page (clip shortcut, context
 * menu, float button). Inline px, like the float button: it must not depend on
 * the host page's stylesheet or rem size.
 */
const ClipError = () => {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const off = contentEvents.on('clipFailed', (failure) => {
      setMessage(failure.message);
      clearTimeout(timer);
      timer = setTimeout(() => setMessage(null), CLIP_ERROR_MS);
    });
    return () => {
      off();
      clearTimeout(timer);
    };
  }, []);

  if (!message) return null;

  return (
    <div
      role="alert"
      data-clip-error
      onClick={() => setMessage(null)}
      style={{
        position: 'fixed',
        right: '16px',
        bottom: '16px',
        zIndex: zIndex,
        boxSizing: 'border-box',
        display: 'flex',
        alignItems: 'flex-start',
        gap: '8px',
        maxWidth: '360px',
        padding: '10px 12px',
        background: 'var(--background)',
        color: 'var(--foreground)',
        border: '1px solid var(--destructive)',
        borderRadius: '8px',
        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
        font: '13px/18px system-ui, -apple-system, "Segoe UI", sans-serif',
        whiteSpace: 'pre-line',
        overflowWrap: 'anywhere',
        cursor: 'pointer',
      }}
    >
      <img
        src={logo}
        alt=""
        width={16}
        height={16}
        draggable={false}
        style={{
          display: 'block',
          flex: 'none',
          width: '16px',
          height: '16px',
          maxWidth: 'none',
          marginTop: '1px',
          borderRadius: '9999px',
        }}
      />
      <span>{message}</span>
    </div>
  );
};

type CommentPopupState = {
  show: boolean;
  highlightData: HighlightData | null;
  position: { x: number; y: number };
};

const closedCommentPopup: CommentPopupState = {
  show: false,
  highlightData: null,
  position: { x: 0, y: 0 },
};

/**
 * The highlight comment popup. Always available, independent of the floating
 * button option: clicking a restored highlight opens it.
 */
const HighlightComment = () => {
  const [commentPopup, setCommentPopup] =
    useState<CommentPopupState>(closedCommentPopup);

  useEffect(() => {
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
    // The popup stays open while the highlight is edited or deleted in the
    // browser sidebar: show the new note, or close it.
    const offHighlightUpdated = contentEvents.on('highlightUpdated', (updated) => {
      setCommentPopup((popup) =>
        popup.highlightData?.id === updated.id
          ? { ...popup, highlightData: updated }
          : popup,
      );
    });
    const offHighlightRemoved = contentEvents.on(
      'highlightRemoved',
      ({ highlightId }) => {
        setCommentPopup((popup) =>
          popup.highlightData?.id === highlightId ? closedCommentPopup : popup,
        );
      },
    );

    return () => {
      offShowHighlightComment();
      offHighlightUpdated();
      offHighlightRemoved();
    };
  }, []);

  const handleCommentPopupClose = () => {
    setCommentPopup(closedCommentPopup);
  };

  const handleCommentUpdate = (updatedHighlight: HighlightData) => {
    // Optionally refresh highlight data or notify other components
    log.debug('Highlight updated:', updatedHighlight);
  };

  const handleCommentDelete = (highlightId: string) => {
    // Optionally refresh highlight data or notify other components
    log.debug('Highlight deleted:', highlightId);
  };

  if (!commentPopup.show || !commentPopup.highlightData) return null;

  return (
    <ThemedHighlightCommentPopup
      highlightData={commentPopup.highlightData}
      position={commentPopup.position}
      onClose={handleCommentPopupClose}
      onUpdate={handleCommentUpdate}
      onDelete={handleCommentDelete}
    />
  );
};

interface QuickCaptureProps {
  /** Show the floating clip button (the `enableClipNoteFloatButton` option). */
  showFloatButton?: boolean;
}

const QuickCapture = ({ showFloatButton = true }: QuickCaptureProps) => {
  return (
    <>
      {showFloatButton && <FloatButton />}
      <HighlightComment />
      <ClipError />
    </>
  );
};

const ThemedQuickCapture = (props: QuickCaptureProps) => {
  return (
    <ThemeProvider>
      <QuickCapture {...props} />
    </ThemeProvider>
  );
};

const mountQuickCapture = (
  contrainer: Container,
  props: QuickCaptureProps = {},
) => {
  const root = createRoot(contrainer);
  root.render(<ThemedQuickCapture {...props} />);
  return root;
};

export default mountQuickCapture;
