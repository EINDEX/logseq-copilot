import { browser } from 'wxt/browser';
import log from '@/utils/logger';

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

export const showClipErrorBadge = async (tabId: number | undefined, message: string) => {
  log.error('[clip] Failed:', message);
  if (tabId === undefined) return;
  tabsWithError.add(tabId);
  await Promise.all([
    browser.action.setBadgeText({ text: '!', tabId }),
    browser.action.setBadgeBackgroundColor({ color: ERROR_BADGE_COLOR, tabId }),
    browser.action.setBadgeTextColor({ color: '#ffffff', tabId }),
    browser.action.setTitle({ title: message, tabId }),
  ]).catch((err) => log.error('[clip] Failed to show the error badge:', err));
};

/**
 * After a successful clip. The badge text is emptied; the result count comes
 * back with the next badge search of the tab (right after the clip for the
 * clipped tab, on activation for the others).
 */
export const clearClipErrorBadges = async () => {
  if (tabsWithError.size === 0) return;
  const tabIds = [...tabsWithError];
  tabsWithError.clear();
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
