/**
 * `logseq:recall` data layer against a real Logseq, plus the API facts it
 * relies on. Recall data: the "Recall Notes" / "Recall Target" / "Templates"
 * / "Limit Probe" pages and the 2024-11-05 journal, from
 * fixtures/file-graph (file) or seedDbRecallData in tests/support/logseq-app.ts
 * (DB).
 */
import { beforeAll, describe, expect, inject, test, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing';
import {
  logseqAuthTokenItem,
  logseqHostNameItem,
  logseqPortItem,
} from '@/utils/storage';
import { getLogseqService } from '@/entrypoints/background/logseq/tool';
import { LogseqServiceInterface } from '@/entrypoints/background/logseq/interfaces';
import { MAX_HITS_PER_PAGE } from '@/entrypoints/background/logseq/recall/recall';
import type { RecallHit, RecallPage } from '@/types/recall';

const variant = inject('logseqVariant');
const isDB = variant === 'db';
const LIMIT_PROBE_BLOCKS = 15;

const api = async (method: string, args: unknown[] = []) => {
  const resp = await fetch(`${inject('logseqApi')}/api`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${inject('logseqToken')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ method, args }),
  });
  return resp.json();
};

const search = async (query: string, opts?: object) =>
  (await api('logseq.App.search', opts ? [query, opts] : [query])).blocks as any[];

const plain = (text: string) => text.replace(/\$pfts_2lqh>\$|\$<pfts_2lqh\$/g, '');
const findHit = (pages: RecallPage[], start: string): RecallHit | undefined =>
  pages.flatMap((p) => p.hits).find((h) => h.text.startsWith(start));
const allHits = (pages: RecallPage[]) => pages.flatMap((p) => p.hits);

beforeAll(async () => {
  fakeBrowser.reset();
  const apiUrl = new URL(inject('logseqApi'));
  await logseqHostNameItem.setValue(apiUrl.hostname);
  await logseqPortItem.setValue(Number(apiUrl.port));
  await logseqAuthTokenItem.setValue(inject('logseqToken'));
});

describe(`Logseq API facts recall relies on (${variant})`, () => {
  test('App.search limit option', async () => {
    const limited = await search('limitprobe', { limit: 30 });
    if (isDB) {
      // 2.x honours `limit`.
      expect(limited.length).toBeGreaterThanOrEqual(LIMIT_PROBE_BLOCKS);
      expect(await search('limitprobe', { limit: 5 })).toHaveLength(5);
    } else {
      // 0.10.x ignores the options argument: always 10 blocks.
      expect(limited).toHaveLength(10);
      expect(await search('limitprobe')).toHaveLength(10);
    }
  });

  test.skipIf(!isDB)('getBlock fullTitle has readable references, content has uuids', async () => {
    const hit = (await search('Recallprobe outline')).find((b) =>
      plain(b.fullTitle).startsWith('Recallprobe outline'),
    );
    const block = await api('logseq.Editor.getBlock', [hit.uuid]);
    expect(block.fullTitle).toMatch(
      /^Recallprobe outline about \[\[Another Page\]\] with #research and \(\([0-9a-f-]{36}\)\)$/,
    );
    expect(block.content).toMatch(/\[\[[0-9a-f-]{36}\]\] with #\[\[[0-9a-f-]{36}\]\]/);
  });

  test.skipIf(!isDB)('tag and property page hits are told apart by their tags', async () => {
    const tagHit = (await search('research')).find((b) => b['page?'] === true);
    expect(tagHit.tags.map((t: any) => t.ident)).toContain(':logseq.class/Tag');
    const propertyHit = (await search('recallnote')).find((b) => b['page?'] === true);
    expect(propertyHit.tags.map((t: any) => t.ident)).toContain(':logseq.class/Property');
    // Pages read through getPage: tag/property pages have an ident, notes do not.
    expect((await api('logseq.Editor.getPage', [tagHit.uuid])).ident).toBeTruthy();
    expect((await api('logseq.Editor.getPage', ['Recall Notes'])).ident).toBeUndefined();
  });

  test.skipIf(!isDB)('property values are searchable blocks marked created-from-property', async () => {
    const hit = (await search('Recallprobe property value')).find(
      (b) => plain(b.fullTitle) === 'Recallprobe property value text',
    );
    expect(hit).toBeDefined();
    const block = await api('logseq.Editor.getBlock', [hit.uuid]);
    expect(block[':logseq.property/created-from-property']).toBeTruthy();
  });

  test.skipIf(!isDB)('template blocks are tagged #Template, children see it on parent', async () => {
    const hits = await search('Recallprobe template');
    const parent = hits.find((b) => plain(b.fullTitle).startsWith('Recallprobe meeting'));
    const child = hits.find((b) => plain(b.fullTitle).startsWith('Recallprobe template child'));
    const parentBlock = await api('logseq.Editor.getBlock', [parent.uuid]);
    expect(parentBlock.tags.map((t: any) => t.ident)).toContain(':logseq.class/Template');
    const childBlock = await api('logseq.Editor.getBlock', [child.uuid]);
    expect(childBlock.parent.tags).toContain(':logseq.class/Template');
  });
});

describe(`service.recall (${variant})`, () => {
  let service: LogseqServiceInterface;

  beforeAll(async () => {
    service = await getLogseqService();
  });

  test('groups hits by page and resolves references and tags', async () => {
    const { graph, pages } = await service.recall('Recallprobe outline');
    expect(graph).toBe(isDB ? 'Demo' : 'copilot-file-graph');
    const notes = pages.find((p) => p.title === 'Recall Notes')!;
    expect(notes.name).toBe('recall notes');
    expect(notes.kind).toBe('page');
    expect(notes.matchedTerms).toEqual(['recallprobe', 'outline']);
    expect(notes.hits.length).toBeLessThanOrEqual(MAX_HITS_PER_PAGE);

    const outline = findHit(pages, 'Recallprobe outline')!;
    expect(outline.text).toMatch(/^Recallprobe outline about Another Page with #research/);
    expect(outline.segments).toContainEqual({ kind: 'ref', value: 'Another Page' });
    expect(outline.segments).toContainEqual({ kind: 'tag', value: '#research' });
    expect(outline.segments.map((s) => s.value).join('')).toBe(outline.text);
    if (isDB) {
      // ((block uuid)) is resolved to the block text.
      expect(outline.text).toContain('Referenced target sentence for recall');
    }
  });

  test('file graph page tags come from the tags:: property', async () => {
    const { pages } = await service.recall('Recallprobe outline');
    const notes = pages.find((p) => p.title === 'Recall Notes')!;
    if (!isDB) expect(notes.tags).toEqual(['reading']);
  });

  test('context of a nested page hit: its direct parent only', async () => {
    const { pages } = await service.recall('Recallprobe grandchild');
    const hit = findHit(pages, 'Recallprobe grandchild')!;
    expect(hit.context.map((c) => c.text)).toEqual([
      'Recallprobe child block under the outline',
    ]);
    const [parent] = hit.context;
    expect(parent.uuid).toMatch(/^[0-9a-f-]{36}$/);
    expect(parent.segments.map((s) => s.value).join('')).toBe(parent.text);
    if (!isDB) {
      expect(hit.text).toBe(
        'Recallprobe grandchild detail quoting Referenced target sentence for recall',
      );
    }
    const top = findHit(pages, 'Recallprobe outline');
    if (top) expect(top.context).toEqual([]);
  });

  test('a property-only parent falls back to the nearest ancestor with text, each block read once', async () => {
    const getBlock = vi.spyOn(service.client, 'getBlockViaUuid');
    try {
      const { pages } = await service.recall('deepnest');
      const notes = pages.find((p) => p.title === 'Recall Notes')!;
      expect(notes.hits.map((h) => h.text).sort()).toEqual([
        'Deepnest leaf alpha',
        'Deepnest leaf beta',
      ]);
      const [alpha, beta] = notes.hits;
      // The direct parent holds only `recallkind:: container`.
      expect(alpha.context.map((c) => c.text)).toEqual([
        expect.stringMatching(/^Recallprobe grandchild detail/),
      ]);
      expect(beta.context).toEqual(alpha.context);
      expect(alpha.context[0].text.length).toBeLessThanOrEqual(80);

      // The whole chain up to the page is walked (template check), every
      // block once even though the two hits share it.
      const read = (await Promise.all(getBlock.mock.results.map((r) => r.value)))
        .map((block: any) => block?.uuid)
        .filter(Boolean);
      expect(read).toEqual([...new Set(read)]);
      expect(read).toContain(alpha.context[0].uuid);
    } finally {
      getBlock.mockRestore();
    }
  });

  test('deep journal hits: the top-level block, then the parent', async () => {
    const { pages } = await service.recall('journaldeep');
    const journal = pages.find((p) => p.kind === 'journal')!;
    expect(journal.journalDay).toBe(20241105);
    const contextOf = (text: string) =>
      journal.hits.find((h) => h.text === text)?.context.map((c) => c.text);
    expect(contextOf('Journaldeep firmware notes')).toEqual(['Homelab', 'Router upgrade']);
    expect(contextOf('Journaldeep promotion notes')).toEqual(['1:1 with Alice', 'Career goals']);
    // Below a property-only block: the parent falls back to "Career goals".
    expect(contextOf('Journaldeep raise notes')).toEqual(['1:1 with Alice', 'Career goals']);
    for (const hit of journal.hits) {
      for (const line of hit.context) {
        expect(line.uuid).toMatch(/^[0-9a-f-]{36}$/);
        expect(line.segments.map((s) => s.value).join('')).toBe(line.text);
      }
    }
  });

  test('journal pages', async () => {
    const { pages } = await service.recall('Recallprobe journal');
    const journal = pages.find((p) => p.kind === 'journal')!;
    expect(journal.journalDay).toBe(20241105);
    const entry = findHit([journal], 'Recallprobe journal entry')!;
    expect(entry.text).toBe('Recallprobe journal entry linking Recall Notes');
    expect(entry.context).toEqual([]);
  });

  test('tasks, images and markup', async () => {
    const review = findHit(
      (await service.recall('Recallprobe review')).pages,
      'Recallprobe review',
    )!;
    expect(review.task).toEqual({ marker: 'DONE', done: true });
    expect(review.text).toBe('Recallprobe review finished');
    const shot = findHit(
      (await service.recall('Recallprobe screenshot')).pages,
      'Recallprobe screenshot',
    )!;
    expect(shot.text).toBe('Recallprobe screenshot [image] and bold text');
  });

  test('drops template blocks and DB property values', async () => {
    const { pages } = await service.recall('Recallprobe template property value');
    // The "Templates" title matches "template"; its blocks must not.
    expect(pages.find((p) => p.title === 'Templates')?.hits ?? []).toEqual([]);
    const texts = allHits(pages).map((h) => h.text);
    expect(texts).not.toContain('Recallprobe property value text');
    expect(texts.some((t) => t.includes('template'))).toBe(false);
    if (!isDB) {
      // A property line is not text: only the line after it is.
      const { pages: withProperty } = await service.recall('Recallprobe property line');
      expect(findHit(withProperty, 'Recallprobe block')?.text).toBe(
        'Recallprobe block with a property line',
      );
    }
  });

  test('drops hits nested two levels below a template block', async () => {
    // Logseq finds it; its parent is "Section", the template is above that.
    const found = await Promise.all(
      (await search('templatedeep')).map(async (b) => {
        const block = await api('logseq.Editor.getBlock', [b.uuid ?? b['block/uuid']]);
        return block?.fullTitle ?? block?.content;
      }),
    );
    expect(found).toContain('Templatedeep grandchild notes');
    const { pages } = await service.recall('templatedeep');
    expect(allHits(pages).map((h) => h.text)).toEqual([]);
  });

  test.skipIf(!isDB)('drops DB tag and property pages', async () => {
    const { pages } = await service.recall('research recallnote');
    expect(pages.find((p) => p.title === 'research')).toBeUndefined();
    expect(pages.find((p) => p.title === 'recallnote')).toBeUndefined();
  });

  test('fuzzy matches without any query term are dropped', async () => {
    // Logseq answers queries with no exact match with subsequence matches.
    expect((await service.recall('lmtprb')).pages).toEqual([]);
  });

  test('ranks every hit before cutting, counts hits per page', async () => {
    const { pages } = await service.recall('limitprobe');
    const probe = pages.find((p) => p.title === 'Limit Probe')!;
    expect(probe.hits).toHaveLength(MAX_HITS_PER_PAGE);
    // 30 hits asked on 2.x; 0.10.x returns 10 at most.
    expect(probe.totalHits).toBe(isDB ? LIMIT_PROBE_BLOCKS : 10);
  });
});
