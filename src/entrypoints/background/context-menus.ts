import { templates, type TemplateItemV1 } from '@/utils/storage';
import log from '@/utils/logger';

export const CLIP_SELECTION_MENU_ID = 'clip-with-selection';
export const CLIP_PAGE_MENU_ID = 'clip-page';
export const CLIP_IMAGE_MENU_ID = 'clip-image';
// The id predates the sidebar showing more than highlights.
export const OPEN_SIDEBAR_MENU_ID = 'open-highlights-sidebar';

type MenuProperties = Browser.contextMenus.CreateProperties;

const CLIP_MENUS = [
  {
    id: CLIP_SELECTION_MENU_ID,
    title: 'Clip "%s"',
    contexts: ['selection'],
  },
  { id: CLIP_PAGE_MENU_ID, title: 'Clip page link', contexts: ['page'] },
  { id: CLIP_IMAGE_MENU_ID, title: 'Clip image', contexts: ['image'] },
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
    menus.push({ id, title, visible: true, contexts: [...contexts] });
    if (templateList.length < 2) continue;
    for (const template of templateList) {
      menus.push({
        id: `${id}:${template.id}`,
        parentId: id,
        title: template.name || 'Untitled',
        visible: true,
        contexts: [...contexts],
      });
    }
  }
  menus.push({
    id: OPEN_SIDEBAR_MENU_ID,
    title: 'Open sidebar',
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
