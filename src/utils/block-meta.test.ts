import { describe, expect, it } from 'vitest';
import {
  parseBlockMeta,
  withoutPropertyLines,
  type TemplateProperty,
} from './block-meta';
import {
  renderClip,
  renderClipLiteral,
  type ClipBlock,
  type ClipVars,
  type LiteralBlock,
} from './clip-template';
import { BUILT_IN_TEMPLATES } from './default-templates';

const DATE = 'Aug 19th, 2021';

const vars = (extra: Partial<ClipVars> = {}): ClipVars => ({
  url: 'https://example.com/a',
  title: 'Sample',
  data: 'Selected text',
  preferredDateFormat: 'MMM do, yyyy',
  time: new Date(2021, 7, 19, 16, 30),
  ...extra,
});

/** All of `text` from the template. */
const all = (text: string) => '1'.repeat(text.length);

/** The mask of `text` where the pieces in `[...]` of `marked` are page text. */
const masked = (marked: string) => {
  let text = '';
  let literal = '';
  for (const part of marked.split(/(\[[^\]]*\])/)) {
    if (part.startsWith('[') && part.endsWith(']')) {
      text += part.slice(1, -1);
      literal += '0'.repeat(part.length - 2);
    } else {
      text += part;
      literal += '1'.repeat(part.length);
    }
  }
  return { text, literal };
};

const props = (properties: TemplateProperty[]) =>
  properties.map(({ key, value, kind }) => `${key}=${value}:${kind}`);

describe('parseBlockMeta', () => {
  it('reads the property lines after the first line', () => {
    const text = 'Title\nsource:: https://a.b/c\nread-on:: Aug 19th, 2021\nrating:: 5';
    const meta = parseBlockMeta(text, all(text), DATE);
    expect(props(meta.properties)).toEqual([
      'source=https://a.b/c:url',
      `read-on=${DATE}:date`,
      'rating=5:default',
    ]);
    expect(meta.properties.map((p) => p.line)).toEqual([1, 2, 3]);
    expect(meta.properties[1].date).toBe(DATE);
  });

  it('takes the journal link of the date as a date', () => {
    const text = `Title\nday:: [[${DATE}]]`;
    const [property] = parseBlockMeta(text, all(text), DATE).properties;
    expect(property).toMatchObject({ kind: 'date', date: DATE });
  });

  it('reads a block of properties only from its first line', () => {
    const text = 'type:: book\nauthor:: Someone';
    expect(props(parseBlockMeta(text, all(text), DATE).properties)).toEqual([
      'type=book:default',
      'author=Someone:default',
    ]);
  });

  it('stops at the first line that is not a property', () => {
    const text = 'Title\na:: 1\nbody text\nb:: 2';
    expect(props(parseBlockMeta(text, all(text), DATE).properties)).toEqual(['a=1:default']);
  });

  it('skips empty values and the keys Logseq keeps for itself', () => {
    const text = 'Title\nempty::\ntags:: x\nid:: 123\nalias:: y\nok:: yes';
    expect(props(parseBlockMeta(text, all(text), DATE).properties)).toEqual(['ok=yes:default']);
  });

  it('reads no property inside a fence', () => {
    const text = '```\nkey:: value\n```';
    expect(parseBlockMeta(text, all(text), DATE).properties).toEqual([]);
  });

  it('never takes a key or `::` from page text', () => {
    const { text, literal } = masked('Title\n[evil]:: x\n[a:: b]');
    expect(parseBlockMeta(text, literal, DATE).properties).toEqual([]);
  });

  it('takes a value that has page text, but not as a date', () => {
    const { text, literal } = masked(`Title\nsource:: [https://x.y/p]\nwhen:: [${DATE}]`);
    expect(props(parseBlockMeta(text, literal, DATE).properties)).toEqual([
      'source=https://x.y/p:url',
      `when=${DATE}:default`,
    ]);
  });

  it('reads tags of the template text', () => {
    const text = '#Clip [t](https://a.b/#frag) #[[Read Later]] word#no `#code`';
    expect(parseBlockMeta(text, all(text), DATE).tags).toEqual(['Clip', 'Read Later']);
  });

  it('reads tags on later lines, not in property lines or fences', () => {
    const text = 'Title\nkey:: #x\nmore #Two\n```\n#y\n```\nend #Three.';
    expect(parseBlockMeta(text, all(text), DATE).tags).toEqual(['Two', 'Three']);
  });

  it('never takes a tag from page text', () => {
    const { text, literal } = masked('#[Evil] [#x] #Real');
    expect(parseBlockMeta(text, literal, DATE).tags).toEqual(['Real']);
  });
});

describe('withoutPropertyLines', () => {
  it('drops the lines of the properties it is given', () => {
    expect(withoutPropertyLines('T\na:: 1\nb:: 2\nbody', [{ line: 1 }, { line: 2 }])).toBe(
      'T\nbody',
    );
    expect(withoutPropertyLines('T\na:: 1', [])).toBe('T\na:: 1');
  });
});

/** Every block of a tree, depth first. */
const flatten = <T extends { children: T[] }>(blocks: T[]): T[] =>
  blocks.flatMap((block) => [block, ...flatten(block.children)]);

const metaOf = (template: string, extra: Partial<ClipVars> = {}) =>
  flatten(renderClipLiteral(template, vars(extra))).map((block: LiteralBlock) => ({
    content: block.content,
    ...parseBlockMeta(block.content, block.literal, DATE),
  }));

describe('renderClipLiteral', () => {
  it('has one mark per character of each block', () => {
    for (const block of flatten(
      renderClipLiteral('- [{{title}}]({{url}}) #Clip\n  source:: {{url}}\n  - {{content}}', vars()),
    )) {
      expect(block.literal).toHaveLength(block.content.length);
    }
  });

  it('marks the page values and the note as page text', () => {
    const [root] = renderClipLiteral('- {{title}} is {{content}} {{note}}', vars({ note: 'mine' }));
    expect(root.content).toBe('Sample is Selected text mine');
    expect(root.literal).toBe(
      '0'.repeat(6) + '1'.repeat(4) + '0'.repeat(13) + '1' + '0'.repeat(4),
    );
  });

  it('reads tags and properties on the root and on a child', () => {
    const meta = metaOf(
      '- [{{title}}]({{url}}) #Clip #[[Read Later]]\n  source:: {{url}}\n  read-on:: {{date}}\n  - Quote #Quote\n    kind:: quote\n    - {{content}}',
    );
    expect(meta[0].tags).toEqual(['Clip', 'Read Later']);
    expect(props(meta[0].properties)).toEqual([
      'source=https://example.com/a:url',
      `read-on=${DATE}:date`,
    ]);
    expect(meta[1].tags).toEqual(['Quote']);
    expect(props(meta[1].properties)).toEqual(['kind=quote:default']);
    expect(meta[2]).toMatchObject({ content: 'Selected text', tags: [], properties: [] });
  });

  it('reads the properties of a flat template', () => {
    const meta = metaOf('[{{title}}]({{url}})\nsource:: {{url}}\n{{content}}');
    expect(props(meta[0].properties)).toEqual(['source=https://example.com/a:url']);
  });

  it('makes no tag, property or page of hostile page text', () => {
    const hostile = 'x #evil a:: b [[page]]\nkey:: value\n#[[Tag]]\n- c:: d';
    const meta = metaOf(
      '- {{title}} #Clip\n  source:: {{url}}\n  - {{content}}\n  - Quote: {{content}}\n  - {{note}}',
      {
        title: 'x #evil a:: b [[page]] #[[Tag]]',
        data: hostile,
        url: 'https://e.x/#evil?a:: b',
        note: 'note #mine\nk:: v',
      },
    );
    const tags = meta.flatMap((m) => m.tags);
    const keys = meta.flatMap((m) => m.properties.map((p) => p.key));
    expect(tags).toEqual(['Clip']);
    expect(keys).toEqual(['source']);
    // The page text is escaped as it always was: no `[[page]]`, no `key::`.
    for (const { content } of meta) {
      expect(content).not.toMatch(/(^|[^\\])\[\[page\]\]/);
      expect(content).not.toMatch(/^(?:key|a|c):: /m);
    }
  });

  it('never makes a key or a tag of a page value placed there by the template', () => {
    const meta = metaOf('- #{{title}} x\n  {{title}}:: y\n  z:: {{title}}', { title: 'Name' });
    expect(meta[0].tags).toEqual([]);
    // `{{title}}:: y` is in the run of property lines but not the template's.
    expect(props(meta[0].properties)).toEqual(['z=Name:default']);
  });

  it('reads no property below text a multi-line page value put after the first line', () => {
    const meta = metaOf('- {{title}}\n  source:: {{url}}', { title: 'one\ntwo' });
    expect(meta[0].properties).toEqual([]);
  });
});

describe('renderClip', () => {
  const strip = (blocks: ClipBlock[]): unknown =>
    blocks.map(({ content, children, note }) => ({
      content,
      children: strip(children),
      ...(note && { note }),
    }));

  it('renders the same text as before: the meta never changes the blocks', () => {
    const templates = [
      ...BUILT_IN_TEMPLATES.map((t) => t.content),
      '- [{{title}}]({{url}}) #Clip\n  source:: {{url}}\n  read-on:: [[{{date}}]]\n  - {{content}}\n  - {{note}}',
    ];
    for (const template of templates) {
      for (const extra of [{}, { data: '' }, { note: 'n' }, { data: 'a\n\n- b\n- c' }]) {
        const literal = renderClipLiteral(template, vars(extra));
        expect(strip(renderClip(template, vars(extra)))).toEqual(strip(literal));
      }
    }
  });

  it('puts the template properties on their block', () => {
    const [root] = renderClip(
      '- [{{title}}]({{url}})\n  source:: {{url}}\n  - Quote\n    kind:: quote',
      vars(),
    );
    expect(props(root.properties ?? [])).toEqual(['source=https://example.com/a:url']);
    expect(props(root.children[0].properties ?? [])).toEqual(['kind=quote:default']);
    expect('properties' in renderClip('- {{title}}', vars())[0]).toBe(false);
  });
});
