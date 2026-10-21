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
import {
  blockRefTitle,
  blockRefUuids,
  getLogseqService,
  markMatches,
  renderBlock,
  resolveBlockRefs,
} from './tool';
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

describe('renderBlock Logseq syntax', () => {
  const REF = '65f0c0de-0000-4000-8000-000000000001';

  test('page refs and tags link to the page, URL-encoded', () => {
    expect(render('see [[Multi Word Tag]]')).toBe(
      '<p>see <a class="logseq-page-link" href="logseq://graph/g?page=Multi%20Word%20Tag">Multi Word Tag</a></p>',
    );
    expect(render('#[[Multi Word]] and #reading, ok')).toBe(
      '<p><a class="logseq-tag" href="logseq://graph/g?page=Multi%20Word">#Multi Word</a> and ' +
        '<a class="logseq-tag" href="logseq://graph/g?page=reading">#reading</a>, ok</p>',
    );
    expect(render('[[中文 页面]]')).toContain('href="logseq://graph/g?page=%E4%B8%AD%E6%96%87%20%E9%A1%B5%E9%9D%A2"');
  });

  test('a # inside words, URLs and headings is not a tag', () => {
    expect(render('a#b https://example.com/x#frag')).not.toContain('logseq-tag');
    expect(render('# Heading')).toBe('<h1 id="heading">Heading</h1>');
  });

  test('tags are highlighted but their href is not', () => {
    expect(render('#copilot', 'copilot')).toBe(
      '<p><a class="logseq-tag" href="logseq://graph/g?page=copilot">#<mark>copilot</mark></a></p>',
    );
  });

  test('block refs show the referenced text, or a short label', () => {
    const block = { content: `see ((${REF}))`, refTitles: { [REF]: 'The <target>' } } as any;
    expect(renderBlock(block, 'g').html).toBe(
      `<p>see <a class="logseq-block-ref" href="logseq://graph/g?block-id=${REF}">The &#60;target&#62;</a></p>`,
    );
    expect(render(`see ((${REF}))`)).toBe(
      `<p>see <a class="logseq-block-ref" href="logseq://graph/g?block-id=${REF}">block</a></p>`,
    );
  });

  test('local asset images become a label, other images stay', () => {
    expect(render('![shot.png](../assets/shot_1.png)')).toBe(
      '<p><span class="logseq-asset" title="../assets/shot_1.png">shot.png</span></p>',
    );
    expect(render('![](../assets/a/b.png)')).toContain('>b.png</span>');
    expect(render('![d](data:image/png;base64,AAAA)')).toBe(
      '<p><img src="data:image/png;base64,AAAA" alt="d"></p>',
    );
  });

  test('image alt text and raw HTML are not highlighted', () => {
    expect(render('![foo](https://x.test/foo.png)', 'foo')).toBe(
      '<p><img src="https://x.test/foo.png" alt="foo"></p>',
    );
    expect(render('<span class="foo">x</span>', 'foo')).not.toContain('<mark>');
  });

  test('properties are hidden, the rest of the block stays', () => {
    expect(render('title\ntype:: article\nsource:: x')).toBe('<p>title</p>');
  });
});

describe('block refs', () => {
  const A = '65f0c0de-0000-4000-8000-00000000000a';
  const B = '65f0c0de-0000-4000-8000-00000000000b';

  test('blockRefUuids lists each referenced uuid once', () => {
    expect(blockRefUuids(`((${A})) x ((${B})) ((${A}))`)).toEqual([A, B]);
    expect(blockRefUuids('no refs (( here ))')).toEqual([]);
  });

  test('blockRefTitle is the first readable line of the block', () => {
    expect(blockRefTitle({ content: 'TODO first\nsecond', marker: 'TODO' } as any)).toBe('first');
    expect(blockRefTitle({ content: 'id:: x\nbody' } as any)).toBe('body');
    expect(blockRefTitle({ content: 'x'.repeat(200) } as any)).toHaveLength(120);
    expect(blockRefTitle(null)).toBe('');
  });

  test('resolveBlockRefs reads every ref and skips unreadable ones', async () => {
    const getBlock = vi.fn(async (uuid: string) => {
      if (uuid === B) throw new Error('gone');
      return { content: 'target text' };
    });
    const block = await resolveBlockRefs(
      { content: `((${A})) ((${B}))` } as LogseqBlockType,
      getBlock,
    );
    expect(getBlock).toHaveBeenCalledTimes(2);
    expect(block.refTitles).toEqual({ [A]: 'target text' });
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
