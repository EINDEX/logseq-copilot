import { describe, expect, test, vi } from 'vitest';
import type { LogseqBlockType } from '@/types/logseqBlock';

const answer = vi.hoisted(() => ({ run: async (): Promise<unknown> => undefined }));

vi.mock('./client', () => ({
  default: class {
    isDBGraph = () => answer.run();
  },
  escapeQueryString: (text: string) =>
    text.replaceAll('\\', '\\\\').replaceAll('"', '\\"'),
}));

import { marked } from 'marked';
import { getLogseqService, markMatches, renderBlock } from './tool';
import LogseqDBService from './db/service';
import LogseqService from './markdown/service';

const render = (content: string, query?: string) =>
  renderBlock({ content } as LogseqBlockType, 'g', query).html;

describe('markMatches / renderBlock highlighting', () => {
  test('highlights every occurrence, not only the first or the leading one', () => {
    expect(render('foo bar hello foo', 'foo')).toBe(
      '<p><mark>foo</mark> bar hello <mark>foo</mark></p>',
    );
    expect(render('say hello to foo', 'foo')).toBe(
      '<p>say hello to <mark>foo</mark></p>',
    );
  });

  test('does not wrap an existing <mark> twice', () => {
    expect(markMatches('a <mark>foo</mark> foo', 'foo')).toBe(
      'a <mark>foo</mark> <mark>foo</mark>',
    );
  });

  test.each(['c++', 'a.b', '(x)', '[x]', 'a|b', '^a$', 'a\\b', '$&'])(
    'treats %s as literal text',
    (query) => {
      expect(markMatches(`x ${query} y ${query}`, query)).toBe(
        `x <mark>${query}</mark> y <mark>${query}</mark>`,
      );
      expect(() => render(`x ${query} y`, query)).not.toThrow();
    },
  );

  test('c++ and URLs with ( or + do not throw when used as query', () => {
    expect(render('I like c++ a lot', 'c++')).toBe(
      '<p>I like <mark>c++</mark> a lot</p>',
    );
    const url = 'https://example.com/f(x+1';
    expect(() => render(`see ${url}`, url)).not.toThrow();
  });

  test('keeps code untouched and highlights page links', () => {
    expect(render('`foo` [[foo bar]]', 'foo')).toContain('<code>foo</code>');
    expect(render('[[foo bar]]', 'foo')).toContain('<mark>foo</mark> bar</a>');
  });

  test('consecutive renders with different queries do not leak', () => {
    expect(render('foo bar', 'foo')).toBe('<p><mark>foo</mark> bar</p>');
    expect(render('foo bar', 'bar')).toBe('<p>foo <mark>bar</mark></p>');
    expect(render('foo bar')).toBe('<p>foo bar</p>');
    expect(render('[[foo]]', 'bar')).not.toContain('<mark>');
  });

  test('does not modify the global marked configuration', () => {
    const before: any = { ...marked.defaults };
    render('foo [[bar]]', 'foo');
    expect((marked.defaults as any).extensions).toBe(before.extensions);
    expect((marked.defaults as any).walkTokens).toBe(before.walkTokens);
    expect(marked.parse('foo [[bar]]').trim()).toBe('<p>foo [[bar]]</p>');
  });
});

describe('getLogseqService', () => {
  test.each([true, 'true'])('uses the DB service when answer is %s', async (v) => {
    answer.run = async () => v;
    expect(await getLogseqService()).toBeInstanceOf(LogseqDBService);
  });

  test.each([false, 'false', { error: 'MethodNotExist' }, null])(
    'uses the file service when answer is %j',
    async (v) => {
      answer.run = async () => v;
      expect(await getLogseqService()).toBeInstanceOf(LogseqService);
    },
  );

  test('falls back to the file service when the request fails', async () => {
    answer.run = async () => {
      throw new Error('network');
    };
    expect(await getLogseqService()).toBeInstanceOf(LogseqService);
  });
});
