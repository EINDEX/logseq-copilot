import { browser } from 'wxt/browser';
import log from '@/utils/logger';
import { setBadgeTextColorIfSupported } from './badge-text-color';

/**
 * A failed clip that no page can show (its content script cannot be reached,
 * as in the browser's PDF viewer): "!" on the toolbar button of the tab, the
 * error as its title. It stays until the next successful clip; the result
 * count badge leaves these tabs alone meanwhile.
 *
 * No `notifications` permission: adding one disables the extension on update
 * until the user accepts it.
 */
const ERROR_BADGE_COLOR = '#d32f2f';

const tabsWithError = new Set<number>();

export const hasClipErrorBadge = (tabId: number) => tabsWithError.has(tabId);

/**
 * The tabs whose badge is the hint "the sidebar cannot open here"
 * (sidebar-action.ts), not a clip error. Also in tabsWithError, so the result
 * count leaves them alone. Unlike a clip error, the hint goes when the tab
 * navigates or the sidebar opens on it.
 */
const tabsWithSidebarHint = new Set<number>();

export const showClipErrorBadge = async (tabId: number | undefined, message: string) => {
  log.error('[clip] Failed:', message);
  if (tabId === undefined) return;
  tabsWithSidebarHint.delete(tabId);
  await showBadge(tabId, message);
};

export const showSidebarHint = async (tabId: number | undefined, message: string) => {
  log.debug('[sidebar] Cannot open:', message);
  if (tabId === undefined) return;
  tabsWithSidebarHint.add(tabId);
  await showBadge(tabId, message);
};

/** Only the sidebar hint of the tab; a clip error stays. */
export const clearSidebarHint = (tabId: number) =>
  tabsWithSidebarHint.has(tabId) ? clearErrorBadgesOf([tabId]) : Promise.resolve();

const showBadge = async (tabId: number, message: string) => {
  tabsWithError.add(tabId);
  await Promise.all([
    browser.action.setBadgeText({ text: '!', tabId }),
    browser.action.setBadgeBackgroundColor({ color: ERROR_BADGE_COLOR, tabId }),
    setBadgeTextColorIfSupported('#ffffff', tabId),
    browser.action.setTitle({ title: message, tabId }),
  ]).catch((err) => log.error('[clip] Failed to show the error badge:', err));
};

/**
 * After a successful clip. The badge text is emptied; the result count comes
 * back with the next badge search of the tab (right after the clip for the
 * clipped tab, on activation for the others).
 */
export const clearClipErrorBadges = () => clearErrorBadgesOf([...tabsWithError]);

const clearErrorBadgesOf = async (tabIds: number[]) => {
  if (tabIds.length === 0) return;
  for (const tabId of tabIds) {
    tabsWithError.delete(tabId);
    tabsWithSidebarHint.delete(tabId);
  }
  const manifest = browser.runtime.getManifest();
  const title = manifest.action?.default_title ?? manifest.name;
  await Promise.all(
    tabIds.map((tabId) =>
      Promise.all([
        browser.action.setBadgeText({ text: '', tabId }),
        browser.action.setTitle({ title, tabId }),
      ]).catch(() => {
        // The tab is gone, and its badge with it.
      }),
    ),
  );
};
