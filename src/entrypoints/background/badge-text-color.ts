import { browser } from 'wxt/browser';

/**
 * Safari has no `action.setBadgeTextColor`; calling it throws a TypeError.
 * Where the API is missing the badge keeps the browser's default text color.
 */
export const setBadgeTextColorIfSupported = async (color: string, tabId: number) => {
  if (typeof browser.action.setBadgeTextColor !== 'function') return;
  await browser.action.setBadgeTextColor({ color, tabId });
};
