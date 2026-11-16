import { buildTurndownService } from '@/utils';
import { useEffect, useRef, useState } from 'react';
import { Container, createRoot } from 'react-dom/client';
import { browser, type Browser } from 'wxt/browser';
// `?inline` keeps the logo a data: URI whatever its size: the page cannot
// load a chrome-extension:// URL that is not web accessible.
import logo from '../../assets/img/logo.png?inline';
import { ThemeProvider } from '@/components/ThemeProvider';
import { sendMessage } from '@/types/messaging';
import { HighlightManager } from '@/utils/highlight-manager';
import { highlightClippedTextItem } from '@/utils/storage';
import { ThemedHighlightCommentPopup } from '@/components/HighlightCommentPopup';
import type { HighlightData } from '@/types/highlight';
import { contentEvents } from '@/utils/content-events';
import { zIndex } from '@/utils/z-index';
import '@/assets/globals.css';
// Content-script only rules (search keyword highlight).
import './index.module.scss';
import log from '@/utils/logger';
import { clipErrorMessage, type ClipCommandOptions } from '@/utils/clip-feedback';
import type { ClipResult } from '@/types/clip';
import { ClipToast } from './ClipToast';
import { ClipPicker } from './ClipPicker';
import { confirmActivePicker, openClipPicker } from './clip-picker';
import { defaultTemplateIdItem, templates } from '@/utils/storage';
import { pickerCandidates, skipPicker } from '@/utils/template-choice';


const logseqCopilotPopupId = 'logseq-copilot-popup';

/** The page has a selection that a clip would take instead of the page link. */
export const hasClippableSelection = (
  selection: Selection | null = getSelection(),
): selection is Selection =>
  // getSelection() is never null in practice; with no selection rangeCount is 0.
  !!selection && selection.rangeCount > 0 && !selection.isCollapsed;

/** The selection, taken when a clip starts: its text and its range. */
interface Captured {
  text: string;
  range: Range;
}

/**
 * The selection as Markdown, with a clone of its range (the highlight is saved
 * from it): moving focus later (the picker panel) cannot lose it. Null without
 * a selection: the clip is the page link.
 */
const captureSelection = (): Captured | null => {
  const selection = getSelection();
  if (!hasClippableSelection(selection)) return null;
  const range = selection.getRangeAt(0).cloneRange();
  return {
    text: buildTurndownService().turndown(range.cloneContents()),
    range,
  };
};

/**
 * Clip `captured` (or, without a selection, the page link). Resolves with the
 * clip once it is in Logseq and rejects with the readable error when it is not;
 * the highlight is saved only once the clip is in Logseq, with the "Highlight
 * clipped text" option on, and does not hold it up. `note` is what the user typed in
 * the picker panel: it goes to the template and to the highlight.
 */
const sendClip = async (
  captured: Captured | null,
  templateId?: string,
  note?: string,
): Promise<ClipResult> => {
  if (!captured) return await clipPage(templateId, note);
  const { text, range } = captured;
  getSelection()?.empty();
  const clipped = await sendMessage(
    'logseq:clipWithSelection',
    templateId === undefined && !note
      ? text
      : {
          text,
          ...(templateId !== undefined && { templateId }),
          ...(note && { note }),
        },
  );
  // A failed clip threw above: it leaves no highlight.
  void saveHighlightIfEnabled(range, note);
  return clipped;
};

const saveHighlightIfEnabled = async (range: Range, note?: string) => {
  try {
    if (!(await highlightClippedTextItem.getValue())) return;
  } catch (error) {
    log.debug('[QuickCapture] Could not read the highlight option', error);
    return;
  }
  await saveHighlight(range, note);
};

const capture = (templateId?: string) => sendClip(captureSelection(), templateId);

const saveHighlight = async (range: Range, note?: string) => {
  try {
    // Add temporary highlight for immediate feedback, then persist it.
    const highlightManager = HighlightManager.getInstance();
    highlightManager.addTemporaryHighlight(range);
    // Only saving needs the restored highlight state; the clip must not wait
    // for a slow restore.
    await highlightManager.ready;
    await highlightManager.addHighlight(range, note || undefined);
  } catch (error) {
    log.debug('[QuickCapture] Failed to save highlight', error);
  }
};

const clipPage = async (templateId?: string, note?: string): Promise<ClipResult> => {
  const data = {
    ...(templateId !== undefined && { templateId }),
    ...(note && { note }),
  };
  return Object.keys(data).length === 0
    ? await sendMessage('logseq:clipPage')
    : await sendMessage('logseq:clipPage', data);
};

/**
 * A clip started in the page: a failure is shown in the page (ClipError), a
 * success says where it went (ClipToast).
 */
const clipInPage = async (clip: () => Promise<ClipResult>) => {
  try {
    const result = await clip();
    contentEvents.emit('clipped', { result, feedback: 'page' });
  } catch (error) {
    log.error('[QuickCapture] Clip failed', error);
    contentEvents.emit('clipFailed', { message: clipErrorMessage(error) });
  }
};

/**
 * Clip commands from the content script's message handlers: the clip shortcut
 * and the context menu (the background), "Clip selection" (the browser
 * sidebar). The sidebar drawn on the page calls it directly. A command that
 * names its template, and the sidebars, are explicit choices: no picker.
 */
export const runClipCommand = (
  command: 'selectionOrPage' | 'page',
  { feedback = 'page', templateId }: ClipCommandOptions = {},
): Promise<void> => {
  const clip = () =>
    command === 'page' ? clipPage(templateId) : capture(templateId);
  return feedback === 'sender' ? clip().then(() => undefined) : clipInPage(clip);
};

/**
 * The clip shortcut and the float button: the picker panel when more than one
 * template is on offer (the ones whose rules match the page, the default and
 * the pinned ones), else the clip is saved at once, as it always was. The shortcut again while the panel is up
 * saves with the highlighted template.
 */
export const runPickedClip = async (): Promise<void> => {
  if (confirmActivePicker()) return;
  const [list, defaultId] = await Promise.all([
    templates.getValue(),
    defaultTemplateIdItem.getValue(),
  ]);
  const candidates = pickerCandidates(list, defaultId, location.href);
  if (skipPicker(candidates)) return runClipCommand('selectionOrPage');
  // The panel takes the focus, and with it the page's selection may go.
  const captured = captureSelection();
  openClipPicker({
    templates: candidates.map(({ id, name }) => ({ id, name })),
    onDecide: ({ templateId, note }) =>
      void clipInPage(() => sendClip(captured, templateId, note)),
  });
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
        onClick={() => void runPickedClip()}
        alt={'clip-button'}
        width={FLOAT_BUTTON_ICON}
        height={FLOAT_BUTTON_ICON}
        draggable={false}
        style={{
          display: 'block',
          width: `${FLOAT_BUTTON_ICON}px`,
          height: `${FLOAT_BUTTON_ICON}px`,
          maxWidth: 'none',
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
      <ClipToast />
      <ClipPicker />
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
