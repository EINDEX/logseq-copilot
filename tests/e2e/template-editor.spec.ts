import type { Page } from '@playwright/test';
import { expect, test, type Logseq } from './fixtures';

/**
 * The template editor completes property names, their values and tags from
 * the graph Logseq has open (file and DB), with real key presses: Chromium
 * only, as the other editor specs (options.spec.ts).
 */

const PROPERTY = 'e2e-source';
/** A tag made for the test on a DB graph; the fixture file graph tags a page `reading`. */
const DB_TAG = 'E2E Topic';
// Stored flat: one block. With a property line it is stored as an outline.
const CONTENT = 'Clip [{{title}}]({{url}})';

/** A property (a url on a DB graph) and a tag the editor can offer. */
const seed = async (logseq: Logseq) => {
  if (!logseq.isDB) {
    // A file graph lists the keys and tags its blocks use.
    if ((await logseq.findBlocks('E2E editor seed')).length === 0) {
      await logseq.callApi('logseq.Editor.appendBlockInPage', [
        'Copilot Test Page',
        `E2E editor seed\n${PROPERTY}:: https://example.com/seed`,
      ]);
    }
    return;
  }
  const properties: any[] = (await logseq.callApi('logseq.Editor.getAllProperties')) ?? [];
  const mine = properties.some(
    (p) => p?.title === PROPERTY && String(p?.ident).startsWith(':user.property/'),
  );
  if (!mine) {
    // Logseq answers a text, not JSON: read the property back instead.
    await logseq
      .callApi('logseq.Editor.upsertNodes', [
        [
          {
            operation: 'add',
            entityType: 'property',
            id: 'property',
            data: { title: PROPERTY, 'property-type': 'url' },
          },
        ],
      ])
      .catch(() => undefined);
  }
  if (!(await logseq.callApi('logseq.Editor.getTag', [DB_TAG]))) {
    await logseq.callApi('logseq.Editor.createTag', [DB_TAG]);
  }
};

const openEditor = async (
  ext: { setStorage: (items: Record<string, unknown>) => Promise<void>; openPage: (p: string) => Promise<any> },
) => {
  await ext.setStorage({
    templates: [
      { id: 'props', name: 'Props', content: CONTENT, clipNoteLocation: 'journal', clipNoteCustomPage: '' },
    ],
  });
  const options = await ext.openPage('options.html#/template/props');
  const page: Page = options.page!;
  await expect(page.locator('#template-content .cm-tpl-chip[data-variable="title"]')).toBeVisible();
  return page;
};

const list = (page: Page) => page.locator('.cm-tooltip-autocomplete');
const option = (page: Page, name: string | RegExp) =>
  list(page).getByRole('option', { name });

/**
 * Opens the list again (Ctrl+Space) until it shows `name`: the graph is
 * asked for when the page opens and can answer after the list first opened.
 */
const reopenUntil = async (page: Page, name: string | RegExp) => {
  await expect(async () => {
    if (!(await option(page, name).isVisible())) await page.keyboard.press('Control+Space');
    await expect(option(page, name)).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
};

const stored = async (ext: { getStorage: (key: string) => Promise<any> }) =>
  ((await ext.getStorage('templates')) ?? []).find((t: any) => t.id === 'props')?.content;

test.describe('template editor: properties and tags', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'typed with real key presses, Chromium only');

  test('+ Property, a property name and a value from the graph', async ({ ext, logseq }) => {
    await seed(logseq);
    await ext.connect();
    const page = await openEditor(ext);

    const firstLine = page.locator('#template-content .cm-line').first();
    const add = firstLine.locator('.cm-tpl-add-prop');
    await firstLine.hover();
    await expect(add).toHaveCSS('opacity', '1');
    await add.click();

    await reopenUntil(page, new RegExp(`^${PROPERTY}`));
    const typed = option(page, new RegExp(`^${PROPERTY}`));
    // The type is the detail on a DB graph; a file graph has none.
    if (logseq.isDB) await expect(typed).toContainText('url');
    else await expect(typed.locator('.cm-completionDetail')).toHaveCount(0);

    await page.keyboard.type('e2e-sou');
    await expect(option(page, `New e2e-sou`)).toBeVisible();
    await expect(list(page).getByRole('option').first()).toHaveText(new RegExp(`^${PROPERTY}`));
    // CodeMirror ignores Enter for the first 75 ms of a list.
    await page.waitForTimeout(150);
    await page.keyboard.press('Enter');

    // The values follow: only {{url}} for a url property of a DB graph.
    await expect(option(page, /^\{\{url\}\}/)).toBeVisible();
    await expect(list(page).getByRole('option')).toHaveCount(logseq.isDB ? 1 : 7);
    await page.keyboard.press('Escape');
    await page.keyboard.type('{{ur');
    await expect(option(page, /^url/)).toBeVisible();
    await page.waitForTimeout(150);
    await page.keyboard.press('Enter');

    // One block: stored flat, the property line under the first line.
    await expect.poll(() => stored(ext)).toBe(`${CONTENT}\n${PROPERTY}:: {{url}}`);
    const badge = page.locator('#template-content .cm-tpl-type');
    if (logseq.isDB) await expect(badge).toHaveText('url');
    else await expect(badge).toHaveCount(0);
  });

  test('# lists the tags of the graph and writes #Name or #[[Name]]', async ({ ext, logseq }) => {
    await seed(logseq);
    await ext.connect();
    const page = await openEditor(ext);

    await page.locator('#template-content .cm-line').first().click();
    await page.keyboard.press('End');
    const [typed, tag, written] = logseq.isDB
      ? ['E2E', DB_TAG, `#[[${DB_TAG}]]`]
      : ['rea', 'reading', '#reading'];
    await page.keyboard.type(` #${typed}`);
    await reopenUntil(page, tag);
    await expect(list(page).getByRole('option').first()).toHaveText(tag);
    await expect(list(page).getByRole('option').last()).toHaveText(`New #${typed}`);
    await page.waitForTimeout(150);
    await page.keyboard.press('Enter');

    await expect.poll(() => stored(ext)).toBe(`${CONTENT} ${written}`);
  });

  test('without Logseq the editor takes typed properties and tags', async ({ ext }) => {
    await ext.setStorage({ logseqHostName: 'localhost', logseqPort: 1, logseqAuthToken: 'token' });
    const page = await openEditor(ext);

    await page.locator('#template-content .cm-line').first().click();
    await page.keyboard.press('End');
    await page.keyboard.type(' #Later');
    await page.keyboard.press('Shift+Enter');
    await page.keyboard.type('read-on:: soon');

    await expect.poll(() => stored(ext)).toBe(`${CONTENT} #Later\nread-on:: soon`);
    await expect(page.locator('#template-content .cm-tpl-type')).toHaveCount(0);
  });
});
