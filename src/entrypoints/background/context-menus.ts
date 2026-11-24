import { templates, type TemplateItemV1 } from '@/utils/storage';
import log from '@/utils/logger';
import { initI18n, t, watchUiLanguage } from '@/i18n/core';

export const CLIP_SELECTION_MENU_ID = 'clip-with-selection';
export const CLIP_PAGE_MENU_ID = 'clip-page';
export const CLIP_IMAGE_MENU_ID = 'clip-image';
// The id predates the sidebar showing more than highlights.
export const OPEN_SIDEBAR_MENU_ID = 'open-highlights-sidebar';

type MenuProperties = Browser.contextMenus.CreateProperties;

// Titles are keys, translated when the menus are built.
const CLIP_MENUS = [
  {
    id: CLIP_SELECTION_MENU_ID,
    title: 'background.contextMenu.clipSelection',
    contexts: ['selection'],
  },
  { id: CLIP_PAGE_MENU_ID, title: 'background.contextMenu.clipPage', contexts: ['page'] },
  { id: CLIP_IMAGE_MENU_ID, title: 'background.contextMenu.clipImage', contexts: ['image'] },
] as const;

/**
 * The context menu items, in order. With one template, the two clip items as
 * they always were. With more, each is a parent with one child per template
 * (`<parent id>:<template id>`).
 */
export const buildClipMenus = (
  templateList: TemplateItemV1[],
): MenuProperties[] => {
  const menus: MenuProperties[] = [];
  for (const { id, title, contexts } of CLIP_MENUS) {
    menus.push({ id, title: t(title), visible: true, contexts: [...contexts] });
    if (templateList.length < 2) continue;
    for (const template of templateList) {
      menus.push({
        id: `${id}:${template.id}`,
        parentId: id,
        title: template.name || t('background.contextMenu.untitledTemplate'),
        visible: true,
        contexts: [...contexts],
      });
    }
  }
  menus.push({
    id: OPEN_SIDEBAR_MENU_ID,
    title: t('background.contextMenu.openSidebar'),
    visible: true,
    contexts: ['page', 'selection'],
  });
  return menus;
};

/**
 * What a clicked menu item asks for. A child item names its template, a bare
 * parent item (the only one with a single template) does not.
 */
export const parseClipMenuId = (
  menuItemId: string | number,
): { command: 'selection' | 'page' | 'image'; templateId?: string } | undefined => {
  const id = String(menuItemId);
  for (const [command, prefix] of [
    ['selection', CLIP_SELECTION_MENU_ID],
    ['page', CLIP_PAGE_MENU_ID],
    ['image', CLIP_IMAGE_MENU_ID],
  ] as const) {
    if (id === prefix) return { command };
    if (id.startsWith(`${prefix}:`)) {
      return { command, templateId: id.slice(prefix.length + 1) };
    }
  }
  return undefined;
};

let queue: Promise<void> = Promise.resolve();

// Resolves once the browser has created the item, so the next rebuild's
// removeAll cannot run between creates. A failure is reported through
// lastError, which try/catch cannot catch; reading it keeps the browser from
// logging it as unchecked.
const createMenu = (item: MenuProperties) =>
  new Promise<void>((resolve) => {
    browser.contextMenus.create(item, () => {
      const error = browser.runtime.lastError;
      if (error) log.warn('[background] Context menu not created', error);
      resolve();
    });
  });

const rebuild = async () => {
  // The titles are in the stored UI language, read at startup.
  await initI18n();
  const items = buildClipMenus(await templates.getValue());
  await browser.contextMenus.removeAll();
  for (const item of items) await createMenu(item);
};

/**
 * Replace the context menu with one that matches the templates. Rebuilds run
 * one after the other: two at once could both remove, then both create, and
 * fail with a duplicate id. Never rejects.
 */
export const rebuildContextMenus = (): Promise<void> => {
  queue = queue.then(rebuild).catch((error) => {
    log.error('[background] Failed to build the context menus', error);
  });
  return queue;
};

/**
 * Rebuild the context menu in the new language when the UI language changes.
 * Call it synchronously at the start of the service worker.
 */
export const followUiLanguage = (): (() => void) =>
  watchUiLanguage(() => void rebuildContextMenus());
