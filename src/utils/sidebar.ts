import { browser } from 'wxt/browser';
import { inPageSidebarOpenItem } from './storage';

/**
 * Whether the browser has a sidebar of its own for the extension: the side
 * panel in Chrome and Edge, the sidebar in Firefox. Checked on the API, not
 * the build: Safari runs the Chrome build without `sidePanel`, Firefox for
 * Android the Firefox build without `sidebarAction`.
 */
export function hasNativeSidebar(): boolean {
  if (import.meta.env.FIREFOX) {
    const { sidebarAction } = browser as unknown as {
      sidebarAction?: { open?: unknown };
    };
    return typeof sidebarAction?.open === 'function';
  }
  return typeof browser.sidePanel?.open === 'function';
}

/**
 * Open the highlights sidebar of a window: the side panel in Chrome and Edge,
 * the sidebar in Firefox. Browsers without either get the sidebar drawn on
 * every page (src/entrypoints/content), which needs no window.
 *
 * Both browsers open their own only for a user action, and an await (or a
 * message to another context) before the call loses it. So call this as the
 * first statement of the handler of the click, the menu item or the command.
 * Never from the page: Firefox does not count a click in a content script,
 * relayed to the background, as a user action.
 */
export async function openSidebar(windowId: number | undefined): Promise<void> {
  if (!hasNativeSidebar()) {
    // Not tied to a user action: the content scripts follow this value.
    return inPageSidebarOpenItem.setValue(true);
  }
  if (import.meta.env.FIREFOX) {
    // Firefox only (so not in the typings), and it has no window argument: it
    // opens the sidebar of the window the user action happened in.
    const { sidebarAction } = browser as unknown as {
      sidebarAction: { open(): Promise<void> };
    };
    return sidebarAction.open();
  }
  if (windowId === undefined) {
    throw new Error('No window to open the side panel in');
  }
  return browser.sidePanel.open({ windowId });
}
