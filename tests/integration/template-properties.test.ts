/**
 * Tags and properties written in a clip template's outline, against a real
 * Logseq app, for both graph types. A file graph gets the rendered text as it
 * is; a DB graph gets the template's `key:: value` lines as real properties of
 * the user (by ident) and its inline tags as real tags. Clips go to the
 * fixture page, never to today's journal (see group.test.ts).
 */
import { beforeAll, describe, expect, inject, test } from 'vitest';
import { fakeBrowser } from 'wxt/testing';
import {
  logseqAuthTokenItem,
  logseqHostNameItem,
  logseqPortItem,
  templates,
  type TemplateItemV1,
} from '@/utils/storage';
import { clipToLogseq, type ClipSource } from '@/entrypoints/background/clip';
import { renderClip, type ClipBlock } from '@/utils/clip-template';
import { CLIP_TEMPLATE, TASK_TEMPLATE } from '@/utils/default-templates';

const variant = inject('logseqVariant');
const db = variant === 'db';
const TEST_PAGE = 'Copilot Test Page';
/** Names new to the graph on every run. */
const RUN = Date.now().toString(36);

const call = async (method: string, args: unknown[] = []) => {
  const resp = await fetch(`${inject('logseqApi')}/api`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${inject('logseqToken')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ method, args }),
  });
  const text = await resp.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};

const location = { clipNoteLocation: 'customPage', clipNoteCustomPage: TEST_PAGE };
const template = (id: string, content: string): TemplateItemV1 => ({
  id,
  name: id,
  content,
  ...location,
});

const PROPS = template(
  'props',
  [
    `- [{{title}}]({{url}}) #PropClip${RUN} #[[Prop Read ${RUN}]]`,
    `  src-${RUN}:: {{url}}`,
    `  day-${RUN}:: {{date}}`,
    `  note-${RUN}:: plain words`,
    `  rating-${RUN}:: not a number`,
    '  - Quote #PropQuote' + RUN,
    `    kind-${RUN}:: quote`,
    '    - {{content}}',
  ].join('\n'),
);
const HOSTILE = template(
  'hostile',
  `- {{title}}\n  src-${RUN}:: {{url}}\n  - {{content}}`,
);

const userProperties = async (): Promise<any[]> =>
  ((await call('logseq.Editor.getAllProperties')) as any[]).filter((p) =>
    String(p.title).includes(RUN),
  );

const tree = async (uuid: string) => call('logseq.Editor.getBlock', [uuid, { includeChildren: true }]);

/** The text a block stores, readable on both graph kinds. */
const textOf = (block: any): string => String(block.fullTitle ?? block.content ?? block.title ?? '');

const flatten = (blocks: ClipBlock[]): ClipBlock[] =>
  blocks.flatMap((b) => [b, ...flatten(b.children)]);
const storedFlat = (block: any): any[] => [block, ...(block.children ?? []).flatMap(storedFlat)];

const clip = (templateId: string, extra: Partial<ClipSource> = {}) =>
  clipToLogseq({
    url: `https://example.com/props/${RUN}/${templateId}`,
    title: `Props ${RUN}`,
    data: 'The selected words',
    templateId,
    ...extra,
  });

/** What the template renders today, with the graph's date format. */
const rendered = async (content: string, source: Partial<ClipSource>) => {
  const config = await call('logseq.App.getUserConfigs');
  return renderClip(content, {
    url: source.url,
    title: source.title,
    data: source.data ?? '',
    preferredDateFormat: config.preferredDateFormat,
    time: new Date(),
  });
};

let journalTitle: string;

beforeAll(async () => {
  fakeBrowser.reset();
  const apiUrl = new URL(inject('logseqApi'));
  await logseqHostNameItem.setValue(apiUrl.hostname);
  await logseqPortItem.setValue(Number(apiUrl.port));
  await logseqAuthTokenItem.setValue(inject('logseqToken'));
  await templates.setValue([
    PROPS,
    HOSTILE,
    { ...CLIP_TEMPLATE, ...location },
    { ...TASK_TEMPLATE, ...location },
  ]);
  const config = await call('logseq.App.getUserConfigs');
  const { format } = await import('date-fns');
  const { toDateFnsPattern } = await import('@/utils/logseq-format');
  journalTitle = format(new Date(), toDateFnsPattern(config.preferredDateFormat));
  if (db) {
    // An existing property of the user (url) and one of a type the value does not fit.
    for (const [title, type] of [
      [`src-${RUN}`, 'url'],
      [`rating-${RUN}`, 'number'],
    ]) {
      await call('logseq.Editor.upsertNodes', [
        [{ operation: 'add', entityType: 'property', id: 'p', data: { title, 'property-type': type } }],
      ]);
    }
  }
});

describe('template properties and tags', () => {
  test('file graph: the blocks store exactly the rendered text', async () => {
    if (db) return;
    const source = { url: `https://example.com/props/${RUN}/props`, title: `Props ${RUN}`, data: 'The selected words' };
    const result = await clip('props');
    const stored = storedFlat(await tree(result.rootUuid));
    const expected = flatten(await rendered(PROPS.content, source));
    expect(stored.map((b) => b.content)).toEqual(expected.map((b) => b.content));
    // Logseq reads the property lines itself (the API camel-cases the keys).
    expect(Object.values(stored[0].properties ?? {})).toContain(source.url);
    expect(Object.values(stored[1].properties ?? {})).toContain('quote');
  });

  test('DB graph: property lines become properties of the user, tags real tags', async () => {
    if (!db) return;
    const before = await userProperties();
    const result = await clip('props');
    const root = await tree(result.rootUuid);
    const [quote] = root.children;
    const [content] = quote.children;
    const after = await userProperties();
    const identOf = (title: string) => after.find((p) => p.title === title)?.ident;

    // The existing url property is used by its ident: no second one, no plugin one.
    expect(after.filter((p) => p.title === `src-${RUN}`)).toHaveLength(1);
    expect(identOf(`src-${RUN}`)).toBe(before.find((p) => p.title === `src-${RUN}`)?.ident);
    // (The fixture seed sets a few by bare name: only this run's names count.)
    expect(after.filter((p) => String(p.ident).startsWith(':plugin.'))).toEqual([]);

    // Missing properties are made as properties of the user with the inferred type.
    const typeOf = (title: string) => after.find((p) => p.title === title)?.[':logseq.property/type'];
    expect(typeOf(`day-${RUN}`)).toBe('date');
    expect(typeOf(`note-${RUN}`)).toBe('default');
    expect(typeOf(`kind-${RUN}`)).toBe('default');
    expect(identOf(`day-${RUN}`)).toMatch(/^:user\.property\//);

    // Values on the root and the child.
    const url = `https://example.com/props/${RUN}/props`;
    expect(root[identOf(`src-${RUN}`)!]?.title ?? root[identOf(`src-${RUN}`)!]).toBe(url);
    const day = root[identOf(`day-${RUN}`)!];
    expect(day?.title).toBe(journalTitle);
    expect(day?.['journalDay'] ?? day?.journalDay).toBeTruthy();
    expect(root[identOf(`note-${RUN}`)!]?.title).toBe('plain words');
    expect(quote[identOf(`kind-${RUN}`)!]?.title).toBe('quote');

    // The text without the lines that became properties; the type mismatch stays text.
    expect(textOf(root)).toBe(
      `[Props ${RUN}](${url}) #PropClip${RUN} #[[Prop Read ${RUN}]]\nrating-${RUN}:: not a number`,
    );
    expect(root[identOf(`rating-${RUN}`)!]).toBeUndefined();
    expect(textOf(quote)).toBe(`Quote #PropQuote${RUN}`);
    expect(textOf(content)).toBe('The selected words');

    // Inline tags are real tags of their block.
    const tags = (block: any) => (block.tags ?? []).map((t: any) => t.title).sort();
    expect(tags(root)).toEqual([`Prop Read ${RUN}`, `PropClip${RUN}`].sort());
    expect(tags(quote)).toEqual([`PropQuote${RUN}`]);
  });

  test('hostile page text makes no tag, property or page', async () => {
    const hostile = `x #evil${RUN} a${RUN}:: b [[page${RUN}]]`;
    const result = await clip('hostile', {
      title: hostile,
      data: `${hostile}\nkey${RUN}:: value\n#[[tag${RUN}]]\n- c${RUN}:: d`,
    });
    const stored = storedFlat(await tree(result.rootUuid));
    expect(stored.length).toBeGreaterThan(1);
    for (const name of [`evil${RUN}`, `page${RUN}`, `tag${RUN}`]) {
      expect(await call('logseq.Editor.getPage', [name])).toBeNull();
    }
    if (db) {
      const titles = (await userProperties()).map((p) => p.title);
      for (const key of [`a${RUN}`, `key${RUN}`, `c${RUN}`]) expect(titles).not.toContain(key);
      for (const block of stored) {
        expect((block.tags ?? []).map((t: any) => t.title)).toEqual([]);
      }
    } else {
      for (const block of stored) {
        for (const key of [`a${RUN}`, `key${RUN}`, `c${RUN}`]) {
          expect(block.properties?.[key]).toBeUndefined();
        }
      }
    }
  });

  test.each([
    ['Clip', CLIP_TEMPLATE],
    ['Task', TASK_TEMPLATE],
  ])('built-in %s: the blocks store what they stored before', async (_name, builtIn) => {
    const source = {
      url: `https://example.com/builtin/${RUN}/${builtIn.id}`,
      title: `Built-in ${RUN}`,
      data: 'Built-in words',
    };
    const result = await clipToLogseq({ ...source, templateId: builtIn.id });
    const stored = storedFlat(await tree(result.rootUuid));
    const expected = flatten(await rendered(builtIn.content, source)).map((b) =>
      // A DB graph keeps a task marker as the status.
      db ? b.content.replace(/^TODO /, '') : b.content,
    );
    expect(stored.map(textOf)).toEqual(expected);
    if (db) {
      const own = (block: any) => Object.keys(block).filter((k) => k.startsWith(':user.property/'));
      for (const block of stored) expect(own(block)).toEqual([]);
    }
  });

  test('a repeat clip of the same page joins the first one, with its properties', async () => {
    const url = `https://example.com/props/${RUN}/group`;
    const first = await clip('props', { url, data: 'First words' });
    const second = await clip('props', { url, data: 'Second words' });
    expect(second.added).toBe(true);
    const root = await tree(first.rootUuid);
    expect(root.children.map(textOf)).toEqual(
      db
        ? [`Quote #PropQuote${RUN}`, `Quote #PropQuote${RUN}`]
        : [`Quote #PropQuote${RUN}\nkind-${RUN}:: quote`, `Quote #PropQuote${RUN}\nkind-${RUN}:: quote`],
    );
    if (db) {
      const ident = (await userProperties()).find((p) => p.title === `kind-${RUN}`)?.ident;
      expect(root.children[1][ident]?.title).toBe('quote');
    }
  });
});
