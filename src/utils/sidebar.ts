import { browser } from 'wxt/browser';
import {
  arcDetectedItem,
  inPageSidebarItem,
  inPageSidebarOpenItem,
} from './storage';

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
 * Whether the sidebar is the one drawn on pages (src/entrypoints/content)
 * instead of the browser's own. Browsers without one always draw it. The
 * others follow the user's choice, and until there is one, Arc: it has the
 * side panel API but never shows the panel.
 */
export function resolveInPageSidebar({
  nativeSidebar,
  setting,
  arcDetected,
}: {
  nativeSidebar: boolean;
  setting: boolean | null;
  arcDetected: boolean;
}): boolean {
  if (!nativeSidebar) return true;
  return setting ?? arcDetected;
}

/** resolveInPageSidebar for this browser and the stored settings. */
export async function usesInPageSidebar(): Promise<boolean> {
  if (!hasNativeSidebar()) return true;
  const [setting, arcDetected] = await Promise.all([
    inPageSidebarItem.getValue(),
    arcDetectedItem.getValue(),
  ]);
  return resolveInPageSidebar({ nativeSidebar: true, setting, arcDetected });
}

type FirefoxSidebarAction = {
  open(): Promise<void>;
  toggle(): Promise<void>;
};

// Firefox only, so not in the typings.
const firefoxSidebarAction = () =>
  (browser as unknown as { sidebarAction: FirefoxSidebarAction })
    .sidebarAction;

/**
 * Open the browser's own sidebar of a window: the side panel in Chrome and
 * Edge, the sidebar in Firefox.
 *
 * Both browsers open it only for a user action, and an await (or a message to
 * another context) before the call loses it. So call this as the first
 * statement of the handler of the click, the menu item or the command. Never
 * from the page: Firefox does not count a click in a content script, relayed
 * to the background, as a user action.
 */
export function openNativeSidebar(windowId: number | undefined): Promise<void> {
  // Firefox has no window argument: it opens the sidebar of the window the
  // user action happened in.
  if (import.meta.env.FIREFOX) return firefoxSidebarAction().open();
  if (windowId === undefined) {
    return Promise.reject(new Error('No window to open the side panel in'));
  }
  return browser.sidePanel.open({ windowId });
}

/**
 * The toolbar button: show or hide the browser's own sidebar. Same rules as
 * openNativeSidebar. Chrome has no call to close the side panel, so there it
 * opens it (the panel has its own close button).
 */
export function toggleNativeSidebar(
  windowId: number | undefined,
): Promise<void> {
  if (import.meta.env.FIREFOX) return firefoxSidebarAction().toggle();
  return openNativeSidebar(windowId);
}

/**
 * Open the sidebar drawn on pages, in every tab. Not tied to a user action:
 * the content scripts follow the stored value.
 */
export function openInPageSidebar(): Promise<void> {
  return inPageSidebarOpenItem.setValue(true);
}

/** Open the sidebar drawn on pages, or close it where it is open. */
export async function toggleInPageSidebar(): Promise<void> {
  const open = await inPageSidebarOpenItem.getValue();
  await inPageSidebarOpenItem.setValue(!open);
}
