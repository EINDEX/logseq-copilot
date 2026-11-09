import { describe, expect, it } from 'vitest';
import {
  broadestScopePrefix,
  mentionsScope,
  scopePrefixes,
} from './recall-scope';
import { RecallRuleProcessor } from './recall-rule-processor';
import type { RecallRuleConfig } from './storage';

const pr = new URL('https://github.com/foo/bar/pull/123');

describe('scopePrefixes', () => {
  it('is only the page without a depth', () => {
    expect(scopePrefixes(pr)).toEqual(['github.com/foo/bar/pull/123']);
    expect(scopePrefixes(pr, 0)).toEqual(['github.com/foo/bar/pull/123']);
  });

  it('goes up to the depth, narrowest first, with every level between', () => {
    expect(scopePrefixes(pr, 1)).toEqual([
      'github.com/foo/bar/pull/123',
      'github.com/foo/bar/pull',
      'github.com/foo/bar',
      'github.com/foo',
    ]);
    expect(scopePrefixes(pr, 2)).toEqual([
      'github.com/foo/bar/pull/123',
      'github.com/foo/bar/pull',
      'github.com/foo/bar',
    ]);
    expect(scopePrefixes(pr, 3)).toEqual([
      'github.com/foo/bar/pull/123',
      'github.com/foo/bar/pull',
    ]);
  });

  it('is only the page when the depth reaches it', () => {
    expect(scopePrefixes(pr, 4)).toEqual(['github.com/foo/bar/pull/123']);
    expect(scopePrefixes(pr, 9)).toEqual(['github.com/foo/bar/pull/123']);
  });

  it('has no scheme, query, hash or trailing slash', () => {
    const url = new URL('http://example.com:8080/a/b/?q=1#h');
    expect(scopePrefixes(url, 1)).toEqual(['example.com:8080/a/b', 'example.com:8080/a']);
  });

  it('never is the bare host', () => {
    for (const depth of [undefined, 0, 1, 2, 3]) {
      expect(scopePrefixes(new URL('https://github.com/'), depth)).toEqual([]);
      expect(scopePrefixes(new URL('https://github.com/foo'), depth)).not.toContain('github.com');
      expect(scopePrefixes(pr, depth)).not.toContain('github.com');
    }
  });

  it('works on the URL after the rule dropped path segments', () => {
    const rule = {
      queryProcessing: {
        ignoreHashFragments: true,
        ignoreQueryParams: true,
        excludeKeywords: [],
        includeKeywords: [],
        ignorePathSegments: ['files'],
      },
    } as unknown as RecallRuleConfig;
    const processed = RecallRuleProcessor.getInstance().processUrl(
      new URL('https://github.com/foo/bar/pull/123/files?w=1#diff'),
      [rule],
    );
    expect(scopePrefixes(processed, 2)).toEqual([
      'github.com/foo/bar/pull/123',
      'github.com/foo/bar/pull',
      'github.com/foo/bar',
    ]);
  });
});

describe('broadestScopePrefix', () => {
  it('is the last level, or undefined without a path', () => {
    expect(broadestScopePrefix(pr, 2)).toBe('github.com/foo/bar');
    expect(broadestScopePrefix(pr)).toBe('github.com/foo/bar/pull/123');
    expect(broadestScopePrefix(new URL('https://github.com/'), 2)).toBeUndefined();
  });
});

describe('mentionsScope', () => {
  const prefix = 'github.com/foo/bar';

  it.each([
    'see https://github.com/foo/bar',
    'https://github.com/foo/bar/',
    'https://github.com/foo/bar/issues/1',
    '[repo](https://github.com/foo/bar)',
    'https://github.com/foo/bar?tab=readme',
    'https://github.com/foo/bar#readme',
    'https://github.com/foo/bar and more',
    '<https://github.com/foo/bar>',
    '"https://github.com/foo/bar"',
    "'https://github.com/foo/bar'",
    '[[https://github.com/foo/bar]]',
    'read github.com/foo/bar.',
    'github.com/foo/bar, then',
    'github.com/foo/bar项目',
  ])('keeps %s', (content) => {
    expect(mentionsScope(content, prefix)).toBe(true);
  });

  it.each([
    'https://github.com/foo/barbaz',
    'https://github.com/foo/bar-cli',
    'https://github.com/foo/bar_x',
    'https://github.com/foo/bar.js',
    'https://github.com/foo/bar2',
    'nothing here',
    '',
  ])('drops %s', (content) => {
    expect(mentionsScope(content, prefix)).toBe(false);
  });

  it('is case-insensitive', () => {
    expect(mentionsScope('https://GitHub.com/Foo/Bar/pull/1', prefix)).toBe(true);
    expect(mentionsScope('https://github.com/foo/bar', 'GitHub.com/Foo/BAR')).toBe(true);
  });

  it('keeps a later boundary match after an earlier non-match', () => {
    expect(
      mentionsScope('github.com/foo/barbaz and github.com/foo/bar', prefix),
    ).toBe(true);
  });

  it('is false without content', () => {
    expect(mentionsScope(undefined, prefix)).toBe(false);
  });
});
