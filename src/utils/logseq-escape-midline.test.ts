import { describe, expect, it } from 'vitest';
import { blockRending, escapeForLogseq } from './utils';
import { DEFAULT_TEMPLATE_CONTENT } from './default-templates';

const at = (text: string, midLine: 'text' | 'quote' | 'maybe' | false) =>
  escapeForLogseq(text, { context: 'block', midLine });

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

// Page text with a fence on its first line and live syntax inside it.
const FENCED = '```js\n[[p]] #t {{embed [[e]]}}\nk:: v\n- x\n```\nend [[q]]';
const TILDES = '~~~\n[[p]] #t\n~~~';

describe('escapeForLogseq, text behind other text on its line', () => {
  it('writes the same text without midLine as before', () => {
    expect(at(FENCED, false)).toBe(
      '```js\n[[p]] #t {{embed [[e]]}}\nk:: v\n- x\n```\nend \\[[q]]',
    );
    expect(escapeForLogseq(FENCED, { context: 'block' })).toBe(at(FENCED, false));
  });

  it.each(['text', 'quote'] as const)(
    'a fence mark on the first line is no fence (%s)',
    (midLine) => {
      expect(at(FENCED, midLine)).toBe(
        '```js\n\\[[p]] \\#t \\{{embed \\[[e]]}}\nk:\\: v\n\\- x\n```\nend \\[[q]]',
      );
      expect(at(TILDES, midLine)).toBe('~~~\n\\[[p]] \\#t\n~~~');
    },
  );

  it('a fence that opens on a later line is still code', () => {
    const text = 'intro\n\n```js\n[[p]] #t\n```\n\nend [[q]]';
    expect(at(text, 'text')).toBe('intro\n\n```js\n[[p]] #t\n```\n\nend \\[[q]]');
    // Behind a quote it opens after the blank line only.
    expect(at(text, 'quote')).toBe('intro\n\n```js\n[[p]] #t\n```\n\nend \\[[q]]');
  });

  it('behind a quote a mark before the blank line pairs with nothing', () => {
    const text = 'intro\n```js\n[[p]] #t\n```\nend';
    expect(at(text, 'quote')).toBe('intro\n```js\n\\[[p]] \\#t\n```\nend');
    expect(at(text, 'text')).toBe('intro\n```js\n[[p]] #t\n```\nend');
  });

  it.each(['text', 'quote'] as const)(
    'the first line has no line start rules (%s)',
    (midLine) => {
      for (const line of [
        'TODO x',
        'DONE x',
        '- x',
        '# heading',
        'key:: v',
        ':LOGBOOK:',
        ':END:',
      ]) {
        expect(at(`${line}\nmore`, midLine)).toBe(`${line}\nmore`);
      }
    },
  );

  it.each(['text', 'quote'] as const)(
    'the first line keeps the rules that hold anywhere (%s)',
    (midLine) => {
      expect(at('#tag [[p]] {{embed [[e]]}}', midLine)).toBe(
        '\\#tag \\[[p]] \\{{embed \\[[e]]}}',
      );
      expect(at('SCHEDULED: <2030-01-01 Tue>', midLine)).toBe(
        '\\SCHEDULED: <2030-01-01 Tue>',
      );
      expect(at('a <b>x</b> @@html: x@@', midLine)).toBe(
        'a \\<b>x\\</b> \\@@html: x@@',
      );
    },
  );

  it.each(['text', 'quote', 'maybe'] as const)(
    'the lines after the first are escaped as before (%s)',
    (midLine) => {
      expect(at('a\nTODO x\n- y\nk:: v\n# h', midLine)).toBe(
        'a\nTODO x\n\\- y\nk:\\: v\n\\# h',
      );
    },
  );

  it('maybe: no line is code and the first line is a line start', () => {
    expect(at(FENCED, 'maybe')).toBe(
      '```js\n\\[[p]] \\#t \\{{embed \\[[e]]}}\nk:\\: v\n\\- x\n```\nend \\[[q]]',
    );
    expect(at('TODO x\n- y', 'maybe')).toBe('\\TODO x\n\\- y');
    expect(at('intro\n\n```js\n[[p]]\n```', 'maybe')).toBe(
      'intro\n\n```js\n\\[[p]]\n```',
    );
  });

  it('writes an empty text as it is', () => {
    expect(at('', 'text')).toBe('');
    expect(at('', 'quote')).toBe('');
  });
});

describe('blockRending, {{content}} behind other text', () => {
  it.each([
    ['> {{content}}', '> '],
    ['Quote: {{content}}', 'Quote: '],
    ['#[[Clip]] {{content}}', '#[[Clip]] '],
    ['  > {{content}}', '> '],
    ['{{date}} {{content}}', 'Nov 16th, 2026 '],
    ['x{% comment %}c{% endcomment %} {{content}}', 'x '],
    ['> {{ content }}', '> '],
    ['Quote: {{- content -}}', 'Quote:'],
  ])('escapes the first line of the page text for %j', (template, prefix) => {
    expect(render(template, { data: FENCED })).toBe(
      `${prefix}${at(FENCED, template.includes('> ') ? 'quote' : 'text')}`.trim(),
    );
  });

  it('writes no live syntax behind text, for every hostile first line', () => {
    for (const template of ['> {{content}}', 'Quote: {{content}}']) {
      for (const data of [FENCED, TILDES, '```\n[[p]]\n```', '```\n[[p]] #t\nk:: v']) {
        const lines = render(template, { data }).split('\n').slice(1);
        for (const line of lines) {
          // Every page link, tag and macro that is left has a backslash.
          expect(line).not.toMatch(/(?<!\\)\[\[|(?<!\\)#\w|(?<!\\)\{\{/);
        }
      }
    }
  });

  it('keeps the line start rules for a first line that starts the line', () => {
    expect(render('{{content}}', { data: 'TODO x\n- y' })).toBe('\\TODO x\n\\- y');
    expect(render('{% if url %}{% endif %}{{content}}', { data: 'TODO x' })).toBe(
      '\\TODO x',
    );
    // The filter runs first, the escape last: `todo` becomes a task marker only
    // after `upcase`, and the page text must not be one.
    expect(render('{{ content | upcase }}', { data: 'todo x' })).toBe('\\TODO X');
  });

  it('writes the first line of a template that has the text behind a variable, whatever it holds', () => {
    // `{{title}}` can be empty: the content may start the block then.
    expect(render('{{title}} {{content}}', { title: 'T', data: FENCED })).toBe(
      `T ${at(FENCED, 'maybe')}`,
    );
    expect(render('{{title}} {{content}}', { data: 'TODO x\n```\n[[p]]\n```' })).toBe(
      '\\TODO x\n```\n\\[[p]]\n```',
    );
  });

  it('uses the right escape for each place of {{content}}', () => {
    const data = 'TODO x\n- y';
    expect(render('{{content}}\n> {{content}}\nQuote: {{content}}', { data })).toBe(
      '\\TODO x\n\\- y\n> TODO x\n\\- y\nQuote: TODO x\n\\- y',
    );
  });

  it('leaves the built-in Clip template as it was', () => {
    const page = {
      url: 'https://example.com/a',
      title: 'Title #t',
      data: FENCED,
    };
    expect(render(DEFAULT_TEMPLATE_CONTENT, page)).toBe(
      `#[[Clip]] [Title \\#t](https://example.com/a)\n${at(FENCED, false)}`,
    );
    expect(render(DEFAULT_TEMPLATE_CONTENT, page)).toBe(
      '#[[Clip]] [Title \\#t](https://example.com/a)\n```js\n[[p]] #t {{embed [[e]]}}\nk:: v\n- x\n```\nend \\[[q]]',
    );
  });
});
