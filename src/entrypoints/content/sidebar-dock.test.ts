/**
 * The page making room for the pinned in-page sidebar: what it adds to the
 * page, and that taking it away leaves the page as it was.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applySidebarDock,
  DOCK_ATTRIBUTE,
  isSidebarDocked,
  removeSidebarDock,
  SIDEBAR_WIDTH,
} from './sidebar-dock';

const WINDOW = 1400;

/** A fixed element at the given place in the viewport. */
const fixed = (
  id: string,
  rect: { left: number; right: number },
  style: Record<string, string> = {},
) => {
  const element = document.createElement('div');
  element.id = id;
  Object.assign(element.style, { position: 'fixed', top: '0px', ...style });
  vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({
    left: rect.left,
    right: rect.right,
    width: rect.right - rect.left,
    top: 0,
    bottom: 40,
    height: 40,
    x: rect.left,
    y: 0,
    toJSON: () => ({}),
  });
  document.body.append(element);
  return element;
};

const style = () => document.getElementById('logseq-copilot-sidebar-dock');
const marked = () =>
  [...document.querySelectorAll(`[${DOCK_ATTRIBUTE}]`)].map((element) => element.id);

describe('sidebar dock', () => {
  beforeEach(() => {
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(WINDOW);
    vi.spyOn(document.documentElement, 'clientWidth', 'get').mockReturnValue(WINDOW);
    document.head.innerHTML = '<title>Page</title>';
    document.body.innerHTML = '<main><p>Words</p></main>';
  });

  afterEach(() => {
    removeSidebarDock();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('pushes the page by the width of the sidebar', () => {
    applySidebarDock();

    expect(isSidebarDocked()).toBe(true);
    expect(style()?.textContent).toBe(
      `html{margin-right:${SIDEBAR_WIDTH}px!important;position:relative!important}`,
    );
  });

  it('keeps a root the page positions itself as it is', () => {
    document.documentElement.style.position = 'absolute';

    applySidebarDock();

    expect(style()?.textContent).toBe(`html{margin-right:${SIDEBAR_WIDTH}px!important}`);
    removeSidebarDock();
    document.documentElement.removeAttribute('style');
  });

  it('moves fixed elements that reach under the sidebar, and only those', () => {
    fixed('header', { left: 0, right: WINDOW }, { left: '0px', right: '0px' });
    fixed('chat', { left: WINDOW - 80, right: WINDOW - 20 }, { right: '20px' });
    fixed('nav', { left: 0, right: 200 }, { left: '0px' });
    fixed('banner', { left: 100, right: WINDOW - 20 }, { left: '100px', right: '20px' });
    fixed('dialog', { left: 300, right: 1100 });
    fixed('scaled', { left: 1300, right: 1380 }, { right: '20px', transform: 'scale(2)' });
    fixed('hidden', { left: 0, right: WINDOW }, { display: 'none' });
    fixed('drawer', { left: WINDOW, right: WINDOW + 300 });
    const flow = fixed('flow', { left: 0, right: WINDOW });
    flow.style.position = 'static';

    applySidebarDock();

    expect(marked()).toEqual(['header', 'chat', 'banner']);
    const rules = style()!.textContent!;
    // The header ends at the sidebar, from where it starts.
    expect(rules).toContain(
      `[${DOCK_ATTRIBUTE}="0"]{left:0px!important;right:${SIDEBAR_WIDTH}px!important;width:auto!important;max-width:none!important}`,
    );
    // The chat button keeps its gap, left of the sidebar.
    expect(rules).toContain(
      `[${DOCK_ATTRIBUTE}="1"]{left:auto!important;right:${SIDEBAR_WIDTH + 20}px!important}`,
    );
    // At the right but too wide to move: it ends at the sidebar.
    expect(rules).toContain(
      `[${DOCK_ATTRIBUTE}="2"]{left:100px!important;right:${SIDEBAR_WIDTH + 20}px!important;width:auto!important;max-width:none!important}`,
    );
  });

  it('can be applied again and removed again', () => {
    fixed('header', { left: 0, right: WINDOW });
    applySidebarDock();
    const first = document.documentElement.outerHTML;

    applySidebarDock();

    expect(document.documentElement.outerHTML).toBe(first);
    expect(document.querySelectorAll('#logseq-copilot-sidebar-dock')).toHaveLength(1);

    removeSidebarDock();
    removeSidebarDock();
    expect(isSidebarDocked()).toBe(false);
  });

  it('gives the page back as it was', () => {
    fixed('header', { left: 0, right: WINDOW }, { left: '0px', right: '0px' });
    fixed('chat', { left: WINDOW - 80, right: WINDOW - 20 }, { right: '20px' });
    const before = document.documentElement.outerHTML;

    applySidebarDock();
    expect(document.documentElement.outerHTML).not.toBe(before);
    removeSidebarDock();

    expect(document.documentElement.outerHTML).toBe(before);
    expect(style()).toBeNull();
    expect(marked()).toEqual([]);
  });

  it('leaves a page it has not docked alone', () => {
    fixed('header', { left: 0, right: WINDOW });
    const before = document.documentElement.outerHTML;
    const observer = new MutationObserver(() => {});
    observer.observe(document, { subtree: true, childList: true, attributes: true });

    removeSidebarDock();

    expect(observer.takeRecords()).toEqual([]);
    expect(document.documentElement.outerHTML).toBe(before);
    observer.disconnect();
  });

  it('covers the page instead on a window too narrow for both', () => {
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(900);
    vi.spyOn(document.documentElement, 'clientWidth', 'get').mockReturnValue(900);
    fixed('header', { left: 0, right: 900 });

    applySidebarDock();

    // No stylesheet at all, as when it is not pinned.
    expect(style()).toBeNull();
    expect(marked()).toEqual([]);
    expect(isSidebarDocked()).toBe(true);
  });

  it('follows the window when it is resized', () => {
    vi.useFakeTimers();
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(900);
    applySidebarDock();
    expect(style()).toBeNull();

    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(WINDOW);
    window.dispatchEvent(new Event('resize'));
    vi.advanceTimersByTime(1000);

    expect(style()?.textContent).toContain('html{margin-right');
  });

  it('finds fixed elements the page adds later', async () => {
    vi.useFakeTimers();
    applySidebarDock();

    fixed('chat', { left: WINDOW - 80, right: WINDOW - 20 }, { right: '20px' });
    await vi.advanceTimersByTimeAsync(1000);

    expect(marked()).toEqual(['chat']);
  });

  it('does not measure again the elements it has moved when the page changes', async () => {
    vi.useFakeTimers();
    const header = fixed('header', { left: 0, right: WINDOW }, { left: '0px', right: '0px' });
    applySidebarDock();
    const measured = vi.mocked(header.getBoundingClientRect).mock.calls.length;

    fixed('chat', { left: WINDOW - 80, right: WINDOW - 20 }, { right: '20px' });
    await vi.advanceTimersByTimeAsync(1000);

    expect(marked()).toEqual(['header', 'chat']);
    expect(header.getAttribute(DOCK_ATTRIBUTE)).toBe('0');
    expect(header.getBoundingClientRect).toHaveBeenCalledTimes(measured);
  });

  it('lets go of an element that stops being fixed', async () => {
    vi.useFakeTimers();
    const header = fixed('header', { left: 0, right: WINDOW });
    applySidebarDock();

    header.style.position = 'static';
    await vi.advanceTimersByTimeAsync(1000);

    expect(marked()).toEqual([]);
    expect(style()?.textContent).not.toContain(DOCK_ATTRIBUTE);
  });

  it('stops following the page once removed', async () => {
    vi.useFakeTimers();
    applySidebarDock();
    removeSidebarDock();

    fixed('chat', { left: WINDOW - 80, right: WINDOW - 20 }, { right: '20px' });
    window.dispatchEvent(new Event('resize'));
    await vi.advanceTimersByTimeAsync(1000);

    expect(marked()).toEqual([]);
    expect(style()).toBeNull();
  });
});
