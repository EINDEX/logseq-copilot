import { format } from 'date-fns';
import { Liquid } from 'liquidjs';

const engine = new Liquid();

export const removeUrlHash = (url: string) => {
  const hashIndex = url.indexOf('#');
  return hashIndex > 0 ? url.substring(0, hashIndex) : url;
};

export const logseqTimeFormat = (date: Date): string => {
  return format(date, 'HH:mm');
};

export const setExtensionBadge = async (text: string, tabId: number) => {
  const action =
    browser.runtime.getManifest().manifest_version === 2
      ? browser.browserAction
      : browser.action;
  await action.setBadgeText({
    text: text,
    tabId: tabId,
  });
  await action.setBadgeBackgroundColor({ color: '#4caf50', tabId });
  await action.setBadgeTextColor({ color: '#ffffff', tabId });
};

const mappingVersionToNumbers = (version: string): Array<number> => {
  return version
    .split('.')
    .slice(0, 3)
    .map((x) => {
      return parseInt(x.split('0')[0]);
    });
};

export const versionCompare = (versionA: string, versionB: string) => {
  const [majorA, minorA, patchA] = mappingVersionToNumbers(versionA);
  const [majorB, minorB, patchB] = mappingVersionToNumbers(versionB);
  if (majorA < majorB) return -1;
  if (majorA > majorB) return 1;
  if (minorA < minorB) return -1;
  if (minorA > minorB) return 1;
  if (patchA < patchB) return -1;
  if (patchA > patchB) return 1;
  return 0;
};

export function logseqEscape(str: string): string {
  return str.replaceAll(/([\[\{\(])/g, '\\$1');
}

export function blockRending({
  url,
  title,
  data,
  clipNoteTemplate,
  preferredDateFormat,
  time,
}: {
  url?: string;
  title?: string;
  data: string;
  clipNoteTemplate: string;
  preferredDateFormat: string;
  time: Date;
}): string {
  const render = engine
    .parseAndRenderSync(clipNoteTemplate, {
      date: format(time, preferredDateFormat),
      content: logseqEscape(data),
      url: url,
      time: logseqTimeFormat(time),
      dt: time,
      title: title,
    })
    .trim();

  return render;
}
