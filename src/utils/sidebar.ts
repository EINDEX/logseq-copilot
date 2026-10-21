import { browser } from 'wxt/browser';

/**
 * Open the highlights sidebar of a window: the side panel in Chrome and Edge,
 * the sidebar in Firefox.
 *
 * Both browsers open it only for a user action, and an await (or a message to
 * another context) before the call loses it. So call this as the first
 * statement of the handler of the click, the menu item or the command. Never
 * from the page: Firefox does not count a click in a content script, relayed
 * to the background, as a user action.
 */
export async function openSidebar(windowId: number): Promise<void> {
  if (import.meta.env.FIREFOX) {
    // Firefox only (so not in the typings), and it has no window argument: it
    // opens the sidebar of the window the user action happened in.
    const { sidebarAction } = browser as unknown as {
      sidebarAction: { open(): Promise<void> };
    };
    return sidebarAction.open();
  }
  return browser.sidePanel.open({ windowId });
}
