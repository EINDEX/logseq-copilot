import log from './logger';

/** Standard CaretPosition (Firefox, and Chrome 128+). */
type CaretPositionLike = { offsetNode: Node; offset: number };

type CaretDocument = {
  caretPositionFromPoint?: (x: number, y: number) => CaretPositionLike | null;
  caretRangeFromPoint?: (x: number, y: number) => Range | null;
};

/**
 * A collapsed Range at the viewport point, or null when there is no text
 * position there or the browser supports neither API.
 *
 * Prefers the standard `caretPositionFromPoint` (Firefox only has this one),
 * and falls back to the legacy `caretRangeFromPoint` (older Chromium/WebKit).
 */
export function caretRangeAtPoint(x: number, y: number): Range | null {
  const doc = document as unknown as CaretDocument;
  try {
    if (typeof doc.caretPositionFromPoint === 'function') {
      const position = doc.caretPositionFromPoint(x, y);
      if (!position) return null;
      const range = document.createRange();
      range.setStart(position.offsetNode, position.offset);
      range.collapse(true);
      return range;
    }
    if (typeof doc.caretRangeFromPoint === 'function') {
      return doc.caretRangeFromPoint(x, y);
    }
  } catch (error) {
    log.debug('[caret] Failed to resolve the caret at a point', error);
  }
  return null;
}
