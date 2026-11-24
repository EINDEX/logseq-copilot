/**
 * Docks the pinned in-page sidebar: the page gives up the sidebar's width at
 * the right, so the sidebar no longer covers it. Everything it does to the
 * page is one `<style>` element and one data attribute on some fixed
 * elements; removeSidebarDock takes both away again.
 *
 * How the page makes room:
 * - `html { margin-right: W }`. Everything in the normal flow, sticky
 *   elements included, lays out in the narrower root box. The page's own
 *   scrollbar stays at the window's edge: the sidebar is drawn left of it
 *   (it is `position: fixed; right: 0`), as when it is not pinned.
 * - A static root also gets `position: relative`: absolute elements without
 *   a positioned parent are placed against the root box instead of the
 *   window (YouTube's whole app is one). Trade-off: one placed against the
 *   bottom of the window now goes by the bottom of the page.
 * - Fixed elements are placed against the viewport, not the root box, so the
 *   margin does not move them. The ones that reach under the sidebar get the
 *   attribute and a rule in the same stylesheet: one across the window (a
 *   header) ends at the sidebar; one nearer the right edge (a chat button)
 *   moves W to the left, or ends at the sidebar if too wide to move. Centred
 *   ones (dialogs) and scaled or turned ones are left alone: moving them
 *   would place them wrong. A moved element keeps its rule until it leaves
 *   the page or stops being fixed, so changes of the page do not measure it
 *   again (that would restart its transitions); a resize measures all again.
 *   Fixed elements inside the page's own shadow roots are not reached.
 * The push follows the content script: a page loads at the full width, then
 * makes room.
 * Tried and not used: `width: calc(100% - W)` on the root (same as the
 * margin, but loses to pages that size the root themselves); making the root
 * the containing block of fixed elements (a transform or `contain` on it):
 * fixed headers then scroll away with the page; CSS `zoom` on the root
 * shrinks the text of the whole page. None of them changes the width media
 * queries see, nor does this: the page keeps the layout of the full window.
 * Elements `100vw` wide still reach under the sidebar (the root box is
 * narrower than they are), and so does a page with a minimum width larger
 * than what is left (DuckDuckGo): the page scrolls sideways. The root's
 * overflow is left alone, since setting it would stop the page's own
 * `overflow: hidden` on body from locking the scroll.
 * On a window too narrow for both (less than MIN_PAGE_WIDTH left for the
 * page) it does not push, and has no stylesheet in the page: the sidebar
 * covers the page as when it is not pinned, until the window is wider again.
 */

/** The sidebar's width on wide windows (InPageSidebar: `min(360px, 100vw)`). */
export const SIDEBAR_WIDTH = 360;
/** Narrower than this left for the page, the sidebar covers it instead. */
export const MIN_PAGE_WIDTH = 640;

const STYLE_ID = 'logseq-copilot-sidebar-dock';
/** On fixed elements moved out from under the sidebar; its value keys their rule. */
export const DOCK_ATTRIBUTE = 'data-logseq-copilot-dock';
/** How often, at most, the page is looked through again for fixed elements. */
const RESCAN_MS = 500;

interface Dock {
  style: HTMLStyleElement;
  /** The fixed elements given the attribute, with their rule. */
  moved: Map<Element, string>;
  nextId: number;
  /** The rule of the root: its margin, and a containing block for absolute elements. */
  root: string;
  pushing: boolean;
  /** The next scan measures every fixed element again (the window changed). */
  remeasure: boolean;
  timer: ReturnType<typeof setTimeout> | null;
  observer: MutationObserver;
  onResize: () => void;
}

const docks = new WeakMap<Document, Dock>();

const px = (value: string): number => {
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : 0;
};

/** No transform, or one that only moves the element: it can be placed by left and right. */
const movesOnly = (transform: string) =>
  !transform || transform === 'none' || /^matrix\(1, 0, 0, 1, [^,]+, [^,]+\)$/.test(transform);

/**
 * The declarations that keep a fixed element out from under the sidebar, or
 * null for one left alone.
 */
const declarationsFor = (element: Element, view: Window): string | null => {
  const style = view.getComputedStyle(element);
  if (style.position !== 'fixed' || style.display === 'none') return null;
  // Scaled or turned: left and right would not place it where it should be.
  if (!movesOnly(style.transform)) return null;
  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;
  const viewport = view.document.documentElement.clientWidth;
  const edge = viewport - SIDEBAR_WIDTH;
  // Not under the sidebar, or off the window (a drawer kept out of sight).
  if (rect.right <= edge + 0.5 || rect.left >= viewport) return null;
  const right = px(style.right) + SIDEBAR_WIDTH;
  const stretch = `left:${px(style.left)}px!important;right:${right}px!important;width:auto!important;max-width:none!important`;
  // Across the window (a header, a bar): it ends at the sidebar.
  if (rect.left <= 1 && rect.right >= viewport - 1) return stretch;
  // Nearer the right edge than the left one (a chat button, a cookie box):
  // it moves left of the sidebar, or ends at it if it is too wide to move.
  if (viewport - rect.right < rect.left - 1) {
    return rect.width <= edge ? `left:auto!important;right:${right}px!important` : stretch;
  }
  // Centred, or at the left (a dialog): moving it would place it wrong.
  return null;
};

/**
 * The root gives up the width. A static root also becomes the containing
 * block of absolute elements placed against the window (YouTube's whole app
 * is one), so they keep within it too.
 */
const rootRule = (view: Window) =>
  (view.getComputedStyle(view.document.documentElement).position || 'static') === 'static'
    ?`html{margin-right:${SIDEBAR_WIDTH}px!important;position:relative!important}`
    : `html{margin-right:${SIDEBAR_WIDTH}px!important}`;

const render = (dock: Dock, doc: Document) => {
  const rules = dock.pushing
    ? [dock.root, ...dock.moved.values()]
    : [];
  // No empty stylesheet left in the page while it does not push.
  if (!rules.length) {
    dock.style.remove();
    return;
  }
  const text = rules.join('\n');
  if (dock.style.textContent !== text) dock.style.textContent = text;
  if (!dock.style.isConnected) (doc.head ?? doc.documentElement).append(dock.style);
};

const unmark = (dock: Dock, element: Element) => {
  element.removeAttribute(DOCK_ATTRIBUTE);
  dock.moved.delete(element);
};

/**
 * Looks the page through for fixed elements under the sidebar. Elements
 * already moved keep their rule (no new measuring, so no restarted
 * transitions), until they leave the page or stop being fixed; after a
 * resize all are measured again.
 */
const scan = (dock: Dock, doc: Document) => {
  const view = doc.defaultView!;
  dock.pushing = view.innerWidth - SIDEBAR_WIDTH >= MIN_PAGE_WIDTH;
  for (const element of [...dock.moved.keys()]) {
    if (
      !dock.pushing ||
      dock.remeasure ||
      !element.isConnected ||
      view.getComputedStyle(element).position !== 'fixed'
    ) {
      unmark(dock, element);
    }
  }
  dock.remeasure = false;
  if (dock.pushing && doc.body) {
    // Measured first, marked after: a mark moves an element, which must not
    // change what the next one measures.
    const found: [Element, string][] = [];
    const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_ELEMENT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (dock.moved.has(node as Element)) continue;
      const declarations = declarationsFor(node as Element, view);
      if (declarations) found.push([node as Element, declarations]);
    }
    for (const [element, declarations] of found) {
      const id = String(dock.nextId++);
      element.setAttribute(DOCK_ATTRIBUTE, id);
      dock.moved.set(element, `[${DOCK_ATTRIBUTE}="${id}"]{${declarations}}`);
    }
  }
  render(dock, doc);
};

const schedule = (dock: Dock, doc: Document) => {
  if (dock.timer !== null) return;
  dock.timer = setTimeout(() => {
    dock.timer = null;
    scan(dock, doc);
  }, RESCAN_MS);
};

/**
 * Makes the page give up the sidebar's width at the right, and keeps it so as
 * the page changes and the window is resized. Calling it again does nothing.
 */
export function applySidebarDock(doc: Document = document): void {
  if (docks.has(doc)) return;
  const view = doc.defaultView;
  if (!view) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  const dock: Dock = {
    style,
    moved: new Map(),
    nextId: 0,
    // Read before the stylesheet is in: the page's own position of the root.
    root: rootRule(view),
    pushing: false,
    remeasure: false,
    timer: null,
    // Elements added, or changing class or style, can be new fixed ones.
    observer: new MutationObserver((records) => {
      // Not for its own changes: the attribute and the stylesheet.
      const own = records.every(
        (record) =>
          record.target === style ||
          (record.type === 'childList' &&
            [...record.addedNodes, ...record.removedNodes].every((node) => node === style)),
      );
      if (!own) schedule(dock, doc);
    }),
    onResize: () => {
      dock.remeasure = true;
      schedule(dock, doc);
    },
  };
  docks.set(doc, dock);
  scan(dock, doc);
  dock.observer.observe(doc.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'style'],
  });
  view.addEventListener('resize', dock.onResize);
}

/** Gives the page back its own layout: no stylesheet, attributes nor listeners left. */
export function removeSidebarDock(doc: Document = document): void {
  const dock = docks.get(doc);
  // Also one left by an earlier content script of this page (an update of
  // the extension).
  doc.getElementById(STYLE_ID)?.remove();
  doc.querySelectorAll(`[${DOCK_ATTRIBUTE}]`).forEach((element) => element.removeAttribute(DOCK_ATTRIBUTE));
  if (!dock) return;
  docks.delete(doc);
  dock.observer.disconnect();
  doc.defaultView?.removeEventListener('resize', dock.onResize);
  if (dock.timer !== null) clearTimeout(dock.timer);
  dock.style.remove();
  dock.moved.clear();
}

/** The sidebar is docked in this document (applySidebarDock without removeSidebarDock since). */
export const isSidebarDocked = (doc: Document = document): boolean => docks.has(doc);
