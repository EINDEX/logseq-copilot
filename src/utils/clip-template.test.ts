import { describe, expect, it } from 'vitest';
import {
  contentToBlocks,
  countRoots,
  isTreeTemplate,
  parseOutline,
  renderClip,
  type ClipBlock,
  type ClipVars,
} from './clip-template';
import { blockRending, buildTurndownService, escapeForLogseq } from './utils';
import {
  BUILT_IN_TEMPLATES,
  DEFAULT_TEMPLATE_CONTENT,
  TEMPLATE_PRESETS,
} from './default-templates';

const vars = (data: string, extra: Partial<ClipVars> = {}): ClipVars => ({
  url: 'https://example.com/a',
  title: 'Sample',
  data,
  preferredDateFormat: 'MMM do, yyyy',
  time: new Date(2021, 7, 19, 16, 30),
  ...extra,
});

/** A compact view of a tree: "text" for a leaf, [text, ...children] otherwise. */
type Shape = string | [string, ...Shape[]];
const shape = (blocks: ClipBlock[]): Shape[] =>
  blocks.map((b) => (b.children.length ? [b.content, ...shape(b.children)] : b.content) as Shape);

const clip = (template: string, data: string) => shape(renderClip(template, vars(data)));

describe('isTreeTemplate', () => {
  it('is a tree when the first line is a bullet', () => {
    expect(isTreeTemplate('- a\n  - b')).toBe(true);
    expect(isTreeTemplate('\n\n  - a')).toBe(true);
    expect(isTreeTemplate('\t- a')).toBe(true);
  });

  it('skips lines that only hold Liquid tags', () => {
    expect(isTreeTemplate('{% if url %}\n- a\n{% endif %}')).toBe(true);
    expect(isTreeTemplate('{% assign x = 1 %} {% comment %}{% endcomment %}\n- a')).toBe(true);
    expect(isTreeTemplate('{% if url %}\nplain\n- a')).toBe(false);
  });

  it('is flat otherwise', () => {
    expect(isTreeTemplate(DEFAULT_TEMPLATE_CONTENT)).toBe(false);
    expect(isTreeTemplate('TODO [{{title}}]({{url}})\n{{content}}')).toBe(false);
    expect(isTreeTemplate('-nospace\n- a')).toBe(false);
    expect(isTreeTemplate('{{content}}\n- a')).toBe(false);
    expect(isTreeTemplate('')).toBe(false);
  });
});

describe('parseOutline', () => {
  it('builds the tree from two-space indentation', () => {
    expect(shape(parseOutline('- a\n  - b\n    - c\n  - d\n- e'))).toEqual([
      ['a', ['b', 'c'], 'd'],
      'e',
    ]);
  });

  it('counts a tab as two spaces', () => {
    expect(shape(parseOutline('- a\n\t- b\n\t\t- c'))).toEqual([['a', ['b', 'c']]]);
  });

  it('caps the depth at one more than the block before', () => {
    expect(shape(parseOutline('- a\n      - b\n  - c'))).toEqual([['a', 'b', 'c']]);
    expect(shape(parseOutline('    - a\n- b'))).toEqual(['a', 'b']);
  });

  it('keeps lines without a bullet in the block, with its indent stripped', () => {
    const [root] = parseOutline('- a\n  b:: 1\n  - c\n    d:: 2\n    more');
    expect(root.content).toBe('a\nb:: 1');
    expect(root.children[0].content).toBe('c\nd:: 2\nmore');
  });

  it('does not start a block inside a fence', () => {
    const text = '- code\n  ```js\n  - not a bullet\n- nor this\n  ```\n  - child\n- next';
    expect(shape(parseOutline(text))).toEqual([
      ['code\n```js\n- not a bullet\n- nor this\n```', 'child'],
      'next',
    ]);
  });

  it('knows ~~~ fences and closes one with the next mark of either kind, as Logseq does', () => {
    expect(
      shape(parseOutline('- a\n  ~~~\n  - x\n  ~~~\n- b')),
    ).toEqual(['a\n~~~\n- x\n~~~', 'b']);
    // ``` closes ~~~: the line after the pair is not code.
    const text = '- a\n  ~~~\n  ```\n  - x\n  ~~~\n- b';
    expect(shape(parseOutline(text))).toEqual([['a\n~~~\n```', 'x\n~~~'], 'b']);
  });

  it('reads a mark with no mark after it as text', () => {
    expect(shape(parseOutline('- a\n  ```\n  - b\n- c'))).toEqual([
      ['a\n```', 'b'],
      'c',
    ]);
  });

  it('treats a fence opened on the bullet line as code', () => {
    expect(shape(parseOutline('- ```\n  - x\n  ```\n- y'))).toEqual(['```\n- x\n```', 'y']);
  });

  it('does not take inline triple backticks for a fence', () => {
    expect(shape(parseOutline('- ```x``` here\n- b'))).toEqual(['```x``` here', 'b']);
  });

  it('trims trailing blank lines and keeps inner ones', () => {
    const [root] = parseOutline('- a\n\n  b\n\n\n');
    expect(root.content).toBe('a\n\nb');
  });

  it('skips empty bullets and moves their children up', () => {
    expect(shape(parseOutline('- \n  - a\n-\n- b\n  - \n    - c'))).toEqual([
      'a',
      ['b', 'c'],
    ]);
    expect(parseOutline('- \n- ')).toEqual([]);
  });

  it('turns text before the first bullet into a block', () => {
    expect(shape(parseOutline('intro\n- a'))).toEqual(['intro', 'a']);
  });
});

describe('contentToBlocks', () => {
  it('makes a block of every paragraph, blank lines between them', () => {
    expect(shape(contentToBlocks('one\n\ntwo\nlines\n\n\nthree'))).toEqual([
      'one',
      'two\nlines',
      'three',
    ]);
  });

  it('makes a block of every list item and drops bullet markers', () => {
    const md = 'Intro:\n\n*   a\n*   b\n    *   b1\n    *   b2\n        *   deep\n*   c\n\n-   d\n+   e';
    expect(shape(contentToBlocks(md))).toEqual([
      'Intro:',
      'a',
      ['b', 'b1', ['b2', 'deep']],
      'c',
      'd',
      'e',
    ]);
  });

  it('keeps the markers of ordered lists as text', () => {
    expect(shape(contentToBlocks('1.  one\n2.  two\n    1.  inner\n10) ten'))).toEqual([
      '1. one',
      ['2. two', '1. inner'],
      '10) ten',
    ]);
  });

  it('keeps a fenced code block whole, even with list lines and blank lines', () => {
    const md = 'Before\n\n```js\n- a\n* b\n\n1. c\n```\n\nAfter';
    expect(shape(contentToBlocks(md))).toEqual([
      'Before',
      '```js\n- a\n* b\n\n1. c\n```',
      'After',
    ]);
  });

  it('keeps a fence under a list item inside the list, dedented', () => {
    const md = '*   item\n\n    ```\n    - x\n    ```\n*   next';
    expect(shape(contentToBlocks(md))).toEqual([['item', '```\n- x\n```'], 'next']);
  });

  it('reads a fence that is never closed as text', () => {
    expect(shape(contentToBlocks('~~~\n- a\n\nb'))).toEqual(['~~~', 'a', 'b']);
  });

  it('closes a fence with the next mark of either kind, as the escaper pairs them', () => {
    expect(shape(contentToBlocks('```\na\n\n~~~\n- x\n```'))).toEqual([
      '```\na\n\n~~~',
      'x',
      '```',
    ]);
    expect(shape(contentToBlocks('~~~\n- a\n\n```js\nb'))).toEqual([
      '~~~\n- a\n\n```js',
      'b',
    ]);
  });

  it('keeps a run of quote lines whole', () => {
    expect(shape(contentToBlocks('> a\n> \n> b\n\nafter\n\n> second'))).toEqual([
      '> a\n> \n> b',
      'after',
      '> second',
    ]);
  });

  it('keeps a table whole', () => {
    const table = '| a | b |\n| - | - |\n| 1 | 2 |';
    expect(shape(contentToBlocks(`${table}\n\ntext`))).toEqual([table, 'text']);
  });

  it('keeps a horizontal rule as a block of its own', () => {
    expect(shape(contentToBlocks('a\n\n* * *\n\nb'))).toEqual(['a', '* * *', 'b']);
  });

  it('keeps a wrapped line in its list item', () => {
    expect(shape(contentToBlocks('*   one\n    wrapped\n*   two'))).toEqual(['one\nwrapped', 'two']);
  });

  it('returns nothing for empty content', () => {
    expect(contentToBlocks('')).toEqual([]);
    expect(contentToBlocks(' \n\n')).toEqual([]);
  });
});

describe('renderClip, flat templates', () => {
  it('renders one block equal to blockRending', () => {
    const data = 'first\n\nsecond';
    const blocks = renderClip(DEFAULT_TEMPLATE_CONTENT, vars(data));
    expect(blocks).toEqual([
      {
        content:
          '#[[Clip]] [Sample](https://example.com/a)\nfirst\n\nsecond',
        children: [],
      },
    ]);
    expect(blocks[0].content).toBe(
      blockRending({
        clipNoteTemplate: DEFAULT_TEMPLATE_CONTENT,
        url: 'https://example.com/a',
        title: 'Sample',
        data,
        preferredDateFormat: 'MMM do, yyyy',
        time: new Date(2021, 7, 19, 16, 30),
      }),
    );
  });

  it('matches the output every template had before outline templates', () => {
    const render = (template: string, data: string) =>
      blockRending({
        clipNoteTemplate: template,
        url: 'https://example.com/a',
        title: 'Sample',
        data,
        preferredDateFormat: 'MMM do, yyyy',
        time: new Date(2021, 7, 19, 16, 30),
      });
    // Literal expectations: what the code before this change produced.
    expect(render('TODO [{{title}}]({{url}})\n{{content}}', 'sel')).toBe(
      'TODO [Sample](https://example.com/a)\nsel',
    );
    expect(render('{{content}}\n- a\n  - b', 'x\n\n* y')).toBe('x\n\n* y\n- a\n  - b');
    expect(render('  [[{{date}}]] {{time}}  \n\n', '')).toBe('[[Aug 19th, 2021]] 16:30');
    expect(render('{{content | upcase}}', 'a {{b}} [[c]]')).toBe('A \\{{B}} \\[[C]]');
    expect(render('', 'x')).toBe('');
    expect(renderClip('', vars('x'))).toEqual([{ content: '', children: [] }]);
  });

  it('is not changed by outline syntax further down', () => {
    expect(clip('see {{content}}\n- a', 'x')).toEqual(['see x\n- a']);
  });
});

describe('renderClip, tree templates', () => {
  const NESTED = '- [{{title}}]({{url}})\n  - {{content}}';

  it('puts paragraphs and list items under the link (rule a)', () => {
    const data = 'One\n\nTwo\n\n*   a\n    *   a1\n*   b';
    expect(clip(NESTED, data)).toEqual([
      ['[Sample](https://example.com/a)', 'One', 'Two', ['a', 'a1'], 'b'],
    ]);
  });

  it('keeps content alone on a top-level bullet in that block (rule b)', () => {
    expect(clip('- {{content}}', 'x\n\ny')).toEqual(['x\n\ny']);
    expect(clip('- {{ content }}', 'x\n\ny')).toEqual(['x\n\ny']);
    expect(clip('- {{content}}\n  - tail', 'x\n\ny')).toEqual([['x\n\ny', 'tail']]);
  });

  it('places content at deeper levels (rule a)', () => {
    const tpl = '- a\n  - b\n    - {{content}}\n    - after';
    expect(clip(tpl, 'x\n\n*   y\n    *   z')).toEqual([
      ['a', ['b', 'x', ['y', 'z'], 'after']],
    ]);
  });

  it('keeps code with list lines, quotes and tables whole (rule a)', () => {
    const data =
      'Intro\n\n```js\n- a\n\n* b\n```\n\n> q1\n> q2\n\n| h |\n| - |\n| 1 |\n\nEnd';
    expect(clip(NESTED, data)).toEqual([
      [
        '[Sample](https://example.com/a)',
        'Intro',
        '```js\n- a\n\n* b\n```',
        '> q1\n> q2',
        '| h |\n| - |\n| 1 |',
        'End',
      ],
    ]);
  });

  it('keeps ordered markers and nesting (rule a)', () => {
    expect(clip(NESTED, '1.  one\n2.  two\n    1.  inner')).toEqual([
      ['[Sample](https://example.com/a)', '1. one', ['2. two', '1. inner']],
    ]);
  });

  it('keeps a code fence under a list item in the list (rule a)', () => {
    expect(
      clip('- t\n  - {{content}}', '*   run\n\n    ```sh\n    - a\n    ```'),
    ).toEqual([['t', ['run', '```sh\n- a\n```']]]);
  });

  it('runs user filters on the content first', () => {
    expect(clip('- t\n  - {{content | upcase}}', 'one\n\ntwo')).toEqual([['t', 'ONE', 'TWO']]);
    expect(clip('- {{content | prepend: "> "}}', 'one')).toEqual(['> one']);
    expect(clip('- t: {{ content | upcase }}', 'one\n\ntwo')).toEqual(['t: ONE\n\nTWO']);
  });

  it('escapes {{ and [[ in the content as flat templates do', () => {
    expect(clip('- {{content}}', 'a [[b]] {{c}}')).toEqual(['a \\[[b]] \\{{c}}']);
  });

  it('keeps the content in one block inside a bullet line (rule b)', () => {
    expect(clip('- Note: {{content}}', 'one\n\ntwo\n\n*   a')).toEqual([
      'Note: one\n\ntwo\n\n*   a',
    ]);
  });

  it('keeps the content in the block on a continuation line (rule b)', () => {
    const blocks = renderClip(
      '- [{{title}}]({{url}})\n  {{content}}\n  - child',
      vars('one\n\ntwo'),
    );
    expect(blocks).toHaveLength(1);
    expect(blocks[0].content).toBe('[Sample](https://example.com/a)\none\n\ntwo');
    expect(shape(blocks)).toEqual([['[Sample](https://example.com/a)\none\n\ntwo', 'child']]);
  });

  it('indents rule b content to the continuation column of a deep block', () => {
    const blocks = renderClip('- a\n  - b: {{content}}\n    - c', vars('x\ny'));
    expect(shape(blocks)).toEqual([['a', ['b: x\ny', 'c']]]);
  });

  it('keeps list lines and fences of rule b content out of the outline', () => {
    const data = 'x\n\n- not a bullet\n\n```\n- code\n```';
    const blocks = renderClip('- {{content | strip}}!\n  - child', vars(data));
    expect(blocks).toHaveLength(1);
    expect(blocks[0].content).toBe('x\n\n\\- not a bullet\n\n```\n- code\n```!');
    expect(blocks[0].children.map((b) => b.content)).toEqual(['child']);
  });

  it('treats content with text after it on the line as rule b', () => {
    expect(clip('- {{content}} (via me)', 'a\n\nb')).toEqual(['a\n\nb (via me)']);
  });

  it('skips the bullet for empty content (rule c)', () => {
    expect(clip(NESTED, '')).toEqual(['[Sample](https://example.com/a)']);
    expect(clip('- a\n  - {{content}}\n  - b', '')).toEqual([['a', 'b']]);
    expect(clip('- {{content}}', '')).toEqual([]);
    expect(clip('- {{content}}', ' \n\n')).toEqual([]);
  });

  it('moves the children of a skipped bullet up', () => {
    expect(clip('- {{content}}\n  - tail', '')).toEqual(['tail']);
  });

  describe('one root per clip', () => {
    it('makes the first root the parent of the other roots, in order', () => {
      expect(clip('- a\n  - a1\n- b\n  - b1\n- c', '')).toEqual([
        ['a', 'a1', ['b', 'b1'], 'c'],
      ]);
    });

    it('makes the first child the root when the root is empty', () => {
      expect(clip('- {{content}}\n  - one\n    - deep\n  - two\n  - three', '')).toEqual([
        ['one', 'deep', 'two', 'three'],
      ]);
    });

    it('joins roots that Liquid output makes', () => {
      const tpl = '{% for n in (1..3) %}\n- item {{n}}\n{% endfor %}';
      expect(clip(tpl, '')).toEqual([['item 1', 'item 2', 'item 3']]);
    });

    it('keeps a flat template one block', () => {
      expect(renderClip('a\n\nb', vars(''))).toEqual([
        { content: 'a\n\nb', children: [] },
      ]);
    });

    it('never returns more than one root', () => {
      for (const tpl of ['- a\n- b', '- {{content}}\n- x\n- y', '- p\n  - q\n- r']) {
        for (const data of ['', 'x\n\ny']) {
          expect(renderClip(tpl, vars(data)).length).toBeLessThanOrEqual(1);
        }
      }
    });

    it('counts the roots of a template as the editor reads it', () => {
      expect(countRoots('a\nb')).toBe(1);
      expect(countRoots('- a\n  - b')).toBe(1);
      expect(countRoots('- a\n- b')).toBe(2);
      expect(countRoots('- \n  - a')).toBe(1);
    });

    it('has one root in the built-in templates and every preset', () => {
      const all = [
        ...BUILT_IN_TEMPLATES.map((t) => [t.name, t.content]),
        ...TEMPLATE_PRESETS.map((p) => [p.name, p.content]),
      ];
      expect(all.length).toBeGreaterThanOrEqual(6);
      for (const [name, content] of all) {
        expect(countRoots(content), name).toBe(1);
        for (const data of ['', 'x', 'x\n\n*   y\n    *   z']) {
          expect(renderClip(content, vars(data)).length, name).toBe(1);
        }
      }
    });
  });

  it('keeps property lines in the block', () => {
    const tpl = '- [{{title}}]({{url}})\n  source:: {{url}}\n  date:: [[{{date}}]]\n  - {{content}}';
    expect(clip(tpl, 'x')).toEqual([
      [
        '[Sample](https://example.com/a)\nsource:: https://example.com/a\ndate:: [[Aug 19th, 2021]]',
        'x',
      ],
    ]);
  });

  it('renders the date as a journal link in the preferred format', () => {
    const [block] = renderClip('- [[{{date}}]] {{time}}', vars('', { preferredDateFormat: 'yyyy-MM-dd' }));
    expect(block.content).toBe('[[2021-08-19]] 16:30');
  });

  it('works with Liquid tags around the bullets', () => {
    const tpl = '{% if url %}\n- [{{title}}]({{url}})\n  - {{content}}\n{% endif %}';
    expect(clip(tpl, 'x')).toEqual([['[Sample](https://example.com/a)', 'x']]);
    expect(shape(renderClip(tpl, vars('x', { url: undefined })))).toEqual([]);
  });

  it('handles whitespace control and other uses of content', () => {
    expect(clip('- {{ content -}}', 'a')).toEqual(['a']);
    // Not an output of the variable itself: left alone.
    expect(clip('- {{content.size}} {{contents}}', 'abc')).toEqual(['3']);
  });

  it('throws on bad Liquid', () => {
    expect(() => renderClip('- {% if %}', vars('x'))).toThrow();
  });
});

describe('renderClip, escaping page text', () => {
  const NESTED = '- [{{title}}]({{url}})\n  - {{content}}';
  const children = (template: string, data: string, extra: Partial<ClipVars> = {}) => {
    const [root] = renderClip(template, vars(data, extra));
    return shape(root.children);
  };

  it('escapes a task marker at the start of a paragraph', () => {
    expect(children(NESTED, 'intro\n\nTODO buy milk\n\nDONE it')).toEqual([
      'intro',
      '\\TODO buy milk',
      '\\DONE it',
    ]);
  });

  it('does not touch a task marker that is not at the start of a block', () => {
    expect(children(NESTED, 'wait\nTODO later')).toEqual(['wait\nTODO later']);
  });

  it('escapes a list item that starts with a marker, at any level', () => {
    expect(children(NESTED, '*   TODO one\n    *   DOING two\n*   plain')).toEqual([
      ['\\TODO one', '\\DOING two'],
      'plain',
    ]);
    expect(children(NESTED, '1.  TODO step\n2.  LATER step')).toEqual([
      '1. TODO step',
      '2. LATER step',
    ]);
  });

  it('keeps a `- ` line out of the bullets', () => {
    // turndown writes a page line `- a` as `\- a`; an item of the page is `*   `.
    expect(children(NESTED, '\\- not a bullet\n\n*   - inside an item')).toEqual([
      '\\- not a bullet',
      '\\- inside an item',
    ]);
    const [root] = renderClip('- {{content}}', vars('x\n- y\n  - z'));
    expect(root.children).toEqual([]);
    expect(root.content).toBe('x\n\\- y\n  \\- z');
  });

  it('escapes #tag, [[x]], ((x)), {{x}} and Foo[1]', () => {
    expect(
      children(NESTED, '#tag text\n\nsee [[x]] and ((uuid)) {{embed}}\n\nFoo\\[1\\] and #[[page]]'),
    ).toEqual([
      '\\#tag text',
      'see \\[[x]] and \\((uuid)) \\{{embed}}',
      'Foo\\[1] and \\#\\[[page]]',
    ]);
  });

  it('escapes a property at the start of each block', () => {
    expect(children(NESTED, 'key:: v\n\nnote\nother:: w\n\n*   item:: z')).toEqual([
      'key:\\: v',
      'note\nother:\\: w',
      'item:\\: z',
    ]);
  });

  it('escapes SCHEDULED, DEADLINE and drawers', () => {
    expect(
      children(NESTED, 'SCHEDULED: <2026-01-01 Thu>\n\n:LOGBOOK:\n\n# heading text'),
    ).toEqual(['\\SCHEDULED: <2026-01-01 Thu>', '\\:LOGBOOK:', '\\# heading text']);
  });

  it('keeps code fences, tables and quotes whole and the code literal', () => {
    const data = '```\n#tag [[x]]\n- y\n```\n\n> TODO quoted\n\n| a | b |';
    expect(children(NESTED, data)).toEqual([
      '```\n#tag [[x]]\n- y\n```',
      '> TODO quoted',
      '| a | b |',
    ]);
  });

  it('escapes the content as a whole inside one block (rule b)', () => {
    expect(children('- Quote: {{content}}', 'TODO a\n\n#tag [[x]]')).toEqual([]);
    const [root] = renderClip('- Quote: {{content}}', vars('TODO a\n\n#tag [[x]]'));
    expect(root.content).toBe('Quote: TODO a\n\n\\#tag \\[[x]]');
    const [top] = renderClip('- {{content}}', vars('key:: v'));
    expect(top.content).toBe('key:\\: v');
  });

  it('escapes the title and the URL as a link label and target', () => {
    const [root] = renderClip(
      NESTED,
      vars('x', { title: 'TODO [a] #b [[c]]', url: 'https://example.com/a b(c)#d' }),
    );
    expect(root.content).toBe(
      '[TODO \\[a\\] \\#b \\[\\[c\\]\\]](https://example.com/a%20b(c)#d)',
    );
  });

  it('escapes the title and the URL as block text outside a link', () => {
    const [root] = renderClip(
      '- {{title}}\n  source:: {{url}}\n  - {{content}}',
      vars('x', { title: 'TODO a #b', url: 'https://example.com/a' }),
    );
    expect(root.content).toBe('\\TODO a \\#b\nsource:: https://example.com/a');
  });

  it('escapes a title that would start a block with `- ` or a heading', () => {
    expect(renderClip('- {{title}}', vars('', { title: '- a' }))[0].content).toBe('\\- a');
    expect(renderClip('- {{title}}', vars('', { title: '# a' }))[0].content).toBe('\\# a');
  });

  it('never escapes the text of the template or the date and time', () => {
    const template =
      '- TODO #[[Clip]] [{{title}}]({{url}}) due:: [[{{date}}]] {{time}} {{dt | date: "%Y"}}\n  - {{content}}';
    const [root] = renderClip(template, vars('x'));
    expect(root.content).toBe(
      'TODO #[[Clip]] [Sample](https://example.com/a) due:: [[Aug 19th, 2021]] 16:30 2021',
    );
  });

  it('escapes content that reaches the output without the placement', () => {
    const [root] = renderClip(
      '- {% assign c = content %}{{ c }}',
      vars('TODO #tag'),
    );
    expect(root.content).toBe('\\TODO \\#tag');
  });

  it('runs the filters of the template before the escaping', () => {
    expect(children('- a\n  - {{content | upcase}}', 'todo [[x]]')).toEqual([
      '\\TODO \\[[X]]',
    ]);
  });

  it('gives a one-block clip the same text as a flat template', () => {
    const samples = [
      'TODO a',
      '#tag [[x]] ((y)) {{z}}',
      'key:: v',
      'Foo\\[1\\] and \\[a\\](b)',
      'SCHEDULED: <2026-01-01 Thu>',
      '# not a heading',
      'a `#code [[x]]` b [l [[x]]](https://example.com/#a)',
      '```\n#tag [[x]]\n```',
    ];
    for (const sample of samples) {
      const flat = renderClip('{{content}}', vars(sample))[0].content;
      const tree = renderClip('- {{content}}', vars(sample))[0].content;
      expect(tree).toBe(flat);
    }
  });
});

describe('a URL or title as the value of a property line', () => {
  const READING = TEMPLATE_PRESETS.find((p) => p.id === 'reading-note')!.content;
  const root = (template: string, extra: Partial<ClipVars>) =>
    renderClip(template, vars('', extra))[0].content;

  it.each([
    ['a #fragment', 'https://example.com/a?x=1#frag'],
    ['a query', 'https://example.com/a?a=1&b=2'],
    ['paired parentheses', 'https://example.com/wiki/Foo_(bar)'],
    ['an unpaired (', 'https://example.com/wiki/un(paired'],
    ['an unpaired )', 'https://example.com/wiki/un)paired'],
    ['[x] in the path', 'https://example.com/p/[x]/z'],
    ['[[x]] in the path', 'https://example.com/p/[[x]]/z'],
  ])('keeps the URL with %s as it is', (_name, url) => {
    const href = new URL(url).href;
    const text = root(READING, { url: href, title: 'T' });
    expect(text).toContain(`\nsource:: ${href}\n`);
    expect(text.split('\n')[1]).not.toContain('\\');
  });

  it('still writes the URL as a link destination in the link of the same template', () => {
    const href = new URL('https://example.com/wiki/un(paired#f').href;
    const text = root(READING, { url: href, title: 'T' });
    expect(text.split('\n')[0]).toBe('[T](https://example.com/wiki/un%28paired#f)');
    expect(text).toContain('source:: https://example.com/wiki/un(paired#f');
  });

  it('encodes what ends the value or starts syntax', () => {
    expect(root('- k:: {{url}}', { url: 'https://example.com/?q={{a}}&b=`c`<d>\\e' })).toBe(
      'k:: https://example.com/?q=%7B%7Ba%7D%7D&b=%60c%60%3Cd%3E%5Ce',
    );
  });

  it('applies to a flat template, a bullet and a deeper line', () => {
    const url = 'https://example.com/a#f';
    expect(renderClip('k:: {{url}}', vars('', { url }))[0].content).toBe(`k:: ${url}`);
    expect(
      renderClip('- A\n  - k:: {{ url | upcase }}', vars('', { url }))[0].children[0].content,
    ).toBe('k:: HTTPS://EXAMPLE.COM/A#F');
    expect(renderClip('- A\n  - B\n    - k:: {{url}}', vars('', { url }))[0].children[0].children[0].content).toBe(`k:: ${url}`);
  });

  it('escapes a title as literal one-line text', () => {
    expect(
      root('- [{{title}}]({{url}})\n  name:: {{title}}', {
        url: 'https://example.com/',
        title: 'C# #idea [[x]]\nand [y]',
      }),
    ).toBe(
      '[C# \\#idea \\[\\[x\\]\\] and \\[y\\]](https://example.com/)\nname:: C# \\#idea \\[\\[x\\]\\] and \\[y\\]',
    );
  });

  it('keeps the other uses of the variable on their own escape', () => {
    // The title is a label once, and plain text elsewhere: that one is block text.
    const text = root('- [{{title}}]({{url}}) {{title}}\n  source:: {{url}}', {
      url: 'https://example.com/a#f',
      title: '#t',
    });
    expect(text).toBe('[\\#t](https://example.com/a#f) \\#t\nsource:: https://example.com/a#f');
  });

  it('does not treat a variable after other text, or a link, as a property value', () => {
    const url = 'https://example.com/a#f';
    expect(root('- see:: a {{url}}', { url })).toBe('see:: a https://example.com/a\\#f');
    expect(root('- [k:: {{url}}]({{url}})', { url })).toContain('\\#f');
    expect(root('- k:: {{url}} x', { url })).toBe('k:: https://example.com/a\\#f x');
  });

  it('leaves a missing URL or title empty', () => {
    expect(root('- k:: {{url}}\n  n:: {{title}}', { url: undefined, title: undefined })).toBe('k:: \nn::');
  });

  it('escapes each block of an outline whose link destination has a space', () => {
    const blocks = renderClip(
      '- [{{title}}](https://e.com/)\n  - {{content}}',
      vars('A [l](x {{y}}) and [m](https://e.com/(a)) here\n\nTODO next'),
    );
    expect(blocks[0].children.map((b) => b.content)).toEqual([
      'A \\[l](x \\{{y}}) and [m](https://e.com/(a)) here',
      '\\TODO next',
    ]);
  });
});

// The hostile fences, image alt texts and bare lines of the escaper tests
// (logseq-escape.test.ts) through an outline template. The content is split into
// blocks and each block is escaped, so the splitter, the escaper and the outline
// parser must read the fence marks the same way (`fenceRegions`): a line is
// code, and left alone, only when Logseq reads it as code in the block that is
// written, and no line of it starts a block.
describe('renderClip, hostile page text in an outline template', () => {
  const NESTED = '- [{{title}}]({{url}})\n  - {{content}}';
  const PREFIXED = '- [{{title}}]({{url}})\n  - Note: {{content}}';
  const RAW = '#tag [[x]] {{embed [[p]]}}\nkey:: v\nTODO x\n- dash';
  // RAW as text, one block per paragraph and item (the `- ` marker is dropped).
  const TEXT = '\\#tag \\[[x]] \\{{embed \\[[p]]}}\nkey:\\: v\nTODO x';
  // RAW as text inside one block, every line escaped.
  const ESC = `${TEXT}\n\\- dash`;
  const children = (template: string, data: string) =>
    shape(renderClip(template, vars(data))[0].children);
  const turndown = (html: string) => {
    const container = document.createElement('div');
    container.innerHTML = html;
    return buildTurndownService().turndown(container);
  };

  // Logseq ends a fence at the next mark, whatever its char, length, indent or
  // text, so the lines after it are text. The closing mark is part of the block
  // that the splitter takes, and the lines after it are blocks of their own.
  it.each([
    ['tildes in backticks', '~~~', '~~~'],
    ['four spaces', '    ```', '    ```'],
    ['a tab', '\t```', '  ```'],
    ['two spaces and tildes', '  ~~~', '  ~~~'],
    ['an info string', '```js', '```js'],
    ['a longer mark', '`````', '`````'],
  ])('ends a fence at %s and escapes what follows', (_name, mark, written) => {
    const data = `\`\`\`\n${RAW}\n${mark}\n${RAW}\n\`\`\``;
    expect(children(NESTED, data)).toEqual([
      `\`\`\`\n${RAW}\n${written}`,
      TEXT,
      'dash',
      '```',
    ]);
  });

  it('does not split the lines of a fence, though a line starts with `- `', () => {
    expect(children(NESTED, `~~~\n${RAW}\n\n- more\n~~~\nafter`)).toEqual([
      `~~~\n${RAW}\n\n- more\n~~~`,
      'after',
    ]);
    // ``` ... ~~~ is one fence: the splitter takes both marks, the escaper leaves
    // the lines between them alone, the outline parser does not split them.
    expect(children(NESTED, '```\n~~~\n```\n- [[x]]\n~~~')).toEqual([
      '```\n~~~',
      '```\n- [[x]]\n~~~',
    ]);
  });

  it('escapes the lines of a fence that never closes', () => {
    expect(children(NESTED, `x\n\n\`\`\`\n${RAW}`)).toEqual(['x', '```', TEXT, 'dash']);
  });

  it.each([
    ['a key:: info string', '```k::'],
    ['a page link as the info string', '```[[p]]'],
    ['a tag as the info string', '```#tag'],
  ])('escapes the lines of a fence with %s', (_name, open) => {
    const [first, ...rest] = children(NESTED, `${open}\n${RAW}\n\`\`\`\n${RAW}\n\`\`\``);
    expect(first).toBe(`${escapeForLogseq(open, { context: 'block' })}\n${ESC}\n\`\`\``);
    expect(rest).toEqual([TEXT, 'dash', '```']);
  });

  it('splits a fence from the quote before it, which is then no longer swallowing it', () => {
    expect(children(NESTED, `> q\n\`\`\`\n${RAW}\n\`\`\``)).toEqual([
      '> q',
      `\`\`\`\n${RAW}\n\`\`\``,
    ]);
  });

  it('keeps plain code as it is, blank lines and list lines too', () => {
    expect(children(NESTED, `\`\`\`js\n${RAW}\n\n* b\n\`\`\`\nafter`)).toEqual([
      `\`\`\`js\n${RAW}\n\n* b\n\`\`\``,
      'after',
    ]);
  });

  // With text before `{{content}}` on its line, the content's first line is the
  // middle of a line: its mark is no mark. The marks pair as in the block.
  it.each([
    ['plain code', `\`\`\`js\n${RAW}\n\`\`\``, `Note: \`\`\`js\n${ESC}\n\`\`\``],
    [
      'tildes in backticks',
      `\`\`\`\n${RAW}\n~~~\n${RAW}\n\`\`\``,
      `Note: \`\`\`\n${ESC}\n~~~\n${RAW}\n\`\`\``,
    ],
    [
      'a second fence',
      `\`\`\`\n${RAW}\n\`\`\`js\n${RAW}\n\`\`\``,
      `Note: \`\`\`\n${ESC}\n\`\`\`js\n${RAW}\n\`\`\``,
    ],
    ['a quote', `> q\n\`\`\`\n${RAW}\n\`\`\``, `Note: > q\n\`\`\`\n${RAW}\n\`\`\``],
  ])('pairs the marks behind text of the template: %s', (_name, data, written) => {
    expect(children(PREFIXED, data)).toEqual([written]);
  });

  it('does not split a fence behind a bullet, nor leave its lines out of it', () => {
    // Top level: the content starts the block, its first mark is a mark.
    const [root] = renderClip('- {{content}}', vars(`\`\`\`js\n${RAW}\n\n- x\n\`\`\``));
    expect(root.children).toEqual([]);
    expect(root.content).toBe(`\`\`\`js\n${RAW}\n\n- x\n\`\`\``);
  });

  it.each([NESTED, PREFIXED])('keeps an alt text in its label (%j)', (template) => {
    const data = turndown(
      '<p><img alt="a](https://example.com/b.png) [[Page]] #tag\nTODO x" title="T #t" src="https://example.com/a.png"></p>',
    );
    const [block] = children(template, data) as string[];
    expect(block.replace(/^(?:Note:)? */, '')).toBe(
      '![a\\](https://example.com/b.png) \\[\\[Page\\]\\] \\#tag TODO x](https://example.com/a.png)',
    );
  });

  it.each([
    ['a dropped `\\[` before `[[`', 'a \\\\\\[[x]] and \\\\\\] \\[[y]]'],
    ['a dropped `\\]` before `(`', 'a\\\\\\[b]([[x]])'],
  ])('keeps %s from making a page link or a link', (_name, data) => {
    const expected = escapeForLogseq(data, { context: 'block' });
    expect(expected).not.toMatch(/(?<!\\)\[\[/);
    expect(children(NESTED, data)).toEqual([expected]);
    expect(children(PREFIXED, data)).toEqual([`Note: ${expected}`]);
  });
});

// A prefix that is only output of the template (`{{title}} `) can be empty, and
// then the content starts the block: its first line needs the escapes of a
// block start, like in a flat template (`'maybe'`, see `midLineOf`).
describe('renderClip, a prefix of template output before the content', () => {
  const text = (template: string, data: string, extra: Partial<ClipVars> = {}) =>
    renderClip(template, vars(data, extra))[0].content;

  // The title may be empty, so the content is escaped as a block start either
  // way, like in the flat template `{{title}} {{content}}`.
  it('escapes the first line with a title too, like a flat template', () => {
    expect(text('- {{title}} {{content}}', 'TODO x')).toBe('Sample \\TODO x');
    expect(text('- {{title}} {{content}}', 'key:: v')).toBe('Sample key:\\: v');
    for (const data of ['TODO x', 'key:: v', '- x', '# h']) {
      expect(text('- {{title}} {{content}}', data, { title: '' })).toBe(
        text('{{title}} {{content}}', data, { title: '' }),
      );
    }
  });

  it('escapes the first line when the title is empty', () => {
    const empty = { title: '' };
    expect(text('- {{title}} {{content}}', 'TODO x', empty)).toBe('\\TODO x');
    expect(text('- {{title}} {{content}}', 'key:: v', empty)).toBe('key:\\: v');
    expect(text('- {{title}} {{content}}', '- x', empty)).toBe('\\- x');
    expect(text('- {{title}} {{content}}', '# h', empty)).toBe('\\# h');
    expect(text('- {{title}} {{content}}', 'SCHEDULED: <2030-01-01 Tue>', empty)).toBe(
      '\\SCHEDULED: <2030-01-01 Tue>',
    );
  });

  it('keeps a fence one block, as the flat template does', () => {
    const data = '```\nTODO x\n```';
    const blocks = renderClip('- {{title}} {{content}}', vars(data, { title: '' }));
    expect(shape(blocks)).toEqual([data]);
    expect(blocks[0].content).toBe(text('{{title}} {{content}}', data, { title: '' }));
  });

  it('escapes the lines of a fence that never closes', () => {
    const [block] = renderClip('- {{title}} {{content}}', vars('```\nTODO x', { title: '' }));
    expect(block.children).toEqual([]);
    expect(block.content).toBe(
      renderClip('{{title}} {{content}}', vars('```\nTODO x', { title: '' }))[0].content,
    );
  });

  it.each([
    ['- {{date}} {{content}}'],
    ['- {% if title %}{{title}} {% endif %}{{content}}'],
    ['  - {{title}} {{content}}'],
  ])('does the same for %s', (template) => {
    const tpl = template.startsWith('  ') ? `- a\n${template}` : template;
    const [root] = renderClip(tpl, vars('TODO x\nkey:: v', { title: '', url: '' }));
    const block = root.children[0] ?? root;
    expect(block.content.split('\n')[0]).toMatch(/\\TODO x$/);
    expect(block.content).toContain('key:\\: v');
  });

  it('keeps text before the content as text', () => {
    expect(text('- Note: {{content}}', 'TODO x')).toBe('Note: TODO x');
  });
});
