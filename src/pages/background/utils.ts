import Browser from 'webextension-polyfill';

export const removeUrlHash = (url: string) => {
  const hashIndex = url.indexOf('#');
  return hashIndex > 0 ? url.substring(0, hashIndex) : url;
};

export const setExtensionBadge = async (text: string, tabId: number) => {

  const action = Browser.runtime.getManifest().manifest_version === 2? Browser.browserAction : Browser.action; 
  await action.setBadgeText({
    text: text,
    tabId: tabId,
  });
  await action.setBadgeBackgroundColor({ color: '#4caf50', tabId });
  await action.setBadgeTextColor({ color: '#ffffff', tabId });
};
