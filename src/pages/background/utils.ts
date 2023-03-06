import Browser from 'webextension-polyfill';

export const removeUrlHash = (url: string) => {
  const hashIndex = url.indexOf('#');
  return hashIndex > 0 ? url.substring(0, hashIndex) : url;
};

export const setExtensionBadge = async (text: string, tabId: number) => {
  await Browser.action.setBadgeText({
    text: text,
    tabId: tabId,
  });
  await Browser.action.setBadgeBackgroundColor({ color: '#4caf50', tabId });
  await Browser.action.setBadgeTextColor({ color: '#ffffff', tabId });
};
