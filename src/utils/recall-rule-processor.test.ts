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
