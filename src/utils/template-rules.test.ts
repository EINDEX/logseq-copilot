import { describe, expect, it } from 'vitest';
import { BUILT_IN_TEMPLATES } from './default-templates';
import { checkTemplatePattern, matchTemplateRules } from './template-rules';

const t = (id: string, ...rules: string[]) => ({ id, rules });
const ids = (url: string, list: { id: string; rules?: string[] }[]) =>
  matchTemplateRules(url, list).map((x) => x.id);

describe('matchTemplateRules: what a pattern matches', () => {
  // [pattern, url, matches]
  const table: [string, string, boolean][] = [
    // hosts
    ['github.com', 'https://github.com/', true],
    ['github.com', 'https://github.com/a/b?x=1#top', true],
    ['github.com', 'http://github.com:8080/a', true],
    ['github.com', 'https://GitHub.com/a', true],
    ['github.com', 'https://gist.github.com/a', false],
    ['github.com', 'https://notgithub.com/', false],
    ['github.com', 'https://github.com.evil.io/', false],
    ['https://github.com', 'https://github.com/a', true],
    // subdomains
    ['*.example.com', 'https://blog.example.com/p', true],
    ['*.example.com', 'https://a.b.example.com/p', true],
    ['*.example.com', 'https://example.com/p', false],
    ['*.example.com', 'https://badexample.com/p', false],
    // ports
    ['localhost', 'http://localhost:3000/', true],
    ['localhost:3000', 'http://localhost:3000/a', true],
    ['localhost:3000', 'http://localhost:4000/a', false],
    // paths
    ['github.com/a', 'https://github.com/a', true],
    ['github.com/a', 'https://github.com/a/', true],
    ['github.com/a', 'https://github.com/a/b', false],
    ['github.com/a', 'https://github.com/', false],
    ['github.com/a/', 'https://github.com/a', true],
    ['github.com/a/b', 'https://github.com/a/c', false],
    ['github.com/*/issues', 'https://github.com/o/issues', true],
    ['github.com/*/issues', 'https://github.com/o/r/issues', false],
    ['github.com/*/issues/*', 'https://github.com/o/issues/12', true],
    ['github.com/*/issues/*', 'https://github.com/o/issues/12/files', true],
    ['github.com/*/issues/*', 'https://github.com/o/issues', true],
    ['github.com/*/issues/*', 'https://github.com/o/pulls/12', false],
    ['github.com/blog/*', 'https://github.com/blog/a/b/c', true],
    ['github.com/blog/**', 'https://github.com/blog/a/b/c', true],
    ['github.com/blog/*', 'https://github.com/news/a', false],
    ['github.com/*', 'https://github.com/', true],
    ['github.com/*', 'https://github.com/a/b', true],
    ['github.com/a/*/c', 'https://github.com/a/b/c', true],
    ['github.com/a/*/c', 'https://github.com/a/c', false],
    // query and fragment: ignored in the pattern and in the page
    ['github.com/a?tab=1', 'https://github.com/a?tab=2', true],
    ['github.com/a#x', 'https://github.com/a#y', true],
    // paths are case-sensitive
    ['github.com/A', 'https://github.com/a', false],
    // other schemes never match
    ['example.com', 'ftp://example.com/', false],
    ['example.com', 'chrome://example.com/', false],
    ['example.com', 'about:blank', false],
  ];

  it.each(table)('%s on %s: %s', (pattern, url, expected) => {
    expect(matchTemplateRules(url, [t('x', pattern)]).length === 1).toBe(expected);
  });

  it('matches nothing for no url, a bad url or no rules', () => {
    expect(matchTemplateRules(undefined, [t('x', 'a.com')])).toEqual([]);
    expect(matchTemplateRules(null, [t('x', 'a.com')])).toEqual([]);
    expect(matchTemplateRules('not a url', [t('x', 'a.com')])).toEqual([]);
    const noRules: { id: string; rules?: string[] }[] = [{ id: 'x' }, t('y')];
    expect(matchTemplateRules('https://a.com/', noRules)).toEqual([]);
  });

  it('accepts a URL object', () => {
    expect(matchTemplateRules(new URL('https://a.com/p'), [t('x', 'a.com')])).toHaveLength(1);
  });

  it('skips invalid patterns without failing the others', () => {
    expect(ids('https://a.com/', [t('x', 'a.com/**/b', '', 'a b', 'a.com')])).toEqual(['x']);
  });

  it('never matches a built-in template: no rules until the user adds one', () => {
    expect(BUILT_IN_TEMPLATES.every((template) => !('rules' in template))).toBe(true);
    expect(matchTemplateRules('https://a.com/', BUILT_IN_TEMPLATES)).toEqual([]);
  });
});

describe('matchTemplateRules: priority', () => {
  const url = 'https://blog.example.com/posts/2026/hello';

  const cases: [string, { id: string; rules: string[] }[], string[]][] = [
    ['an exact host beats a *. host', [t('wild', '*.example.com'), t('exact', 'blog.example.com')], ['exact', 'wild']],
    [
      'an exact host beats a *. host even with fewer path segments',
      [t('wild', '*.example.com/posts/2026/hello'), t('exact', 'blog.example.com')],
      ['exact', 'wild'],
    ],
    [
      'more literal segments beat fewer on the same host',
      [t('one', 'blog.example.com/posts/*'), t('two', 'blog.example.com/posts/2026/*')],
      ['two', 'one'],
    ],
    [
      'a * segment is not literal',
      [t('star', 'blog.example.com/*/2026/*'), t('lit', 'blog.example.com/posts/2026/*')],
      ['lit', 'star'],
    ],
    [
      'a tie goes to the earlier template',
      [t('first', 'blog.example.com/posts/*'), t('second', 'blog.example.com/posts/*')],
      ['first', 'second'],
    ],
    [
      'a tie between *. hosts goes to the earlier template',
      [t('first', '*.example.com'), t('second', '*.example.com')],
      ['first', 'second'],
    ],
    [
      'a template counts once, with its best pattern',
      [t('many', '*.example.com', 'blog.example.com/posts/2026/hello'), t('other', 'blog.example.com/posts/*')],
      ['many', 'other'],
    ],
    [
      'templates that do not match are left out',
      [t('no', 'other.com'), t('yes', 'example.com/*'), t('wild', '*.example.com')],
      ['wild'],
    ],
  ];

  it.each(cases)('%s', (_name, list, expected) => {
    expect(ids(url, list)).toEqual(expected);
  });

  it('returns the templates themselves', () => {
    const list = [t('a', 'blog.example.com')];
    expect(matchTemplateRules(url, list)[0]).toBe(list[0]);
  });
});

describe('checkTemplatePattern', () => {
  const valid = [
    'github.com',
    '*.example.com',
    'github.com/*/issues/*',
    'github.com/a/**',
    'localhost:3000',
    'https://example.com/a?x=1#y',
    'example.com/a%20b/c.html',
  ];
  const bad = [
    '',
    '   ',
    'a b.com',
    '*',
    '*.',
    '**.example.com',
    'a.*.com',
    'foo*.com',
    '.com',
    'a..com',
    '-a.com',
    'a.com:port',
    'a.com/**/b',
    'a.com/foo*',
    'a.com/*bar',
    'a.com/a<b',
  ];

  it.each(valid)('accepts %s', (pattern) => {
    expect(checkTemplatePattern(pattern)).toEqual({ ok: true });
  });

  it.each(bad)('rejects "%s" with a reason', (pattern) => {
    const result = checkTemplatePattern(pattern);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBeTruthy();
  });
});
