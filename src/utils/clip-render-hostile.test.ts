import { describe, expect, it, vi } from 'vitest';
import { blockRending, escapeForLogseq } from './utils';
import { renderWithPageValues } from './logseq-format';
import { renderClip, type ClipBlock } from './clip-template';
import { DEFAULT_TEMPLATE_CONTENT } from './default-templates';

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

/** Page text that is live in Logseq when it is not escaped. */
const CODE =
  '[[p]] #t {{embed [[p]]}} key:: v ((b3f8a1c2-0000-4000-8000-000000000000))';
const FENCED = `\`\`\`js\n${CODE}\n\`\`\`\nTODO x\n- y\nend [[q]]`;
const HOSTILE = '[[p]] #t';
const PAGE = { title: HOSTILE, url: `https://e.com/${HOSTILE}`, data: FENCED };

/**
 * The lines of `output` that Logseq reads as text and not as code, joined: a
 * fence is code from its mark to the next mark, when it starts a line.
 */
const textLines = (output: string) => {
  const lines = output.split('\n');
  const marks = lines.flatMap((l, i) =>
    /^\s{0,3}(```|~~~)/.test(l) ? [i] : [],
  );
  const code = new Set<number>();
  for (let k = 0; k + 1 < marks.length; k += 2) {
    for (let i = marks[k] + 1; i < marks[k + 1]; i++) code.add(i);
  }
  return lines.filter((_, i) => !code.has(i));
};

/** Assert that the page text of `output` is literal text, as far as one can see. */
const expectInert = (
  output: string,
  allowed: string[] = [],
  noCode = false,
) => {
  let text = (noCode ? output.split('\n') : textLines(output)).join('\n');
  for (const part of allowed) text = text.split(part).join('');
  expect(text).not.toMatch(/(?<!\\)\[\[/);
  expect(text).not.toMatch(/(?<!\\)#t\b/i);
  expect(text).not.toMatch(/(?<!\\)\{\{/);
  expect(text).not.toMatch(/(?<!\\)\(\(/);
  expect(text).not.toMatch(/^\s*[\w-]+::/m);
  expect(text).not.toMatch(/^- /m);
  // Only the first line of a block can be a task.
  expect(output.trim()).not.toMatch(/^(TODO|DONE) /);
};

describe('where a value goes is read from the rendered text', () => {
  const hostile: [string, string, string[]?][] = [
    ['trim before content', 'Note: {%- if true -%}{%- endif -%}\n{{content}}'],
    ['trim tag', 'Note:\n{%- assign x = 1 -%}\n{{content}}'],
    ['trimmed output tag', 'Note:\n{{- content}}'],
    ['trim on both sides', 'Note: {{- content -}}'],
    ['assign', '{% assign u = url %}x {{u}}'],
    ['capture', '{% capture c %}{{content}}{% endcapture %}> {{c}}'],
    ['upcase', '{{ content | upcase }}'],
    ['append', '{{ url | append: " #t" }}', [' #t']],
    ['append to content', '{{ content | append: " #t" }}', [' #t']],
    ['title and url mid-line', 'x {{ title | append: "." }} {{ url }}'],
    ['filter argument', '{{ "x" | append: url }}\n{{ "y" | append: title }}'],
    ['url without a link', '{{-url}}\n{{- title}}'],
    ['title as link text, url outside', '[{{title}}]({{content}})'],
    ['url as label', '[{{url}}]({{title}})'],
    ['if', '{% if content %}Note: {% endif %}{{content}}'],
    ['unless', '{% unless title == "" %}> {% endunless %}{{content}}'],
  ];

  it.each(hostile)('%s: no live syntax', (_name, template, allowed = []) => {
    expectInert(render(template, PAGE), allowed);
  });

  it('a link keeps the URL, the text around it is escaped', () => {
    const page = { ...PAGE, url: 'https://e.com/a#t' };
    for (const template of [
      '[Read: {{title}}]({{url}})',
      '[{{title}}]({{url}}{{title}})',
    ]) {
      expectInert(render(template, page), ['https://e.com/a#t']);
    }
  });

  it('a fence behind text on the output line is no fence', () => {
    // The source says the content starts a line, the output says it does not.
    const out = render('Note: {%- if true -%}{%- endif -%}\n{{content}}', PAGE);
    expect(out).toBe('Note:' + escapeText(FENCED, 'text'));
  });

  it('a value that is printed in several places is written for each', () => {
    const out = render('{{content}}\n> {{content}}\nQuote: {{content}}', {
      data: 'TODO x\n- y',
    });
    expect(out).toBe('\\TODO x\n\\- y\n> TODO x\n\\- y\nQuote: TODO x\n\\- y');
  });

  it('title and url are a link label and destination only where the output has one', () => {
    const page = { title: 'a #t', url: 'https://e.com/a b#c', data: '' };
    expect(render('[{{title}}]({{url}})', page)).toBe(
      '[a \\#t](https://e.com/a%20b#c)',
    );
    expect(render('{% assign u = url %}[{{title}}]({{u}})', page)).toBe(
      '[a \\#t](https://e.com/a%20b#c)',
    );
    expect(render('[{{ title }}]( {{- url -}} )', page)).toBe(
      '[a \\#t](https://e.com/a%20b#c)',
    );
    // Not a link: block text.
    expect(render('{{url}}', page)).toBe('https://e.com/a b\\#c');
    expect(render('{% assign u = url %}x {{u}}', page)).toBe(
      'x https://e.com/a b\\#c',
    );
    expect(render('[x {{title}}]({{url}})', page)).toBe(
      '[x a \\#t](https://e.com/a%20b#c)',
    );
  });
});

/** The block escape the output of a value gets at its place. */
function escapeText(text: string, midLine: 'text' | 'quote' | 'maybe' | false) {
  return escapeForLogseq(text, { context: 'block', midLine });
}

describe('a filter must not hand the page text back unescaped', () => {
  // These filters take the marks of the value apart.
  const filters: [string, string, boolean?][] = [
    ['split and join', "{{ content | split: ' ' | join: ' ' }}", true],
    ['slice', '{{ content | slice: 0, 50 }}'],
    ['slice from the middle', '{{ content | slice: 7, 100 }}'],
    ['truncate', '{{ content | truncate: 20 }}'],
    ['replace', "{{ content | replace: 'a', 'b' }}"],
    ['remove', "{{ content | remove: 'e' }}"],
    [
      'capture and upcase',
      '{% capture c %}{{content}}{% endcapture %}{{ c | upcase }}',
    ],
    [
      'for loop over split',
      "{% for w in content | split: ' ' %}{{w}} {% endfor %}",
    ],
    ['split by line', "{{ content | split: '\n' | join: '\n' }}", true],
    [
      'first of split',
      "{{ content | split: ' ' | first }}\n{{ content | split: ' ' | last }}",
      true,
    ],
    [
      'array index',
      "{% assign a = content | split: ' ' %}{{ a[1] }} {{ a[2] }} {{ a[3] }}",
      true,
    ],
    ['base64', '{{ content | base64_encode }}', true],
    ['url_encode', '{{ content | url_encode | url_decode }}'],
    // Filters that undo escapes: the escape is the last step.
    ['remove backslash', "{{ content | remove: '\\\\' }}"],
    ['replace backslash', "{{ content | replace: '\\\\', '' }}"],
    ['url_decode', '{{ content | url_decode }}'],
    ['strip_html', '{{ content | strip_html }}'],
    [
      'title and url through them',
      "{{ title | remove: '\\\\' }}\n{{ url | url_decode | strip_html }}",
    ],
    ['sort of lines', "{{ content | split: '\n' | sort | join: '\n' }}", true],
    [
      'title through split',
      "{{ title | split: ' ' | join: ' ' }}\n{{ url | slice: 0, 30 }}",
      true,
    ],
  ];

  // `strict`: the filter took the marks off, the page text is written as text
  // with the strictest escapes: no fence is code.
  it.each(filters)('%s: everything is escaped', (_name, template, strict) => {
    expectInert(render(template, PAGE), [], !!strict);
  });

  it('a mark that a filter cut is not printed, and nothing is left unescaped', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const out = render(
      '{% for i in (0..60) %}{{ content | slice: i, 1 }}{% endfor %}',
      PAGE,
    );
    expect(out).not.toMatch(/~\d{8}/);
    expectInert(out.replace(/^```.*$/gm, ''));
    warn.mockRestore();
  });

  it('page text shows up outside its marks: the template renders again, escaped', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // Single characters of the page text, put together by the template.
    const out = render('{% for i in (0..80) %}{{ content[i] }}{% endfor %}', {
      data: '[[page]] #tag key:: v and more text',
    });
    expect(out).not.toMatch(/~\d{8}/);
    expect(out).not.toMatch(/(?<!\\)\[\[/);
    warn.mockRestore();
  });
});

describe('when the marks cannot be trusted at all', () => {
  it('the template cannot take the page text apart, character by character', () => {
    // `content[i]` is nothing: a page value has no characters to read.
    expect(
      render('Note: {% for i in (0..60) %}{{ content[i] }}{% endfor %}', PAGE),
    ).toBe('Note:');
  });

  it('a template that fails with the marks still renders without the page values', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(
      render('x {{ content | base64_encode | base64_decode }}', PAGE),
    ).toBe('x');
    warn.mockRestore();
  });

  it('a template that is wrong still throws', () => {
    expect(() => render('{{ content | ', PAGE)).toThrow();
  });
});

describe('a page value has nothing to read but its text and its size', () => {
  it.each([
    '{{ content.text }}',
    '{{ content.marked }}',
    '{{ content.valueOf.call }}',
    '{{ title.text }}',
    '{{ title.marked }}',
    "{{ content | map: 'text' | join }}",
    "{{ title | map: 'marked' | join }}",
    '{{ content.first }}{{ content.last }}{{ content[0] }}',
    '{{ content.to_liquid }}',
  ])('%s prints no page text', (template) => {
    const out = render(`x ${template}`, PAGE);
    expect(out).not.toContain('hostag');
    expect(out).not.toMatch(/\[\[p\]\]|#t\b|TODO|~\d{8}/);
  });

  it.each([
    '{% for c in content %}{{c}}{% endfor %}',
    '{% for c in title %}{{c}}{% endfor %}',
  ])('%s goes through the marks: escaped', (template) => {
    // The loop gets the value itself, once.
    expectInert(render(`x ${template}`, PAGE));
  });

  it('size is the length of the page text', () => {
    expect(render('{{ content.size }}', { data: 'abcd' })).toBe('4');
    expect(render('{{ title.size }}', { title: '#a/b', data: '' })).toBe('4');
  });

  it('a short value that is printed outside its marks makes the template render again', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // A title of four characters, put in the output by something that took the
    // marks off (here a function of the context stands for such a filter).
    const out = renderWithPageValues(
      'a {{ title }} b {{ leak }}',
      { leak: () => '#a/b' },
      { title: '#a/b' },
      () => 'ESCAPED',
    );
    expect(warn).toHaveBeenCalled();
    // The second pass is escaped last, then the last resort has no value.
    expect(out).not.toContain('ESCAPED#');
    warn.mockRestore();
  });
});

describe('the ordinary templates write what they always did', () => {
  const page = {
    url: 'https://example.com/a/b?c=d#e',
    title: 'Plain title',
    data: 'Some *text*\n\n*   one\n*   two',
  };
  const odd = {
    url: 'https://e.com/a(b)#c',
    title: 'Big #news [1]',
    data: 'TODO one\n- y\nkey:: v\n[[p]] #t {{embed [[p]]}}',
  };

  it.each([
    [
      DEFAULT_TEMPLATE_CONTENT,
      page,
      '#[[Clip]] [Plain title](https://example.com/a/b?c=d#e)\nSome *text*\n\n*   one\n*   two',
    ],
    [
      DEFAULT_TEMPLATE_CONTENT,
      odd,
      '#[[Clip]] [Big \\#news \\[1\\]](https://e.com/a(b)#c)\n\\TODO one\n\\- y\nkey:\\: v\n\\[[p]] \\#t \\{{embed \\[[p]]}}',
    ],
    [
      'TODO [{{title}}]({{url}})\n{{content}}',
      odd,
      'TODO [Big \\#news \\[1\\]](https://e.com/a(b)#c)\n\\TODO one\n\\- y\nkey:\\: v\n\\[[p]] \\#t \\{{embed \\[[p]]}}',
    ],
    [
      '{{content}}',
      odd,
      '\\TODO one\n\\- y\nkey:\\: v\n\\[[p]] \\#t \\{{embed \\[[p]]}}',
    ],
    [
      '{{title}}\n{{url}}\n{{content}}',
      odd,
      'Big \\#news [1]\nhttps://e.com/a(b)\\#c\n\\TODO one\n\\- y\nkey:\\: v\n\\[[p]] \\#t \\{{embed \\[[p]]}}',
    ],
    [
      '> {{content}}',
      odd,
      '> TODO one\n\\- y\nkey:\\: v\n\\[[p]] \\#t \\{{embed \\[[p]]}}',
    ],
    [
      '{{date}} {{content}}',
      odd,
      'Nov 16th, 2026 \\TODO one\n\\- y\nkey:\\: v\n\\[[p]] \\#t \\{{embed \\[[p]]}}',
    ],
    [
      '{{date}}: {{content}}',
      page,
      'Nov 16th, 2026: Some *text*\n\n*   one\n*   two',
    ],
    ['{{title}} {{content}}', { data: 'TODO x' }, '\\TODO x'],
    ['{{title}} {{content}}', { title: 'T', data: 'TODO x' }, 'T \\TODO x'],
    ['  {{content}}', { data: '```js\n[[p]]\n```' }, '```js\n[[p]]\n```'],
    [
      '{{ title | upcase }} / {{ title | strip }}',
      { title: ' ab ', data: '' },
      'AB  / ab',
    ],
    [
      '{{time}} [[{{date}}]] {{ dt | date: "%Y" }}',
      page,
      '10:30 [[Nov 16th, 2026]] 2026',
    ],
    ['{{content.size}} {{ content | size }}', { data: 'abc' }, '3 3'],
    ['{% if title %}{{title}}{% else %}none{% endif %}', { data: '' }, 'none'],
    ['{{ title | default: "none" }}', { title: '', data: '' }, 'none'],
  ])('%j', (template, p, expected) => {
    expect(render(template, p)).toBe(expected);
  });
});

// The same hostile templates in an outline template: every block that comes out
// is checked on its own, since each one is the start of a Logseq block.
describe('hostile templates in an outline template', () => {
  const flatten = (blocks: ClipBlock[]): string[] =>
    blocks.flatMap((b) => [b.content, ...flatten(b.children)]);
  const renderTree = (template: string, page = PAGE) =>
    flatten(
      renderClip(template, {
        ...page,
        preferredDateFormat: 'MMM do, yyyy',
        time: new Date('2026-11-16T10:30:00'),
      }),
    );

  const templates: [string, string, boolean?][] = [
    [
      'trim before content',
      '- Note: {%- if true -%}{%- endif -%}\n  - {{content}}',
    ],
    ['trim, content on the bullet line', '- A\n  - Note:\n{{- content}}'],
    ['trimmed output', '- A\n  - Note: {{- content -}}'],
    ['assign', '- {% assign u = url %}x {{u}}\n  - {{content}}'],
    ['capture', '- A\n  - {% capture c %}{{content}}{% endcapture %}> {{c}}'],
    [
      'capture on a bullet',
      '- A\n  - {% capture c %}{{content}}{% endcapture %}{{c}}',
    ],
    ['upcase', '- A\n  - {{ content | upcase }}\n  - {{ title | upcase }}'],
    [
      'append',
      "- A\n  - {{ url | append: ' tail' }}\n  - {{ content | append: ' tail' }}",
    ],
    ['title and url as text', '- {{title}} {{url}}\n  - {{content}}'],
    ['empty title in front', '- {{title}} {{content}}'],
    [
      'property value',
      '- A\n  - key:: {{url | append: " x"}}\n  - {{content}}',
    ],
    ['split and join', "- A\n  - {{ content | split: ' ' | join: ' ' }}", true],
    ['slice', '- A\n  - {{ content | slice: 0, 50 }}'],
    ['truncate', '- A\n  - {{ content | truncate: 20 }}'],
    ['replace', "- A\n  - {{ content | replace: 'a', 'b' }}"],
    ['remove backslash', "- A\n  - {{ content | remove: '\\\\' }}"],
    ['url_decode', '- A\n  - {{ content | url_decode }}'],
    ['strip_html', '- A\n  - {{ content | strip_html }}'],
    [
      'for loop',
      "- A\n  - {% for w in content | split: ' ' %}{{w}} {% endfor %}",
    ],
    ['first of split', "- A\n  - {{ content | split: ' ' | first }}", true],
  ];

  it.each(templates)(
    '%s: no live syntax in any block',
    (_name, template, strict) => {
      const page = template.includes('{{title}} {{content}}')
        ? { ...PAGE, title: '' }
        : PAGE;
      for (const block of renderTree(template, page)) {
        expectInert(block, ['https://e.com/', 'key:: '], !!strict);
      }
    },
  );

  it('a block of the content is escaped as the start of a block', () => {
    expect(renderTree('- A\n  - {{content}}', { ...PAGE, title: 'T' })).toEqual(
      ['A', '```js\n' + CODE + '\n```', '\\TODO x', 'y', 'end \\[[q]]'],
    );
  });
});
