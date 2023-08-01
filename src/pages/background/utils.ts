import { format } from 'date-fns';
import Browser from 'webextension-polyfill';

export const removeUrlHash = (url: string) => {
  const hashIndex = url.indexOf('#');
  return hashIndex > 0 ? url.substring(0, hashIndex) : url;
};

export const logseqTimeFormat = (date: Date): str => {
  return format(date, 'HH:mm');
}

export const setExtensionBadge = async (text: string, tabId: number) => {
  const action =
    Browser.runtime.getManifest().manifest_version === 2
      ? Browser.browserAction
      : Browser.action;
  await action.setBadgeText({
    text: text,
    tabId: tabId,
  });
  await action.setBadgeBackgroundColor({ color: '#4caf50', tabId });
  await action.setBadgeTextColor({ color: '#ffffff', tabId });
};

const mappingVersionToNumbers = (version: string): Array<number> => {
  return version.split('.').slice(0, 3).map((x) => {
    return parseInt(x.split('0')[0]);
  })
}

export const versionCompare = (versionA: string, versionB: string) => {
  const [majorA, minorA, patchA] = mappingVersionToNumbers(versionA)
  const [majorB, minorB, patchB] = mappingVersionToNumbers(versionB)
  if (majorA < majorB) return -1
  if (majorA > majorB) return 1
  if (minorA < minorB) return -1
  if (minorA > minorB) return 1
  if (patchA < patchB) return -1
  if (patchA > patchB) return 1
  return 0
};
