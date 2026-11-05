import { describe, expect, test, vi } from 'vitest';
import { BlockCache } from './block-cache';
import { parseBlockText } from './block-text';
import type { CandidateBlock, CandidatePage } from './rank';
import {
  MAX_HITS_PER_PAGE,
  recall,
  type AncestorBlock,
  type RecallSource,
} from './recall';

const page = (title: string, extra: Partial<CandidatePage> = {}): CandidatePage => ({
  uuid: `page-${title}`,
  name: title.toLowerCase(),
  title,
  kind: 'page',
  ...extra,
});

type FakeBlock = {
  uuid: string;
  raw: string;
  page: CandidatePage;
  parent?: string;
  template?: boolean;
};

/** An in-memory graph: `results` maps a search text to block uuids / pages. */
const fakeSource = (
  blocks: FakeBlock[],
  results: Record<string, { blocks?: string[]; pages?: CandidatePage[] }>,
) => {
  const byUuid = new Map(blocks.map((b) => [b.uuid, b]));
  const candidate = (b: FakeBlock): CandidateBlock => ({
    uuid: b.uuid,
    page: b.page,
    raw: b.raw,
    parsed: parseBlockText(b.raw),
    noise: b.template,
    parentRef: b.parent,
  });
  const source = {
    getGraph: vi.fn(async () => 'g'),
    search: vi.fn(async (q: string) => ({
      blocks: (results[q]?.blocks ?? []).map((uuid) => candidate(byUuid.get(uuid)!)),
      pages: results[q]?.pages ?? [],
    })),
    getAncestor: vi.fn(async (ref: number | string): Promise<AncestorBlock | null> => {
      const b = byUuid.get(String(ref));
      return b
        ? { uuid: b.uuid, raw: b.raw, template: !!b.template, parentRef: b.parent }
        : null;
    }),
    getRefText: vi.fn(async ({ uuid }: { uuid: string }) => byUuid.get(uuid)?.raw),
  } satisfies RecallSource;
  return source;
};

const P = page('Notes');

describe('recall', () => {
  test('an empty query does not search', async () => {
    const source = fakeSource([], {});
    expect(await recall(source, '  ')).toEqual({ graph: 'g', pages: [] });
    expect(source.search).not.toHaveBeenCalled();
  });

  test('searches the primary query, falls back to single terms when nothing is left', async () => {
    const blocks = [
      { uuid: 'fuzzy', raw: 'l o g s e q', page: P },
      { uuid: 'hit', raw: 'plugin notes', page: P },
    ];
    const source = fakeSource(blocks, {
      'logseq plugin': { blocks: ['fuzzy'] },
      logseq: { blocks: ['fuzzy'] },
      plugin: { blocks: ['hit'] },
    });
    const { pages } = await recall(source, 'logseq plugin');
    expect(source.search.mock.calls.map((c) => c[0])).toEqual([
      'logseq plugin',
      'logseq',
      'plugin',
    ]);
    expect(pages[0].hits.map((h) => h.uuid)).toEqual(['hit']);
    expect(pages[0].matchedTerms).toEqual(['plugin']);
  });

  test('stops after the first fallback that finds something, at most two', async () => {
    const blocks = [{ uuid: 'hit', raw: 'runtime notes', page: P }];
    const found = fakeSource(blocks, { runtime: { blocks: ['hit'] } });
    await recall(found, 'rust async runtime tokio');
    expect(found.search.mock.calls.map((c) => c[0])).toEqual([
      'rust async runtime tokio',
      'runtime',
    ]);
    const none = fakeSource([], {});
    await recall(none, 'rust async runtime tokio');
    expect(none.search).toHaveBeenCalledTimes(3);
  });

  test('a single term is not searched again', async () => {
    const source = fakeSource([], {});
    await recall(source, 'logseq');
    expect(source.search).toHaveBeenCalledTimes(1);
  });

  test('cuts to 6 pages of 5 hits after ranking, maxResults counts pages', async () => {
    const blocks: FakeBlock[] = [];
    for (let p = 0; p < 8; p++) {
      for (let h = 0; h <= p; h++) {
        blocks.push({ uuid: `p${p}h${h}`, raw: `logseq ${h}`, page: page(`Page ${p}`) });
      }
    }
    const source = fakeSource(blocks, { logseq: { blocks: blocks.map((b) => b.uuid) } });
    const { pages } = await recall(source, 'logseq');
    // Most hits first: Page 7 has 8.
    expect(pages.map((p) => p.title)).toEqual([
      'Page 7', 'Page 6', 'Page 5', 'Page 4', 'Page 3', 'Page 2',
    ]);
    expect(MAX_HITS_PER_PAGE).toBe(5);
    expect(pages[0].hits).toHaveLength(5);
    expect(pages[0].totalHits).toBe(8);
    expect(pages[4].hits).toHaveLength(4);
    expect(pages[5].hits).toHaveLength(3);
    expect((await recall(source, 'logseq', { maxPages: 2 })).pages).toHaveLength(2);
    expect((await recall(source, 'logseq', { maxPages: 10 })).pages).toHaveLength(6);
  });

  describe('context', () => {
    const J = page('Nov 5th, 2024', { kind: 'journal', journalDay: 20241105 });
    const contextOf = async (blocks: FakeBlock[], hit = 'hit') => {
      const source = fakeSource(blocks, { logseq: { blocks: [hit] } });
      const { pages } = await recall(source, 'logseq');
      return pages[0].hits[0].context;
    };
    const uuids = (context: { uuid: string }[]) => context.map((c) => c.uuid);

    test('a top-level hit has none', async () => {
      expect(await contextOf([{ uuid: 'hit', raw: 'logseq top', page: P }])).toEqual([]);
      expect(
        await contextOf([{ uuid: 'hit', raw: 'logseq top', page: J }]),
      ).toEqual([]);
    });

    test('a page hit gets its direct parent only, cleaned and cut to 80', async () => {
      const context = await contextOf([
        { uuid: 'root', raw: 'Root block', page: P },
        { uuid: 'mid', raw: `Mid with [[Page]] ${'x'.repeat(100)}`, page: P, parent: 'root' },
        { uuid: 'hit', raw: 'logseq leaf', page: P, parent: 'mid' },
      ]);
      expect(uuids(context)).toEqual(['mid']);
      expect(context[0].text).toHaveLength(80);
      expect(context[0].text.endsWith('…')).toBe(true);
      expect(context[0].segments.slice(0, 2)).toEqual([
        { kind: 'text', value: 'Mid with ' },
        { kind: 'ref', value: 'Page' },
      ]);
      expect(context[0].segments.map((s) => s.value).join('')).toBe(context[0].text);
    });

    test('an empty direct parent falls back to the nearest ancestor with text', async () => {
      const context = await contextOf([
        { uuid: 'root', raw: 'Root block', page: P },
        { uuid: 'section', raw: 'Section', page: P, parent: 'root' },
        { uuid: 'props', raw: 'kind:: container', page: P, parent: 'section' },
        { uuid: 'hit', raw: 'logseq leaf', page: P, parent: 'props' },
      ]);
      expect(context).toEqual([
        { uuid: 'section', text: 'Section', segments: [{ kind: 'text', value: 'Section' }] },
      ]);
    });

    test('no context when every ancestor is empty', async () => {
      const blocks = (p: CandidatePage): FakeBlock[] => [
        { uuid: 'a', raw: 'kind:: outer', page: p },
        { uuid: 'b', raw: 'kind:: inner', page: p, parent: 'a' },
        { uuid: 'hit', raw: 'logseq leaf', page: p, parent: 'b' },
      ];
      expect(await contextOf(blocks(P))).toEqual([]);
      expect(await contextOf(blocks(J))).toEqual([]);
    });

    test('a deep journal hit gets its top-level block, then its parent', async () => {
      const context = await contextOf([
        { uuid: 'homelab', raw: 'Homelab', page: J },
        { uuid: 'router', raw: 'Router upgrade', page: J, parent: 'homelab' },
        { uuid: 'step', raw: 'Firmware', page: J, parent: 'router' },
        { uuid: 'hit', raw: 'logseq leaf', page: J, parent: 'step' },
      ]);
      expect(context.map((c) => c.text)).toEqual(['Homelab', 'Firmware']);
    });

    test('a journal parent that falls back to the top-level block is listed once', async () => {
      const context = await contextOf([
        { uuid: 'homelab', raw: 'Homelab', page: J },
        { uuid: 'props', raw: 'kind:: container', page: J, parent: 'homelab' },
        { uuid: 'hit', raw: 'logseq leaf', page: J, parent: 'props' },
      ]);
      expect(uuids(context)).toEqual(['homelab']);
    });

    test('a journal hit one level down: the parent is the top-level block', async () => {
      const context = await contextOf([
        { uuid: 'homelab', raw: 'Homelab', page: J },
        { uuid: 'hit', raw: 'logseq leaf', page: J, parent: 'homelab' },
      ]);
      expect(uuids(context)).toEqual(['homelab']);
    });

    test('an empty journal top-level block is left out', async () => {
      const context = await contextOf([
        { uuid: 'root', raw: 'kind:: day', page: J },
        { uuid: 'router', raw: 'Router upgrade', page: J, parent: 'root' },
        { uuid: 'hit', raw: 'logseq leaf', page: J, parent: 'router' },
      ]);
      expect(uuids(context)).toEqual(['router']);
    });

    test('references in context lines are resolved', async () => {
      const target = '00000000-0000-4000-8000-000000000001';
      const context = await contextOf([
        { uuid: target, raw: 'target text', page: P },
        { uuid: 'parent', raw: `see ((${target}))`, page: P },
        { uuid: 'hit', raw: 'logseq leaf', page: P, parent: 'parent' },
      ]);
      expect(context[0].text).toBe('see target text');
    });
  });

  test('template content is dropped, the next hit takes its place', async () => {
    const blocks: FakeBlock[] = [
      { uuid: 'tpl', raw: 'meeting template', page: P, template: true },
      { uuid: 'tpl-child', raw: 'logseq agenda', page: P, parent: 'tpl' },
      { uuid: 'mid', raw: 'section', page: P, parent: 'tpl' },
      { uuid: 'tpl-grandchild', raw: 'logseq notes', page: P, parent: 'mid' },
      ...['a', 'b', 'c'].map((x) => ({ uuid: x, raw: `logseq ${x}`, page: P })),
      { uuid: 'only', raw: 'logseq only', page: page('Templates'), parent: 'tpl' },
    ];
    const source = fakeSource(blocks, {
      logseq: { blocks: ['tpl-child', 'tpl-grandchild', 'a', 'b', 'c', 'only'] },
    });
    const { pages } = await recall(source, 'logseq');
    expect(pages.map((p) => p.title)).toEqual(['Notes']);
    expect(pages[0].hits.map((h) => h.uuid)).toEqual(['a', 'b', 'c']);
    expect(pages[0].totalHits).toBe(3);
  });

  test('resolves at most 10 references per request, hits first', async () => {
    const refs: FakeBlock[] = Array.from({ length: 12 }, (_, i) => ({
      uuid: `00000000-0000-4000-8000-0000000000${String(i).padStart(2, '0')}`,
      raw: `target ${i}`,
      page: P,
    }));
    const hit: FakeBlock = {
      uuid: 'hit',
      raw: `logseq ${refs.map((r) => `((${r.uuid}))`).join(' ')}`,
      page: P,
    };
    const source = fakeSource([...refs, hit], { logseq: { blocks: ['hit'] } });
    const { pages } = await recall(source, 'logseq');
    expect(source.getRefText).toHaveBeenCalledTimes(10);
    const values = pages[0].hits[0].segments.filter((s) => s.kind === 'ref').map((s) => s.value);
    expect(values.slice(0, 10)).toEqual(refs.slice(0, 10).map((r) => r.raw));
    expect(values.slice(10)).toEqual(['[block]', '[block]']);
  });

  test('walks every hit up to the page, reading each block once', async () => {
    const blocks: FakeBlock[] = [
      { uuid: 'root', raw: 'Root block', page: P },
      { uuid: 'mid', raw: 'Mid block', page: P, parent: 'root' },
      { uuid: 'parent', raw: 'Parent block', page: P, parent: 'mid' },
      { uuid: 'h1', raw: 'logseq 1', page: P, parent: 'parent' },
      { uuid: 'h2', raw: 'logseq 2', page: P, parent: 'mid' },
    ];
    const source = fakeSource(blocks, { logseq: { blocks: ['h1', 'h2'] } });
    const { pages } = await recall(source, 'logseq');
    expect(pages[0].hits.map((h) => h.context.map((c) => c.uuid))).toEqual([
      ['parent'],
      ['mid'],
    ]);
    // The whole chain is read (template check), each block once.
    expect(source.getAncestor.mock.calls.map((c) => c[0]).sort()).toEqual([
      'mid',
      'parent',
      'root',
    ]);
  });

  test('ancestors shared by hits are read once', async () => {
    const blocks: FakeBlock[] = [{ uuid: 'parent', raw: 'parent', page: P }];
    for (let i = 0; i < 7; i++) {
      blocks.push({ uuid: `h${i}`, raw: `logseq ${i}`, page: P, parent: 'parent' });
    }
    const source = fakeSource(blocks, { logseq: { blocks: blocks.slice(1).map((b) => b.uuid) } });
    const { pages } = await recall(source, 'logseq');
    expect(pages[0].hits).toHaveLength(MAX_HITS_PER_PAGE);
    expect(source.getAncestor).toHaveBeenCalledTimes(1);
  });
});

describe('BlockCache', () => {
  test('reads a block once, by id or by uuid', async () => {
    const load = vi.fn(async (ref: number | string) =>
      ref === 7 || ref === 'u7' ? { id: 7, uuid: 'u7' } : null,
    );
    const cache = new BlockCache(load);
    expect(await cache.get('u7')).toEqual({ id: 7, uuid: 'u7' });
    await Promise.all([cache.get(7), cache.get('7'), cache.get('u7')]);
    expect(load).toHaveBeenCalledTimes(1);
    expect(await cache.get(8)).toBeNull();
    await cache.get(8);
    expect(load).toHaveBeenCalledTimes(2);
  });

  test('concurrent asks share one request', async () => {
    const load = vi.fn(async () => ({ id: 1, uuid: 'u1' }));
    const cache = new BlockCache(load);
    await Promise.all([cache.get(1), cache.get(1)]);
    expect(load).toHaveBeenCalledTimes(1);
  });
});
