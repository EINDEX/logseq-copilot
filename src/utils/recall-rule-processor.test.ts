import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing';
import {
  pageInScope,
  pageNameOf,
  ProcessedSearchContext,
  RecallRuleProcessor,
} from './recall-rule-processor';

const processor = RecallRuleProcessor.getInstance();

const context = (
  overrides: Partial<ProcessedSearchContext> = {},
): ProcessedSearchContext => ({
  originalUrl: new URL('https://example.com/'),
  processedUrl: new URL('https://example.com/'),
  searchQueries: [],
  excludeKeywords: [],
  includeKeywords: [],
  searchScope: {},
  resultFiltering: { prioritizeRecent: false },
  appliedRules: [],
  ...overrides,
});

const block = (uuid: string, page: unknown, content = uuid) => ({
  uuid,
  content,
  page: page as any,
});

const uuids = (items: { uuid: string }[]) => items.map((i) => i.uuid);

beforeEach(() => {
  fakeBrowser.reset();
});

describe('page scope filtering', () => {
  it('excludes a page by exact name', () => {
    const ctx = context({ searchScope: { excludePages: ['Work'] } });
    const res = processor.filterResults(
      [block('a', { name: 'work', originalName: 'Work' }), block('b', { name: 'notes' })],
      ctx,
    );
    expect(uuids(res)).toEqual(['b']);
  });

  it('does not exclude pages that only contain the name as a substring', () => {
    const ctx = context({ searchScope: { excludePages: ['Work'] } });
    const res = processor.filterResults(
      [block('a', { name: 'homework', originalName: 'Homework' })],
      ctx,
    );
    expect(uuids(res)).toEqual(['a']);
  });

  it('matches page names case-insensitively and ignores surrounding spaces', () => {
    const ctx = context({ searchScope: { excludePages: ['  daily NOTES '] } });
    const res = processor.filterResults(
      [block('a', { originalName: 'Daily Notes' }), block('b', { title: 'Other' })],
      ctx,
    );
    expect(uuids(res)).toEqual(['b']);
  });

  it('drops results whose page name is unknown while exclude rules are active', () => {
    const ctx = context({ searchScope: { excludePages: ['Work'] } });
    const res = processor.filterResults(
      [block('id-ref', 42), block('no-name', { id: 7 }), block('none', undefined), block('ok', { name: 'notes' })],
      ctx,
    );
    expect(uuids(res)).toEqual(['ok']);
  });

  it('keeps results with unknown pages when no scope rule is active', () => {
    const res = processor.filterResults([block('id-ref', 42)], context());
    expect(uuids(res)).toEqual(['id-ref']);
  });

  it('restrictToPages keeps only exact (case-insensitive) matches', () => {
    const ctx = context({ searchScope: { restrictToPages: ['Project X'] } });
    const res = processor.filterResults(
      [
        block('a', { name: 'project x' }),
        block('b', { name: 'project xyz' }),
        block('c', 3),
      ],
      ctx,
    );
    expect(uuids(res)).toEqual(['a']);
  });

  it('pageNameOf prefers title, then originalName, then name', () => {
    expect(pageNameOf({ title: 'T', originalName: 'O', name: 'n' })).toBe('T');
    expect(pageNameOf({ originalName: 'O', name: 'n' })).toBe('O');
    expect(pageNameOf({ name: 'n' })).toBe('n');
    expect(pageNameOf('Page')).toBe('Page');
    expect(pageNameOf({ name: '  ' })).toBeUndefined();
    expect(pageNameOf(12)).toBeUndefined();
  });

  it('pageInScope ignores blank scope entries', () => {
    expect(pageInScope(12, { excludePages: ['', '  '] })).toBe(true);
  });
});

describe('filterPages', () => {
  it('applies the page scope to page results', () => {
    const ctx = context({ searchScope: { excludePages: ['Work'] } });
    const pages = [
      { id: 1, uuid: 'p1', name: 'work', originalName: 'Work' },
      { id: 2, uuid: 'p2', name: 'homework', originalName: 'Homework' },
      { id: 3, uuid: 'p3', name: '' },
    ];
    expect(processor.filterPages(pages, ctx).map((p) => p.uuid)).toEqual(['p2']);
  });

  it('restrictToPages keeps only the listed pages', () => {
    const ctx = context({ searchScope: { restrictToPages: ['homework'] } });
    const pages = [
      { id: 1, uuid: 'p1', name: 'work' },
      { id: 2, uuid: 'p2', name: 'Homework' },
    ];
    expect(processor.filterPages(pages, ctx).map((p) => p.uuid)).toEqual(['p2']);
  });
});

const rule = (overrides: Record<string, any> = {}) => ({
  id: overrides.id ?? 'r',
  name: overrides.name ?? 'rule',
  enabled: overrides.enabled ?? true,
  urlPattern: overrides.urlPattern ?? '.*',
  queryProcessing: {
    ignoreHashFragments: false,
    ignoreQueryParams: false,
    excludeKeywords: [],
    includeKeywords: [],
    ignorePathSegments: [],
    ...overrides.queryProcessing,
  },
  searchScope: { ...overrides.searchScope },
  resultFiltering: { prioritizeRecent: false, ...overrides.resultFiltering },
});

const seedRules = (rules: unknown[]) =>
  fakeBrowser.storage.local.set({ recallRulesConfig: rules });

describe('rule matching', () => {
  it('skips disabled rules and invalid patterns, longest pattern first', async () => {
    await seedRules([
      rule({ id: 'all', urlPattern: '.*' }),
      rule({ id: 'off', urlPattern: 'github', enabled: false }),
      rule({ id: 'bad', urlPattern: '(' }),
      rule({ id: 'gh', urlPattern: 'github\\.com/.*/pull' }),
      rule({ id: 'other', urlPattern: 'gitlab\\.com' }),
    ]);
    await processor.initialize();

    const ids = processor
      .getMatchingRules('https://github.com/a/b/pull/1')
      .map((r) => r.id);
    expect(ids).toEqual(['gh', 'all']);
  });

  it('uses the default rules when nothing is stored', async () => {
    const ctx = await processor.processSearchContext('https://x.example/#/route');
    expect(ctx.appliedRules.map((r) => r.id)).toEqual(['default-spa']);
    expect(ctx.processedUrl.href).toBe('https://x.example/');
    expect(ctx.resultFiltering.maxResults).toBe(10);
  });

  it('re-reads rules from storage on every search', async () => {
    await seedRules([rule({ id: 'first' })]);
    expect(
      (await processor.processSearchContext('https://x.example/')).appliedRules.map((r) => r.id),
    ).toEqual(['first']);

    await seedRules([rule({ id: 'second' })]);
    expect(
      (await processor.processSearchContext('https://x.example/')).appliedRules.map((r) => r.id),
    ).toEqual(['second']);
  });
});

describe('processUrl', () => {
  it('drops hash, query and ignored path segments', () => {
    const url = new URL('https://x.example/a/files/b?q=1#h');
    expect(processor.processUrl(url, [rule()]).href).toBe(url.href);
    expect(
      processor.processUrl(url, [
        rule({
          queryProcessing: {
            ignoreHashFragments: true,
            ignoreQueryParams: true,
            ignorePathSegments: ['files'],
          },
        }),
      ]).href,
    ).toBe('https://x.example/a/b');
  });
});

describe('combining rules', () => {
  it('intersects restrictToPages, unions excludePages, takes the tightest limits', () => {
    const rules = [
      rule({
        searchScope: {
          restrictToPages: ['A', 'B'],
          excludePages: ['X'],
          journalDateRange: { enabled: true, days: 30 },
        },
        resultFiltering: { maxResults: 20, minRelevanceScore: 1 },
      }),
      rule({
        searchScope: {
          restrictToPages: ['B', 'C'],
          excludePages: ['Y', 'X'],
          journalDateRange: { enabled: true, days: 7 },
        },
        resultFiltering: { maxResults: 5, minRelevanceScore: 3, prioritizeRecent: true },
      }),
    ] as any;

    expect(processor.combineSearchScope(rules)).toEqual({
      restrictToPages: ['B'],
      excludePages: ['X', 'Y'],
      journalDateRange: { enabled: true, days: 7 },
    });
    expect(processor.combineResultFiltering(rules)).toEqual({
      maxResults: 5,
      minRelevanceScore: 3,
      prioritizeRecent: true,
    });
  });

  it('collects include/exclude keywords and search queries', async () => {
    await seedRules([
      rule({ queryProcessing: { excludeKeywords: ['spam'], includeKeywords: ['code'] } }),
    ]);
    const ctx = await processor.processSearchContext('https://x.example/p');
    expect(ctx.excludeKeywords).toEqual(['spam']);
    expect(ctx.includeKeywords).toEqual(['code']);
    expect(ctx.searchQueries).toEqual([
      'x.example/p',
      'x.example',
      'x.example/p code',
      'x.example code',
    ]);
  });
});

describe('filterResults', () => {
  it('drops excluded keywords, ranks include keywords first and caps the count', () => {
    const ctx = context({
      excludeKeywords: ['SPAM'],
      includeKeywords: ['code'],
      resultFiltering: { prioritizeRecent: false, maxResults: 2 },
    });
    const res = processor.filterResults(
      [
        block('plain', { name: 'p' }, 'nothing here'),
        block('spam', { name: 'p' }, 'buy spam now'),
        block('code', { name: 'p' }, 'some Code sample'),
        block('more', { name: 'p' }, 'more text'),
      ],
      ctx,
    );
    expect(uuids(res)).toEqual(['code', 'plain']);
  });
});
