import { describe, expect, it } from 'vitest';
import {
  blockRending,
  buildTurndownService,
  escapeForLogseq,
  logseqEscape,
} from './utils';
import { DEFAULT_TEMPLATE_CONTENT, TASK_TEMPLATE_CONTENT } from './default-templates';

const block = (text: string) => escapeForLogseq(text, { context: 'block' });
const label = (text: string) => escapeForLogseq(text, { context: 'linkText' });
const dest = (text: string) => escapeForLogseq(text, { context: 'linkDest' });

const turndown = (html: string) => {
  const container = document.createElement('div');
  container.innerHTML = html;
  return buildTurndownService().turndown(container);
};

describe('escapeForLogseq, block', () => {
  it.each([
    ['a tag', 'before #tag after', 'before \\#tag after'],
    ['a tag at the start', '#tag', '\\#tag'],
    ['a tag with a slash', 'see #a/b', 'see \\#a/b'],
    ['a tag in a bracket', 'x [#tag] y', 'x [\\#tag] y'],
    ['a priority', 'x [#A] y', 'x [\\#A] y'],
    ['a tag after a comma', 'x,#tag', 'x,\\#tag'],
    ['a hash in a word', 'a#b', 'a\\#b'],
    ['a multi word tag', 'x #[[multi word]] y', 'x \\#\\[[multi word]] y'],
    ['a page link', 'a [[page]] b', 'a \\[[page]] b'],
    ['a block reference', 'a ((6afa8ae4-5fa6-4f63-beb5-9382491a364d)) b', 'a \\((6afa8ae4-5fa6-4f63-beb5-9382491a364d)) b'],
    ['a macro', 'a {{macro x}} b', 'a \\{{macro x}} b'],
    ['an embed', '{{embed [[x]]}}', '\\{{embed \\[[x]]}}'],
    ['three brackets', '[[[a]]]', '\\[\\[[a]]]'],
    ['three parentheses', '(((a)))', '\\(\\((a)))'],
    ['a property', 'key:: value', 'key:\\: value'],
    ['a property on the second line', 'one\nkey:: value', 'one\nkey:\\: value'],
    ['an indented property', 'one\n  key:: value', 'one\n  key:\\: value'],
    ['a property without a value', 'key::', 'key:\\:'],
    ['an id property', 'one\nid:: 6f1c0000-0000-4000-8000-000000000001', 'one\nid:\\: 6f1c0000-0000-4000-8000-000000000001'],
    ['a bullet', 'one\n- two', 'one\n\\- two'],
    ['an indented bullet', 'one\n  - two', 'one\n  \\- two'],
    ['a bullet at the start', '- one', '\\- one'],
    ['an empty bullet', 'one\n-', 'one\n\\-'],
    ['a heading', 'one\n# two', 'one\n\\# two'],
    ['a query', 'one\n#+BEGIN_QUERY\nx\n#+END_QUERY', 'one\n\\#+BEGIN_QUERY\nx\n\\#+END_QUERY'],
    ['a scheduled date', 'one\nSCHEDULED: <2030-01-01 Tue>', 'one\n\\SCHEDULED: <2030-01-01 Tue>'],
    ['a deadline', 'one\nDEADLINE: <2030-01-01 Tue>', 'one\n\\DEADLINE: <2030-01-01 Tue>'],
    ['a scheduled date in a line', 'one SCHEDULED: <2030-01-01 Tue> two', 'one \\SCHEDULED: <2030-01-01 Tue> two'],
    ['a closed date', 'one\nCLOSED: [2030-01-01 Tue 10:00]', 'one\n\\CLOSED: [2030-01-01 Tue 10:00]'],
    ['a drawer', 'one\n:LOGBOOK:\nCLOCK: [2030-01-01 Tue 10:00:00]\n:END:', 'one\n\\:LOGBOOK:\n\\CLOCK: [2030-01-01 Tue 10:00:00]\n\\:END:'],
    ['a property drawer', 'one\n:PROPERTIES:\n:id: abc\n:END:', 'one\n\\:PROPERTIES:\n\\:id: abc\n\\:END:'],
    ['an iframe', 'one <iframe src="https://example.com"></iframe>', 'one \\<iframe src="https://example.com">\\</iframe>'],
    ['a comment', 'a <!-- x --> b', 'a \\<!-- x --> b'],
    ['an html macro', '@@html: x@@', '\\@@html: x@@'],
  ])('escapes %s', (_name, input, expected) => {
    expect(block(input)).toBe(expected);
  });

  it.each(['TODO', 'DOING', 'LATER', 'NOW', 'DONE', 'CANCELED', 'CANCELLED', 'WAITING', 'WAIT', 'IN-PROGRESS'])(
    'escapes the %s marker at the start of the text',
    (marker) => {
      expect(block(`${marker} do it`)).toBe(`\\${marker} do it`);
      expect(block(`  ${marker} do it`)).toBe(`  \\${marker} do it`);
      expect(block(marker)).toBe(`\\${marker}`);
    },
  );

  it('leaves a marker on a later line alone, a block starts with its first line', () => {
    expect(block('one\nTODO two')).toBe('one\nTODO two');
  });

  it('leaves text that is not a marker alone', () => {
    expect(block('TODOS today')).toBe('TODOS today');
    expect(block('todo later')).toBe('todo later');
    expect(block('TODO\tx')).toBe('TODO\tx');
  });

  it('leaves code spans alone', () => {
    expect(block('a `#tag [[x]] {{y}} ((z))` b')).toBe('a `#tag [[x]] {{y}} ((z))` b');
    expect(block('a ``#tag ` [[x]]`` b #t')).toBe('a ``#tag ` [[x]]`` b \\#t');
  });

  it('escapes a backtick that has no closing one and what follows it', () => {
    expect(block('a ` b #tag')).toBe('a ` b \\#tag');
  });

  it('leaves fenced code alone, also lines that look like blocks and properties', () => {
    const fenced = 'one #a\n```js\n#tag [[x]] TODO\nkey:: v\n- dash\n```\ntwo #b';
    expect(block(fenced)).toBe('one \\#a\n```js\n#tag [[x]] TODO\nkey:: v\n- dash\n```\ntwo \\#b');
    expect(block('~~~\n#tag\n~~~')).toBe('~~~\n#tag\n~~~');
    // Logseq closes a fence at the first line with a fence mark, whatever its
    // length: the text after the inner mark is not code, see the fences below.
    expect(block('````\n#tag\n````')).toBe('````\n#tag\n````');
    expect(block('````\n```\n#tag\n```\n````')).toBe('````\n```\n\\#tag\n```\n````');
  });

  it('escapes the lines of a fence that never closes', () => {
    expect(block('```\n#tag')).toBe('```\n\\#tag');
  });

  it('keeps links and images, escapes their labels, leaves their URLs alone', () => {
    expect(block('see [a](https://example.com/p#frag) here')).toBe('see [a](https://example.com/p#frag) here');
    expect(block('![i](https://example.com/a.png#b)')).toBe('![i](https://example.com/a.png#b)');
    expect(block('[a #tag b](https://example.com/)')).toBe('[a \\#tag b](https://example.com/)');
    expect(block('![alt #tag [[p]]](https://example.com/a.png)')).toBe('![alt \\#tag \\[[p]]](https://example.com/a.png)');
    expect(block('[a](https://example.com/?q=[[a]]&r={{b}}&s=((c)))')).toBe('[a](https://example.com/?q=[[a]]&r={{b}}&s=((c)))');
    expect(block('[a](https://en.wikipedia.org/wiki/Foo_(bar)) #t')).toBe('[a](https://en.wikipedia.org/wiki/Foo_(bar)) \\#t');
  });

  it('escapes what follows a link', () => {
    expect(block('[a](https://example.com) #tag [[x]]')).toBe('[a](https://example.com) \\#tag \\[[x]]');
  });

  it('does not escape what turndown has already escaped', () => {
    expect(block('\\- one')).toBe('\\- one');
    expect(block('\\# one')).toBe('\\# one');
    expect(block('\\## one')).toBe('\\## one');
    expect(block('a \\#tag')).toBe('a \\#tag');
    expect(block('1\\. one')).toBe('1\\. one');
    expect(block('a \\*b\\* c_d \\_e')).toBe('a \\*b\\* c_d \\_e');
    expect(block('\\[[a]]')).toBe('\\[[a]]');
  });

  it('escapes what follows an escaped backslash', () => {
    expect(block('a \\\\#tag')).toBe('a \\\\\\#tag');
    expect(block('\\\\[[x]]')).toBe('\\\\\\[[x]]');
  });

  it('writes the page text [[x]] that turndown made as a literal text', () => {
    // turndown: `[[x]]` -> `\[\[x\]\]`, and `\[ ... \]` is a formula in Logseq.
    expect(block('\\[\\[page\\]\\]')).toBe('\\[\\[page]]');
    expect(block('#\\[\\[multi word\\]\\] x')).toBe('\\#\\[\\[multi word]] x');
    // one pair per `[[`
    expect(block('\\[\\[a\\]\\] and \\[\\[b\\]\\]')).toBe('\\[\\[a]] and \\[\\[b]]');
  });

  // turndown writes every `[` and `]` of the page text with a backslash, and
  // Logseq reads `\[ ... \]` as a LaTeX formula. The `\[` stays (it keeps
  // `[a](b)`, `[^1]` and `[:b]` plain), the `\]` goes.
  it('keeps square brackets of the page text from being a formula', () => {
    expect(block('Foo\\[1\\]')).toBe('Foo\\[1]');
    expect(block('see \\[note\\] here')).toBe('see \\[note] here');
    expect(block('arr\\[0\\]')).toBe('arr\\[0]');
    expect(block('\\[1\\]\\[2\\]')).toBe('\\[1]\\[2]');
    expect(block('\\[^1\\] and \\[:b\\]')).toBe('\\[^1] and \\[:b]');
  });

  it('keeps [a](b) from being a link', () => {
    expect(block('\\[a\\](b)')).toBe('\\[a](b)');
  });

  it('keeps [ ] and [x] from being a checkbox or task', () => {
    expect(block('\\[ \\] todo')).toBe('\\[ ] todo');
    expect(block('\\[x\\] done')).toBe('\\[x] done');
    expect(block('a\n\\[ \\] b\n\\[x\\] c')).toBe('a\n\\[ ] b\n\\[x] c');
  });

  it('keeps [#A] a tag-free text', () => {
    expect(block('\\[#A\\] priority')).toBe('\\[\\#A] priority');
  });

  it('keeps the brackets next to [[ and ]] inert', () => {
    expect(block('\\[\\[page\\]\\] and \\[x\\]')).toBe('\\[\\[page]] and \\[x]');
    expect(block('\\[1\\]\\[\\[b\\]\\]')).toBe('\\[1]\\[\\[b]]');
    expect(block('\\[\\[x\\]')).toBe('\\[\\[x]');
  });

  it('keeps a property line with brackets from being a property', () => {
    expect(block('\\[x\\]:: y')).toBe('\\[x]:\\: y');
  });

  it('writes a literal \\[x\\] of the page text without a formula', () => {
    // page text `\[x\]`: turndown `\\\[x\\\]`; the brackets lose their backslash.
    expect(block('a \\\\\\[x\\\\\\] b')).toBe('a \\\\[x\\\\] b');
    // and a link needs the `(` escaped then
    expect(block('a \\\\\\[a\\\\\\](b)')).toBe('a \\\\[a\\\\]\\(b)');
    // `[[` next to it stays inert
    expect(block('a \\\\\\[x\\\\\\] and \\[\\[y\\]\\]')).toBe('a \\\\[x\\\\] and [\\[y]]');
  });

  it('keeps square brackets in code and links as they are', () => {
    expect(block('`a\\[0\\]` and `x`')).toBe('`a\\[0\\]` and `x`');
    expect(block('```\na\\[0\\]\n```')).toBe('```\na\\[0\\]\n```');
    expect(block('[a \\[1\\]](https://e.com/x)')).toBe('[a \\[1\\]](https://e.com/x)');
    expect(label('Foo [1]')).toBe('Foo \\[1\\]');
  });

  it('keeps what is not special', () => {
    for (const text of [
      '',
      'plain text',
      'a # b',
      'C# is',
      'a < b and c > d',
      'x **bold** and *it* and [link](https://example.com) and ![i](https://e.com/a.png)',
      '*   one\n*   two\n    *   nested',
      'one\n\n    code line',
      'costs $5 and $6',
      'a {% if %} b %}',
      'key: value',
      'Key Name:: value',
      'key::value',
      '> quote',
      '1. one\n2. two',
      'SCHEDULED: soon',
      ':smile',
      '  indented',
      '\\*not bold\\*',
    ]) {
      expect(block(text)).toBe(text);
    }
  });

  it('matches the old escape for the three pairs', () => {
    for (const text of ['[[a]]', '((a))', '{{a}}', 'x [[a]] y ((b)) {{c}}']) {
      expect(block(text)).toBe(logseqEscape(text));
    }
  });

  it('escapes the text turndown makes from a page', () => {
    const markdown = turndown(
      '<p>Read <a href="https://example.com/a#b">this</a> #news and [[page]] and ((6afa8ae4-5fa6-4f63-beb5-9382491a364d)) and {{embed [[x]]}}</p>' +
        '<pre><code>#tag [[x]]\nkey:: v</code></pre>',
    );
    expect(block(markdown)).toBe(
      'Read [this](https://example.com/a#b) \\#news and \\[\\[page]] and \\((6afa8ae4-5fa6-4f63-beb5-9382491a364d)) and \\{{embed \\[\\[x]]}}\n\n' +
        '```\n#tag [[x]]\nkey:: v\n```',
    );
  });

  it('escapes the lines of a paragraph that turndown breaks with <br>', () => {
    const markdown = turndown(
      '<p>TODO call<br>key:: value<br>- not a list<br>SCHEDULED: &lt;2030-01-01 Tue&gt;</p>',
    );
    expect(block(markdown)).toBe(
      '\\TODO call\n\nkey:\\: value\n\n\\- not a list\n\n\\SCHEDULED: <2030-01-01 Tue>',
    );
  });
});

describe('escapeForLogseq, linkText', () => {
  it('escapes brackets, backslashes, backticks and what makes a tag or a link', () => {
    expect(label('Foo [beta] #release')).toBe('Foo \\[beta\\] \\#release');
    expect(label('a [[page]] ((b)) {{c}}')).toBe('a \\[\\[page\\]\\] \\((b)) \\{{c}}');
    expect(label('end\\')).toBe('end\\\\');
    expect(label('use `git` now')).toBe('use \\`git\\` now');
    expect(label('List<String> and <b>x</b>')).toBe('List\\<String> and \\<b>x\\</b>');
    expect(label('a](https://evil.example) b')).toBe('a\\](https://evil.example) b');
  });

  it('leaves what only matters at the start of a line, a label never starts one', () => {
    expect(label('TODO fix')).toBe('TODO fix');
    expect(label('key:: value')).toBe('key:: value');
    expect(label('- one')).toBe('- one');
    expect(label('# one')).toBe('# one');
  });

  it('joins the lines of a title', () => {
    expect(label('one\n  two\r\nthree')).toBe('one two three');
  });

  it('keeps a plain title', () => {
    for (const text of ['', 'Plain title', 'Foo - Bar | Baz', "It's 5 < 6 & 7 > 3", 'C# in 2026', '日本語 タイトル']) {
      expect(label(text)).toBe(text);
    }
  });
});

describe('escapeForLogseq, linkDest', () => {
  it.each([
    ['a plain URL', 'https://example.com/a/b', 'https://example.com/a/b'],
    ['a query and a fragment', 'https://example.com/p?q=1&r=2#frag', 'https://example.com/p?q=1&r=2#frag'],
    ['a Wikipedia URL', 'https://en.wikipedia.org/wiki/Foo_(bar)', 'https://en.wikipedia.org/wiki/Foo_(bar)'],
    ['balanced parentheses', 'https://example.com/a(b(c))d', 'https://example.com/a(b(c))d'],
    ['an unbalanced closing parenthesis', 'https://example.com/a)b', 'https://example.com/a\\)b'],
    ['a closing before an opening parenthesis', 'https://example.com/)(', 'https://example.com/\\)%28'],
    ['an unbalanced opening parenthesis', 'https://example.com/a(b', 'https://example.com/a%28b'],
    ['an unbalanced opening parenthesis in the middle', 'https://example.com/a(b/c', 'https://example.com/a%28b/c'],
    ['an unbalanced opening parenthesis after a pair', 'https://example.com/a(b)c(d', 'https://example.com/a(b)c%28d'],
    ['a pair that an opening parenthesis encloses', 'https://example.com/(a(b)', 'https://example.com/%28a(b)'],
    ['an unbalanced opening parenthesis in the query', 'https://example.com/a?q=(b', 'https://example.com/a?q=%28b'],
    ['an unbalanced opening parenthesis in the fragment', 'https://example.com/a#(b', 'https://example.com/a#%28b'],
    ['an unbalanced opening parenthesis at the end', 'https://example.com/a(', 'https://example.com/a%28'],
    ['an opening parenthesis that a later one in the query closes', 'https://example.com/a(b?q=c)', 'https://example.com/a(b?q=c)'],
    ['brackets', 'https://example.com/a[b]c', 'https://example.com/a[b]c'],
    ['brackets, braces and at signs in the path', 'https://example.com/a[b]c{d}e@f', 'https://example.com/a[b]c{d}e@f'],
    ['brackets, braces and at signs in the query', 'https://example.com/?a=[b]&c={d}&e=@f@@g', 'https://example.com/?a=[b]&c={d}&e=@f@@g'],
    ['brackets, braces and at signs in the fragment', 'https://example.com/#[[a]]{{b}}@@c', 'https://example.com/#[[a]]{{b}}@@c'],
    ['a macro with a space', 'https://example.com/x {{embed [[p]]}}', 'https://example.com/x%20{{embed%20[[p]]}}'],
    ['a tag after a space', 'https://example.com/x #tag', 'https://example.com/x%20#tag'],
    ['a title', 'https://example.com/x "t #tag"', 'https://example.com/x%20"t%20#tag"'],
    ['a tab and a carriage return', 'https://example.com/a\tb\rc', 'https://example.com/a%09b%0Dc'],
    ['a next line and a line separator', 'https://example.com/a\u0085b\u2028c', 'https://example.com/a%C2%85b%E2%80%A8c'],
    ['a control character', 'https://example.com/a\u0000b\u001fc\u007fd', 'https://example.com/a%00b%1Fc%7Fd'],
    ['an empty string', '', ''],
    ['non-ASCII', 'https://example.com/日本語/ü', 'https://example.com/日本語/ü'],
    ['a space', 'https://example.com/a b', 'https://example.com/a%20b'],
    ['angle brackets', 'https://example.com/a<b>c', 'https://example.com/a%3Cb%3Ec'],
    ['a backtick', 'https://example.com/a`b', 'https://example.com/a%60b'],
    ['a backslash', 'https://example.com/a\\b', 'https://example.com/a%5Cb'],
    ['a new line', 'https://example.com/a\nb', 'https://example.com/a%0Ab'],
    ['spaces around', '  https://example.com/a  ', 'https://example.com/a'],
    ['brackets and braces in the query', 'https://example.com/?q=[[a]]&r={{b}}&s=((c))', 'https://example.com/?q=[[a]]&r={{b}}&s=((c))'],
  ])('writes %s', (_name, input, expected) => {
    expect(dest(input)).toBe(expected);
  });

  it('keeps the text that recall searches for', () => {
    for (const href of [
      'https://en.wikipedia.org/wiki/Foo_(bar)',
      'https://example.com/a[b]c/d',
      'https://example.com/%E6%97%A5/x?y=1#z',
    ]) {
      const url = new URL(href);
      expect(dest(url.href)).toContain(url.host + url.pathname);
    }
  });
});

describe('escapeForLogseq, block, link destinations', () => {
  // `[a](x y)` is no link for Logseq (probed on 0.10.15 and 2.0.2): `a` shows as
  // a page link and the rest as text. The whole text is escaped then.
  it.each([
    ['a macro', '[a](x {{embed [[p]]}})', '\\[a](x \\{{embed \\[[p]]}})'],
    ['a tag', '[a](x #tag)', '\\[a](x \\#tag)'],
    ['a page link after an angle bracket', '[a](<x> [[p]])', '\\[a](\\<x> \\[[p]])'],
    ['a block reference', '[a](x ((6afa8ae4-5fa6-4f63-beb5-9382491a364d)))', '\\[a](x \\((6afa8ae4-5fa6-4f63-beb5-9382491a364d)))'],
    ['a title with a tag', '[a](https://e.com/a "t #tag")', '\\[a](https://e.com/a "t \\#tag")'],
    ['a scheduled date', '[a](https://e.com/a SCHEDULED: <2030-01-01 Tue>)', '\\[a](https://e.com/a \\SCHEDULED: <2030-01-01 Tue>)'],
    ['a backtick', '[a](https://e.com/a`x`) #t', '\\[a](https://e.com/a`x`) \\#t'],
    ['a tab', '[a](https://e.com/a\t[[p]])', '\\[a](https://e.com/a\t\\[[p]])'],
    ['a line separator', '[a](https://e.com/a\u2028[[p]])', '\\[a](https://e.com/a\u2028\\[[p]])'],
    ['a next line', '[a](https://e.com/a\u0085[[p]])', '\\[a](https://e.com/a\u0085\\[[p]])'],
    ['a carriage return', '[a](https://e.com/a\r[[p]])', '\\[a](https://e.com/a\r\\[[p]])'],
    ['a label with a tag', '[a #t](x y) #u', '\\[a \\#t](x y) \\#u'],
    ['a nested label', 'x [a [b]](x y) z', 'x \\[a [b]](x y) z'],
    ['an image with a macro', '![a](x {{embed [[p]]}})', '!\\[a](x \\{{embed \\[[p]]}})'],
    ['an image with a tag', '![a](x #tag)', '!\\[a](x \\#tag)'],
    ['an image with an angle bracket', '![a](<x> [[p]])', '!\\[a](\\<x> \\[[p]])'],
    ['an image with a space', '![a](https://e.com/a.png [[p]])', '!\\[a](https://e.com/a.png \\[[p]])'],
  ])('escapes the text of a link with %s', (_name, input, expected) => {
    expect(block(input)).toBe(expected);
  });

  it('escapes the next line of a destination with a new line', () => {
    // each line is its own text: the first has no `)` and is no link
    expect(block('[a](https://e.com/a\n[[p]]) end')).toBe('[a](https://e.com/a\n\\[[p]]) end');
    expect(block('[a](x\n{{embed [[p]]}})')).toBe('[a](x\n\\{{embed \\[[p]]}})');
    expect(block('![a](x\n#tag)')).toBe('![a](x\n\\#tag)');
  });

  it('escapes a link that has an unpaired parenthesis as text', () => {
    expect(block('[a](https://e.com/a(b) #t')).toBe('[a](https://e.com/a(b) \\#t');
    expect(block('[a](https://e.com/a(b(c) [[p]]')).toBe('[a](https://e.com/a(b(c) \\[[p]]');
  });

  it('keeps a destination that is one piece, with the syntax a URL has', () => {
    for (const text of [
      '[a](https://e.com/?q=[[b]]&r={{c}}&s=((d))#[[e]])',
      '[a](https://e.com/a{{b}}c@@html:x@@d)',
      '[a](https://e.com/a[1]b]]c)',
      '[a](https://e.com/a\\)z)',
      '![a](https://e.com/a.png?x=[[b]]#{{c}})',
      '![a](data:image/png;base64,iVBORw0KGgo+/=)',
      '[a](mailto:me@example.com)',
      '[url](url)',
    ]) {
      expect(block(text)).toBe(text);
    }
  });

  it('writes a link that the destination makes safe as it was', () => {
    // turndown writes the URL with `linkDest`, so it has no space or `<`
    const url = escapeForLogseq('https://e.com/a b {{embed [[p]]}} #t\n[[q]]', { context: 'linkDest' });
    expect(url).toBe('https://e.com/a%20b%20{{embed%20[[p]]}}%20#t%0A[[q]]');
    expect(block(`[a](${url}) and ![b](${url})`)).toBe(`[a](${url}) and ![b](${url})`);
  });
});

describe('buildTurndownService, link destinations', () => {
  it('writes the URL of a link as one destination', () => {
    const md = turndown(
      '<p><a href="https://e.com/a b {{embed [[p]]}} #t">one</a> and <a href="https://e.com/x\n[[q]]">two</a></p>',
    );
    expect(md).toBe(
      '[one](https://e.com/a%20b%20{{embed%20[[p]]}}%20#t) and [two](https://e.com/x%0A[[q]])',
    );
    expect(block(md)).toBe(md);
  });

  it('writes the URL of an image as one destination', () => {
    const md = turndown('<p><img alt="i" src="https://e.com/a b.png#{{x}}"></p>');
    expect(md.trim()).toBe('![i](https://e.com/a%20b.png#{{x}})');
    expect(block(md)).toBe(md);
  });

  it('writes hostile destinations that need no escape of their own', () => {
    for (const href of [
      'https://e.com/x {{embed [[p]]}}',
      'https://e.com/x #tag',
      'https://e.com/x <b>[[p]]</b>',
      'https://e.com/x\n[[p]]',
      'https://e.com/x`[[p]]`',
      'https://e.com/a(b',
      'https://e.com/a)b',
    ]) {
      const md = turndown(`<p><a href="${href.replace(/\n/g, '&#10;')}">t</a> <img src="${href.replace(/\n/g, '&#10;')}" alt="i"></p>`);
      expect(block(md), href).toBe(md);
      expect(md.split('\n').length, href).toBe(1);
    }
  });

  it('keeps an ordinary link', () => {
    expect(turndown('<p><a href="https://example.com/p?q=1#f">a</a> <a href="https://en.wikipedia.org/wiki/Foo_(bar)">b</a></p>')).toBe(
      '[a](https://example.com/p?q=1#f) [b](https://en.wikipedia.org/wiki/Foo_(bar))',
    );
  });
});

describe('escapeForLogseq, block, ordinary links and text stay as they were', () => {
  // The output of the escaper at 362699b for text that has no hostile link.
  it.each([
    ['plain text with no markup', 'plain text with no markup'],
    ['see [a](https://example.com/p#frag) here', 'see [a](https://example.com/p#frag) here'],
    ['[a](https://example.com/?q=1&r=2#frag) and [b](https://example.com/a/b/c.html)', '[a](https://example.com/?q=1&r=2#frag) and [b](https://example.com/a/b/c.html)'],
    ['[Foo](https://en.wikipedia.org/wiki/Foo_(bar)) and [Baz](https://example.com/a(b(c))d)', '[Foo](https://en.wikipedia.org/wiki/Foo_(bar)) and [Baz](https://example.com/a(b(c))d)'],
    ['![i](https://example.com/a.png) and ![j](https://example.com/img/b.png?x=1#y)', '![i](https://example.com/a.png) and ![j](https://example.com/img/b.png?x=1#y)'],
    ['[a](https://example.com/?q=[[a]]&r={{b}}&s=((c))) #tag', '[a](https://example.com/?q=[[a]]&r={{b}}&s=((c))) \\#tag'],
    ['[a](https://example.com/a\\)b) and [c](https://e.com/日本語/ü)', '[a](https://example.com/a\\)b) and [c](https://e.com/日本語/ü)'],
    ['[a #tag b](https://example.com/) and [x [1]](https://e.com/x)', '[a \\#tag b](https://example.com/) and [x [1]](https://e.com/x)'],
    ['[url](url)', '[url](url)'],
    ['[a](mailto:me@example.com) and [b](ftp://example.com/f)', '[a](mailto:me@example.com) and [b](ftp://example.com/f)'],
    ['[a](https://example.com/x%20y?z=%7B%7D) text #t', '[a](https://example.com/x%20y?z=%7B%7D) text \\#t'],
    ['before\n[a](https://example.com/a)\nafter [[page]]', 'before\n[a](https://example.com/a)\nafter \\[[page]]'],
    ['[a](https://example.com/a)[b](https://example.com/b) and **bold** *it*', '[a](https://example.com/a)[b](https://example.com/b) and **bold** *it*'],
    ['*   [a](https://example.com/a)\n*   [b](https://example.com/b)', '*   [a](https://example.com/a)\n*   [b](https://example.com/b)'],
    ['TODO [a](https://example.com/a)', '\\TODO [a](https://example.com/a)'],
    ['x [a](https://example.com/a?b=c#d) y {{z}} ((u))', 'x [a](https://example.com/a?b=c#d) y \\{{z}} \\((u))'],
  ])('writes %j as it was', (input, expected) => {
    expect(block(input)).toBe(expected);
  });
});

describe('blockRending with page text', () => {
  const render = (
    clipNoteTemplate: string,
    page: { url?: string; title?: string; data: string },
  ) =>
    blockRending({
      ...page,
      clipNoteTemplate,
      preferredDateFormat: 'MMM do, yyyy',
      time: new Date('2026-11-16T10:30:00'),
    });

  it('keeps the tags of the template and escapes the tags of the page', () => {
    expect(
      render(DEFAULT_TEMPLATE_CONTENT, {
        url: 'https://example.com/a',
        title: 'Big #news',
        data: '#tag [[x]] TODO',
      }),
    ).toBe('#[[Clip]] [Big \\#news](https://example.com/a)\n\\#tag \\[[x]] TODO');
  });

  it('keeps the marker of the template and escapes the one of the page', () => {
    expect(
      render(TASK_TEMPLATE_CONTENT, {
        url: 'https://example.com/a',
        title: 'TODO fix',
        data: 'TODO one',
      }),
    ).toBe('TODO [TODO fix](https://example.com/a)\n\\TODO one');
  });

  it('escapes a title that is not in a link like the start of a block', () => {
    expect(
      render('{{title}}\n{{url}}\n{{content}}', {
        url: 'https://example.com/a#b',
        title: 'TODO [fix] #now',
        data: 'x',
      }),
    ).toBe('\\TODO [fix] \\#now\nhttps://example.com/a\\#b\nx');
    expect(render('Source: {{title | upcase}}', { title: 'key:: v', data: '' })).toBe(
      'Source: KEY:\\: V',
    );
    expect(render('- {{title}}', { title: '- a', data: '' })).toBe('- \\- a');
    // one place in a label, one outside
    expect(render('[{{title}}]({{url}}) {{title}}', { title: '#a', url: 'u', data: '' })).toBe(
      '[\\#a](u) \\#a',
    );
  });

  it('does not escape the date, the time and the template text', () => {
    expect(
      render('#[[Clip]] TODO {{date}} {{dt | date: "%Y"}} {{time}} [[{{date}}]] key:: v\n{{content}}', {
        data: 'x',
      }),
    ).toBe('#[[Clip]] TODO Nov 16th, 2026 2026 10:30 [[Nov 16th, 2026]] key:: v\nx');
  });

  it('writes the page values as they are, with nothing special in them', () => {
    expect(
      render(DEFAULT_TEMPLATE_CONTENT, {
        url: 'https://example.com/a/b?c=d#e',
        title: 'Plain title',
        data: 'Some *text*\n\n*   one\n*   two',
      }),
    ).toBe(
      '#[[Clip]] [Plain title](https://example.com/a/b?c=d#e)\nSome *text*\n\n*   one\n*   two',
    );
  });

  it('writes Liquid syntax in the page values as text', () => {
    expect(
      render(DEFAULT_TEMPLATE_CONTENT, {
        url: 'https://example.com/{{date}}',
        title: '{{ date }} {% if x %}',
        data: '{{ date }} {% assign a = 1 %} {{ content }} {%endif%} %}',
      }),
    ).toBe(
      '#[[Clip]] [\\{{ date }} {% if x %}](https://example.com/{{date}})\n' +
        '\\{{ date }} {% assign a = 1 %} \\{{ content }} {%endif%} %}',
    );
  });

  it('writes a hostile URL in the link as one destination', () => {
    expect(
      render(DEFAULT_TEMPLATE_CONTENT, {
        url: 'https://example.com/x {{embed [[p]]}} #t\n(a',
        title: 'Title',
        data: 'x',
      }),
    ).toBe('#[[Clip]] [Title](https://example.com/x%20{{embed%20[[p]]}}%20#t%0A%28a)\nx');
  });

  it('leaves out a missing title and URL', () => {
    expect(render('[{{title}}]({{url}}) {{content}}', { data: 'x' })).toBe('[]() x');
  });
});

// What Logseq 0.10.15 (file graph) and 2.0.2 (DB graph) read as a fence, probed
// with page-creating text in the lines of each form, see the comment of
// escapeForLogseq. `RAW` stays as it is in a code block, `ESC` is `RAW` as text.
const RAW = '#tag [[x]] {{embed [[p]]}}\nkey:: v\nTODO x';
const ESC = '\\#tag \\[[x]] \\{{embed \\[[p]]}}\nkey:\\: v\nTODO x';

describe('escapeForLogseq, fences', () => {
  it.each([
    ['backticks', '```', '```'],
    ['tildes', '~~~', '~~~'],
    ['one space in front', ' ```', '```'],
    ['three spaces in front', '   ```', '   ```'],
    ['an info string', '```js', '```'],
    ['an info string with a plus', '```c++', '```'],
    ['an info string with a hash', '```c#', '```'],
    ['an info string on tildes', '~~~python', '~~~'],
    ['four backticks', '````', '````'],
    ['a longer mark to close', '```', '``````'],
    ['a trailing space on the mark', '``` ', '``` '],
  ])('leaves the lines of a fence with %s alone', (_name, open, close) => {
    const text = `intro\n${open}\n${RAW}\n${close}\noutro`;
    expect(block(text)).toBe(text);
  });

  // Logseq ends a fence at the first line that starts with three backticks or
  // three tildes: the other char, a shorter or longer mark, any indent, any
  // text after the mark. The lines after it are text.
  it.each([
    ['tildes in backticks', '```', '~~~'],
    ['backticks in tildes', '~~~', '```'],
    ['a shorter mark', '````', '```'],
    ['a shorter tilde mark', '~~~~', '~~~'],
    ['a longer mark', '```', '`````'],
    ['four spaces', '```', '    ```'],
    ['a tab', '```', '\t```'],
    ['one space', '```', ' ```'],
    ['two spaces and tildes', '```', '  ~~~'],
    ['an info string', '```', '```js'],
    ['text without a space', '```', '```x'],
  ])('ends a fence at %s', (_name, open, mark) => {
    const text = `intro\n${open}\n${RAW}\n${mark}\n${RAW}\n${open}`;
    expect(block(text)).toBe(`intro\n${open}\n${RAW}\n${mark}\n${ESC}\n${open}`);
  });

  // A mark with text that is not a plain info string (a file graph does not
  // read `key::` as a mark, a DB graph does): nobody knows how the marks pair
  // up from there, so no later line is code and the lines before it are text.
  it('escapes all lines when a mark has more than a plain info string', () => {
    expect(block(`intro\n\`\`\`\n${RAW}\n\`\`\` x\n${RAW}\n\`\`\`\n${RAW}\n\`\`\``)).toBe(
      `intro\n\`\`\`\n${ESC}\n\`\`\` x\n${ESC}\n\`\`\`\n${ESC}\n\`\`\``,
    );
    expect(block('```k::\n#a\n```\n#b\n```\n#c\n```')).toBe(
      '```k:\\:\n\\#a\n```\n\\#b\n```\n\\#c\n```',
    );
  });

  it('pairs the marks the way Logseq does, also those of text', () => {
    // Logseq reads the first and the second mark as one fence, whatever the
    // info string of the first: `#h` is between two fences, it is text.
    expect(block('```[[p]]\nx\n```\n#h\n```js\n#c\n```')).toBe(
      '```\\[[p]]\nx\n```\n\\#h\n```js\n\\#c\n```',
    );
    expect(block('    ```\n#in\n```\n#h\n```js\n#c\n```')).toBe(
      '    ```\n\\#in\n```\n\\#h\n```js\n#c\n```',
    );
    expect(block('```js\n#a\n```\n#h\n```js\n#c\n```\n#t')).toBe(
      '```js\n#a\n```\n\\#h\n```js\n#c\n```\n\\#t',
    );
  });

  it('escapes the lines of a fence in a quote and all marks after it', () => {
    expect(block('> q\n```\nx\n\n```\n#c\n```')).toBe('> q\n```\nx\n\n```\n\\#c\n```');
  });

  it('escapes the text after the mark that ends a fence', () => {
    expect(block('```\ncode\n``` [[x]] #tag {{embed [[p]]}}\nafter')).toBe(
      '```\ncode\n``` \\[[x]] \\#tag \\{{embed \\[[p]]}}\nafter',
    );
  });

  it.each([
    ['a mark of two', '```', '``'],
    ['a mark in a quote', '```', '> ```'],
    ['a mark after text', '```', 'x```'],
    ['a short tilde mark', '~~~', '~~'],
  ])('does not end a fence at %s', (_name, open, line) => {
    const text = `${open}\n${RAW}\n${line}\n${RAW}\n${open}`;
    expect(block(text)).toBe(`${open}\n${RAW}\n${line}\n${RAW}\n${open}`);
  });

  // Not a fence in Logseq, or not one in every graph: the lines are text.
  it.each([
    ['a fence that never closes', '```', null],
    ['tildes that never close', '~~~', null],
    ['four spaces in front', '    ```', '    ```'],
    ['a tab in front', '\t```', '\t```'],
    ['a key:: info string', '```k::', '```'],
    ['a key:: info string on tildes', '~~~k::', '~~~'],
    ['a page link as the info string', '```[[p]]', '```'],
    ['a tag as the info string', '```#tag', '```'],
    ['a macro as the info string', '```{{embed [[p]]}}', '```'],
    ['an info string with a space', '```js k:: v', '```'],
    ['an info string with a drawer', '```:LOGBOOK:', '```'],
    ['a backtick in the info string', '~~~a`b', '~~~'],
    ['a list item', '- ```', '  ```'],
    ['a quote', '> ```', '> ```'],
  ])('escapes the lines after %s', (_name, open, close) => {
    const text = `intro\n${open}\n${RAW}${close === null ? '' : `\n${close}`}`;
    const out = block(text);
    expect(out).toContain(ESC);
    expect(out).not.toContain(RAW);
  });

  it('escapes the info string that is not plain text', () => {
    expect(block('```[[p]] #tag\ncode\n```')).toBe('```\\[[p]] \\#tag\ncode\n```');
    expect(block('```k::\ncode\n```')).toBe('```k:\\:\ncode\n```');
    expect(block('```{{embed [[p]]}}\ncode\n```')).toBe('```\\{{embed \\[[p]]}}\ncode\n```');
  });

  // A quote, a definition and a footnote take the next lines, a fence too.
  it.each([
    ['a quote', '> quote'],
    ['a nested quote', '>> quote'],
    ['a quote and the line after it', '> quote\nlazy'],
    ['a definition', 'term\n: definition'],
    ['a footnote', '[^1]: note'],
    ['a footnote and the line after it', '[^1]: note\nlazy'],
  ])('escapes the lines of a fence right after %s', (_name, before) => {
    for (const mark of ['```', '~~~']) {
      const out = block(`${before}\n${mark}\n${RAW}\n${mark}`);
      expect(out).toContain(ESC);
      expect(out).not.toContain(RAW);
    }
  });

  it('keeps a fence after a blank line, whatever comes before it', () => {
    for (const before of ['> quote', ': definition', '[^1]: note']) {
      const text = `${before}\n\n\`\`\`\n${RAW}\n\`\`\``;
      expect(block(text)).toBe(text);
    }
  });

  it('keeps a fence after the text lines that Logseq reads as text', () => {
    for (const before of [
      'text', '1. item', '* item', '| a | b |', '    indented', '`code`', '$$ x', '<div>', '---',
      'text\\', '![a](https://e.com/a.png)', '[a](https://e.com)',
    ]) {
      const out = block(`${before}\n\`\`\`\n${RAW}\n\`\`\``);
      expect(out.endsWith(`\`\`\`\n${RAW}\n\`\`\``)).toBe(true);
    }
  });

  it('reads the fences one after the other', () => {
    expect(block('```\n#a\n```\n#b\n~~~\n#c\n~~~')).toBe('```\n#a\n```\n\\#b\n~~~\n#c\n~~~');
    expect(block('```\n#a\n```\n```\n#b\n```')).toBe('```\n#a\n```\n```\n#b\n```');
  });

  it('keeps the other lines of the page text escaped around a fence', () => {
    expect(block('one #a\n\n```js\n#c [[x]]\n```\n\ntwo #b\n- x')).toBe(
      'one \\#a\n\n```js\n#c [[x]]\n```\n\ntwo \\#b\n\\- x',
    );
  });
});

describe('escapeForLogseq, fences of turndown', () => {
  const pre = (code: string, lang = '') => {
    const container = document.createElement('div');
    const p = document.createElement('pre');
    const c = document.createElement('code');
    if (lang) c.className = `language-${lang}`;
    c.textContent = code;
    p.appendChild(c);
    container.appendChild(p);
    return block(buildTurndownService().turndown(container));
  };

  it('keeps the code of a <pre> as code', () => {
    expect(pre(RAW)).toBe(`\`\`\`\n${RAW}\n\`\`\``);
    expect(pre(RAW, 'js')).toBe(`\`\`\`js\n${RAW}\n\`\`\``);
    expect(pre(RAW, 'c#')).toBe(`\`\`\`c#\n${RAW}\n\`\`\``);
  });

  it.each([
    ['tildes', '~~~'],
    ['four tildes', '~~~~'],
    ['four spaces and backticks', '    ```'],
    ['a tab and backticks', '\t```'],
    ['two spaces and tildes', '  ~~~'],
  ])('escapes what follows %s in the code of a <pre>', (_name, mark) => {
    // Turndown does not count these marks, Logseq ends the fence at them.
    expect(pre(`${RAW}\n${mark}\n${RAW}`)).toBe(`\`\`\`\n${RAW}\n${mark}\n${ESC}\n\`\`\``);
  });

  it('escapes what follows a fence mark in a fence that turndown made longer', () => {
    // Turndown writes four backticks round a code with a line of three.
    // The mark with a space and text is no plain mark: all is text.
    expect(pre(`${RAW}\n\`\`\` js\n${RAW}`)).toBe(
      `\`\`\`\`\n${ESC}\n\`\`\` js\n${ESC}\n\`\`\`\``,
    );
    expect(pre(`${RAW}\n\`\`\`x\n${RAW}`)).toBe(
      `\`\`\`\`\n${RAW}\n\`\`\`x\n${ESC}\n\`\`\`\``,
    );
    expect(pre(`${RAW}\n\`\`\`\n${RAW}`, 'js')).toBe(
      `\`\`\`\`js\n${RAW}\n\`\`\`\n${ESC}\n\`\`\`\``,
    );
  });

  it('escapes a fence whose language is not plain text', () => {
    expect(pre(RAW, '[[p]]')).toBe(`\`\`\`\\[[p]]\n${ESC}\n\`\`\``);
    expect(pre(RAW, 'k::')).toBe(`\`\`\`k:\\:\n${ESC}\n\`\`\``);
    expect(pre(RAW, '#tag')).toBe(`\`\`\`\\#tag\n${ESC}\n\`\`\``);
    expect(pre(RAW, '{{embed')).toBe(`\`\`\`\\{{embed\n${ESC}\n\`\`\``);
  });

  it('escapes the code of a <pre> in a list item', () => {
    const container = document.createElement('div');
    container.innerHTML = '<ul><li>item<pre><code>#tag [[x]]\nTODO</code></pre></li></ul>';
    expect(block(buildTurndownService().turndown(container))).toBe(
      '*   item\n    \n    ```\n    \\#tag \\[[x]]\n    TODO\n    ```',
    );
  });

  it('writes a <pre> without <code> as text', () => {
    const container = document.createElement('div');
    container.innerHTML = '<pre>#tag [[x]]\n```\n[[y]]</pre>';
    const out = block(buildTurndownService().turndown(container));
    expect(out).not.toMatch(/(^|[^\\])\[\[/);
    expect(out).toContain('\\#tag');
  });
});

describe('escapeForLogseq, image alt text and link labels', () => {
  const img = (alt: string, wrap = false) => {
    const container = document.createElement('div');
    const i = document.createElement('img');
    i.setAttribute('alt', alt);
    i.setAttribute('title', `title ${alt}`);
    i.setAttribute('src', 'https://example.com/a.png');
    if (wrap) {
      const a = document.createElement('a');
      a.setAttribute('href', 'https://example.com/p');
      a.appendChild(i);
      container.appendChild(a);
    } else container.appendChild(i);
    return block(buildTurndownService().turndown(container));
  };

  it.each([
    ['a bracket that ends the label', 'a]b [[x]]', ' ![a\\]b \\[\\[x\\]\\]](https://example.com/a.png)'],
    ['a link after the bracket', 'x](y) [[x]]', ' ![x\\](y) \\[\\[x\\]\\]](https://example.com/a.png)'],
    ['an image after the bracket', '](https://example.com/z) [[x]] #t', ' ![\\](https://example.com/z) \\[\\[x\\]\\] \\#t](https://example.com/a.png)'],
    ['a page link', '[[x]]', ' ![\\[\\[x\\]\\]](https://example.com/a.png)'],
    ['an open bracket', 'a [b [[x]]', ' ![a \\[b \\[\\[x\\]\\]](https://example.com/a.png)'],
    ['a macro', '{{embed [[x]]}}', ' ![\\{{embed \\[\\[x\\]\\]}}](https://example.com/a.png)'],
    ['a tag', 'x #tag', ' ![x \\#tag](https://example.com/a.png)'],
    ['a block reference', 'a]((6afa8ae4-5fa6-4f63-beb5-9382491a364d))', ' ![a\\]\\((6afa8ae4-5fa6-4f63-beb5-9382491a364d))](https://example.com/a.png)'],
    ['a quoted title in a link', 'x](y "[[x]]")', ' ![x\\](y "\\[\\[x\\]\\]")](https://example.com/a.png)'],
    ['a backslash', 'a\\]b', ' ![a\\\\\\]b](https://example.com/a.png)'],
    ['a backtick', 'a`b ]`[[x]]', ' ![a\\`b \\]\\`\\[\\[x\\]\\]](https://example.com/a.png)'],
    ['a scheduled date', 'SCHEDULED: <2030-01-01 Tue>', ' ![\\SCHEDULED: <2030-01-01 Tue>](https://example.com/a.png)'],
  ])('writes the alt text with %s as a label', (_name, alt, expected) => {
    expect(img(alt)).toBe(expected);
  });

  it('joins the lines of an alt text, so no line of it starts a block', () => {
    expect(img('a\n[[x]]')).toBe(' ![a \\[\\[x\\]\\]](https://example.com/a.png)');
    expect(img('a\nkey:: v')).toBe(' ![a key:: v](https://example.com/a.png)');
    expect(img('a\n- dash\r\n\r\n# head\nTODO x')).toBe(
      ' ![a - dash # head TODO x](https://example.com/a.png)',
    );
    expect(img('a\n\n\n[[x]]')).toBe(' ![a \\[\\[x\\]\\]](https://example.com/a.png)');
  });

  it('does not write the title of an image', () => {
    expect(img('x')).not.toContain('title');
  });

  it('writes the alt text of an image in a link as a label', () => {
    expect(img('x](y) [[x]]', true)).toBe(
      '[ ![x\\](y) \\[\\[x\\]\\]](https://example.com/a.png) ](https://example.com/p)',
    );
  });

  it('keeps the alt text of an ordinary image', () => {
    expect(img('A photo of a cat')).toBe(' ![A photo of a cat](https://example.com/a.png)');
    expect(img('')).toBe(' ![](https://example.com/a.png)');
  });

  it('writes a hostile alt text so that the block has nothing special in it', () => {
    for (const alt of ['x](y) [[x]]', 'a]((ref))', '[[x]] #t {{embed [[p]]}}', 'a\n[[x]]', '\\]\\[', '\\\\\\]']) {
      const out = img(alt, true);
      // Only the label of the image and of the link, and the two URLs.
      expect(out.replace(/\\./g, '')).toMatch(/^\[ !\[[^\]]*\]\(https:\/\/example\.com\/a\.png\) \]\(https:\/\/example\.com\/p\)$/);
    }
  });

  it('writes a hostile label of a link the same way', () => {
    const container = document.createElement('div');
    container.innerHTML = '<a href="https://example.com/p">x [[y]] ]( #t\n[[z]]</a>';
    expect(block(buildTurndownService().turndown(container))).toBe(
      '[x \\[\\[y\\]\\] \\]( \\#t \\[\\[z\\]\\]](https://example.com/p)',
    );
  });
});

describe('escapeForLogseq, bare lines', () => {
  const live = (text: string) => {
    for (let i = 0; i < text.length; i++) {
      if (text[i] === '\\') i++;
      else if (text[i] === '[' && text[i + 1] === '[') return true;
    }
    return false;
  };

  // A line with a literal backslash in front of a bracket (an odd count of
  // three or more) has bare brackets, see escapeForLogseq. Dropping an escape
  // must not make `[[` (a page link) or `[a](b)` (a link).
  it.each([
    ['a page link after a literal backslash', '\\\\\\[[x]]', '\\\\[\\[x]]'],
    ['a page link after a bare bracket', '\\\\\\] \\[[x]]', '\\\\] [\\[x]]'],
    ['a page link with an escaped end', '\\\\\\] \\[[x\\]]', '\\\\] [\\[x]]'],
    ['a page link next to a bare bracket', '\\\\\\[ \\[[x]]', '\\\\[ [\\[x]]'],
    ['a page link with a tag', '\\\\\\] \\[[#t]]', '\\\\] [\\[\\#t]]'],
    ['a link with a page link as the URL', '\\\\\\] \\[a]([[x]])', '\\\\] [a]\\(\\[[x]])'],
    ['a link after a bare bracket', '\\\\\\] \\[a](b)', '\\\\] [a]\\(b)'],
    ['a link after a literal backslash', 'a\\\\\\[b](c)', 'a\\\\[b]\\(c)'],
    ['a link with a page link after a literal backslash', 'a\\\\\\[b]([[x]])', 'a\\\\[b]\\(\\[[x]])'],
    ['an escaped pair', '\\\\\\[x\\\\\\] \\[\\[y\\]\\]', '\\\\[x\\\\] [\\[y]]'],
    ['a pair after a bracket', '\\\\\\] [\\[x]]', '\\\\] [\\[x]]'],
  ])('writes %s as text', (_name, input, expected) => {
    expect(block(input)).toBe(expected);
    expect(live(block(input))).toBe(false);
  });

  it('keeps the brackets of an even run of backslashes as they are', () => {
    // `\\[x]` is a literal backslash and a live bracket: no bare line.
    expect(block('\\\\[[x]]')).toBe('\\\\\\[[x]]');
    expect(block('a\\\\[b](c)')).toBe('a\\\\[b](c)');
  });

  it('keeps a real link in a bare line', () => {
    expect(block('\\\\\\[x\\\\\\] and [a](https://example.com)')).toBe('\\\\[x\\\\] and [a](https://example.com)');
  });

  it('never writes a live [[ for any mix of brackets and backslashes', () => {
    const tokens = ['\\', '[', ']', 'x', ' '];
    const walk = (prefix: string, depth: number) => {
      if (prefix && live(block(prefix))) throw new Error(`live [[ in ${JSON.stringify(prefix)} -> ${JSON.stringify(block(prefix))}`);
      if (depth === 0) return;
      for (const t of tokens) walk(prefix + t, depth - 1);
    };
    walk('', 7);
  });
});

// The text of ordinary pages is what it was before fences, alt texts and bare
// lines were read as Logseq reads them. Expected values: `51e18c8`.
describe('escapeForLogseq, ordinary text is unchanged', () => {
const ORDINARY_HTML: [string, string][] = [
  ['<p>Intro <b>bold</b> and <i>it</i></p><pre><code>const a = 1;\n// #not [[a]] {{b}}\nkey:: v\n- dash\n</code></pre><p>after</p>',
   'Intro **bold** and _it_\n\n```\nconst a = 1;\n// #not [[a]] {{b}}\nkey:: v\n- dash\n```\n\nafter'],
  ['<pre><code class="language-js">function f() {\n  return "x";\n}</code></pre>',
   '```js\nfunction f() {\n  return "x";\n}\n```'],
  ['<pre><code class="language-c++">int main() {}</code></pre>',
   '```c++\nint main() {}\n```'],
  ['<pre><code class="language-c#">var x = 1;</code></pre>',
   '```c#\nvar x = 1;\n```'],
  ['<pre><code class="language-python">def f():\n    return [1, 2]\n</code></pre>',
   '```python\ndef f():\n    return [1, 2]\n```'],
  ['<p>a</p><pre><code>one\n\ntwo</code></pre><p>b</p>',
   'a\n\n```\none\n\ntwo\n```\n\nb'],
  ['<pre><code>a\n```\nb</code></pre>',
   '````\na\n```\nb\n````'],
  ['<pre><code>  indented\n\ttabbed\n</code></pre>',
   '```\n  indented\n\ttabbed\n```'],
  ['<img alt="A photo of a cat" src="https://example.com/cat.png">',
   ' ![A photo of a cat](https://example.com/cat.png)'],
  ['<img alt="Logo (2) - it\'s a &quot;test&quot;" src="https://example.com/logo.png">',
   ' ![Logo (2) - it\'s a "test"](https://example.com/logo.png)'],
  ['<img src="https://example.com/noalt.png">',
   ' ![](https://example.com/noalt.png)'],
  ['<img alt="" src="https://example.com/empty.png">',
   ' ![](https://example.com/empty.png)'],
  ['<p>See <img alt="inline" src="https://example.com/i.png"> here</p>',
   'See  ![inline](https://example.com/i.png)  here'],
  ['<a href="https://example.com/p">Plain link</a>',
   '[Plain link](https://example.com/p)'],
  ['<p>A <a href="https://example.com/a?x=1&y=2">link with <b>bold</b></a> and <a href="https://en.wikipedia.org/wiki/Foo_(bar)">Foo</a></p>',
   'A [link with **bold**](https://example.com/a?x=1&y=2) and [Foo](https://en.wikipedia.org/wiki/Foo_(bar))'],
  ['<a href="https://example.com/p"><img alt="Banner" src="https://example.com/b.png"></a>',
   '[ ![Banner](https://example.com/b.png) ](https://example.com/p)'],
  ['<ul><li>one</li><li>two <a href="https://example.com/l">link</a></li></ul>',
   '*   one\n*   two [link](https://example.com/l)'],
  ['<ul><li>item<pre><code>code in list</code></pre></li></ul>',
   '*   item\n    \n    ```\n    code in list\n    ```'],
];

const ORDINARY_TEXT: [string, string][] = [
  ['one #a\n```js\n#tag [[x]] TODO\nkey:: v\n- dash\n```\ntwo #b',
   'one \\#a\n```js\n#tag [[x]] TODO\nkey:: v\n- dash\n```\ntwo \\#b'],
  ['~~~\n#tag\n~~~',
   '~~~\n#tag\n~~~'],
  ['```\na\\[0\\]\n```',
   '```\na\\[0\\]\n```'],
  ['Intro\n\n```js\nconst a = [[1]];\n```\n\nOutro #t',
   'Intro\n\n```js\nconst a = [[1]];\n```\n\nOutro \\#t'],
  ['Intro\n\n~~~python\nx = {{y}}\n~~~',
   'Intro\n\n~~~python\nx = {{y}}\n~~~'],
  ['   ```\n#code\n   ```',
   '   ```\n#code\n   ```'],
  ['```\n#tag\n```\n```\n[[x]]\n```',
   '```\n#tag\n```\n```\n[[x]]\n```'],
  ['> quote #q\n\n```\n#code\n```',
   '> quote \\#q\n\n```\n#code\n```'],
  ['see [a](https://example.com/p#frag) here and ![i](https://example.com/a.png#b)',
   'see [a](https://example.com/p#frag) here and ![i](https://example.com/a.png#b)'],
  ['[a #tag b](https://example.com/) and ![alt #tag [[p]]](https://example.com/a.png)',
   '[a \\#tag b](https://example.com/) and ![alt \\#tag \\[[p]]](https://example.com/a.png)'],
  ['[Foo](https://en.wikipedia.org/wiki/Foo_(bar)) #t',
   '[Foo](https://en.wikipedia.org/wiki/Foo_(bar)) \\#t'],
];

  const html = (source: string) => {
    const container = document.createElement('div');
    container.innerHTML = source;
    return block(buildTurndownService().turndown(container));
  };

  it.each(ORDINARY_HTML)('writes the HTML %j as it did', (source, expected) => {
    expect(html(source)).toBe(expected);
  });

  it.each(ORDINARY_TEXT)('writes the text %j as it did', (source, expected) => {
    expect(block(source)).toBe(expected);
  });
});
