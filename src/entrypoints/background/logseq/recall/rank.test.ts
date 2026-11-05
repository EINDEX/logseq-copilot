import { describe, expect, test } from 'vitest';
import { parseBlockText } from './block-text';
import { pageScore, rankRecall, type CandidateBlock, type CandidatePage } from './rank';

const page = (title: string, extra: Partial<CandidatePage> = {}): CandidatePage => ({
  uuid: `page-${title}`,
  name: title.toLowerCase(),
  title,
  kind: 'page',
  ...extra,
});

let n = 0;
const block = (
  p: CandidatePage,
  raw: string,
  extra: Partial<CandidateBlock> = {},
): CandidateBlock => ({
  uuid: `b${++n}`,
  page: p,
  raw,
  parsed: parseBlockText(raw),
  ...extra,
});

const titles = (ranked: ReturnType<typeof rankRecall>) => ranked.map((r) => r.page.title);

describe('rankRecall', () => {
  test('drops hits without any term, empty hits and noise', () => {
    const p = page('Notes');
    const ranked = rankRecall(
      [
        block(p, 'logseq plugin api'),
        block(p, 'l o g s e q fuzzy recall'),
        block(p, 'status:: draft'),
        block(p, 'logseq template', { noise: true }),
        block(page('Tag', { noise: true }), 'logseq tag page block'),
      ],
      [],
      { terms: ['logseq', 'api'] },
    );
    expect(ranked).toHaveLength(1);
    expect(ranked[0].hits.map((h) => h.raw)).toEqual(['logseq plugin api']);
    expect(ranked[0].hits[0].matchedTerms).toEqual(['logseq', 'api']);
  });

  test('matches the resolved text, not the raw markup', () => {
    const p = page('Notes');
    const ranked = rankRecall([block(p, 'see [[Logseq API]]')], [], { terms: ['logseq api'] });
    expect(ranked).toHaveLength(1);
  });

  test('distinct terms beat hit count, hit count beats recency', () => {
    const one = page('One term, many hits', { updatedAt: 3 });
    const two = page('Two terms', { updatedAt: 1 });
    const fewer = page('Same terms, fewer hits', { updatedAt: 9 });
    const ranked = rankRecall(
      [
        block(one, 'logseq a'),
        block(one, 'logseq b'),
        block(one, 'logseq c'),
        block(two, 'logseq api'),
        block(fewer, 'logseq d'),
      ],
      [],
      { terms: ['logseq', 'api'] },
    );
    expect(titles(ranked)).toEqual(['Two terms', 'One term, many hits', 'Same terms, fewer hits']);
    expect(ranked[0].score).toBe(pageScore(2, 1));
    expect(ranked[1].score).toBe(pageScore(1, 3));
  });

  test('recency breaks ties; prioritizeRecent puts it before hit count', () => {
    const old = page('Old', { updatedAt: 1 });
    const recent = page('Recent', { updatedAt: 5 });
    const blocks = [block(old, 'logseq a'), block(old, 'logseq b'), block(recent, 'logseq c')];
    expect(titles(rankRecall(blocks, [], { terms: ['logseq'] }))).toEqual(['Old', 'Recent']);
    expect(
      titles(rankRecall(blocks, [], { terms: ['logseq'], prioritizeRecent: true })),
    ).toEqual(['Recent', 'Old']);
  });

  test('a hit updatedAt counts as page recency', () => {
    const a = page('A');
    const b = page('B');
    const ranked = rankRecall(
      [block(a, 'logseq', { updatedAt: 1 }), block(b, 'logseq', { updatedAt: 7 })],
      [],
      { terms: ['logseq'] },
    );
    expect(titles(ranked)).toEqual(['B', 'A']);
    expect(ranked[0].updatedAt).toBe(7);
  });

  test('hits in a page: more terms first, then newer', () => {
    const p = page('P');
    const ranked = rankRecall(
      [
        block(p, 'logseq old', { updatedAt: 1 }),
        block(p, 'logseq new', { updatedAt: 9 }),
        block(p, 'logseq api', { updatedAt: 0 }),
      ],
      [],
      { terms: ['logseq', 'api'] },
    );
    expect(ranked[0].hits.map((h) => h.raw)).toEqual(['logseq api', 'logseq new', 'logseq old']);
  });

  test('title hits make a page without block hits; the title adds terms', () => {
    const titled = page('Logseq API');
    const ranked = rankRecall(
      [block(titled, 'about plugins')],
      [titled, page('Unrelated'), page('Logseq tags', { noise: true })],
      { terms: ['logseq', 'api'] },
    );
    expect(titles(ranked)).toEqual(['Logseq API']);
    expect(ranked[0].hits).toEqual([]);
    expect(ranked[0].matchedTerms).toEqual(['logseq', 'api']);
  });

  test('duplicate uuids (several searches) count once', () => {
    const p = page('P');
    const b = block(p, 'logseq');
    expect(rankRecall([b, { ...b }], [], { terms: ['logseq'] })[0].hits).toHaveLength(1);
  });

  test('recall rules: exclude keywords, page scope, include keywords', () => {
    const work = page('Work');
    const home = page('Home');
    const blocks = [
      block(work, 'logseq meeting'),
      block(home, 'logseq secret'),
      block(home, 'logseq garden'),
    ];
    expect(
      rankRecall(blocks, [], { terms: ['logseq'], excludeKeywords: ['SECRET'] })
        .flatMap((r) => r.hits.map((h) => h.raw)),
    ).toEqual(['logseq meeting', 'logseq garden']);
    expect(
      titles(rankRecall(blocks, [], { terms: ['logseq'], searchScope: { excludePages: ['home'] } })),
    ).toEqual(['Work']);
    // Home has more hits, but Work holds the include keyword.
    expect(
      titles(rankRecall(blocks, [], { terms: ['logseq'], includeKeywords: ['meeting'] })),
    ).toEqual(['Work', 'Home']);
  });
});
