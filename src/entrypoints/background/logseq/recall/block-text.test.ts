import { describe, expect, test } from 'vitest';
import { parseBlockText, truncateSegments } from './block-text';

const UUID = '6720a1b2-0000-4000-8000-000000000001';
const UUID2 = '6aec196f-1a90-4a15-8222-017a04658f50';

const joined = (p: { segments: { value: string }[] }) =>
  p.segments.map((s) => s.value).join('');

describe('parseBlockText', () => {
  test('page references and tags become segments', () => {
    const p = parseBlockText('Notes on [[Another Page]] with #research and #[[multi word]]');
    expect(p.text).toBe('Notes on Another Page with #research and #multi word');
    expect(p.segments).toEqual([
      { kind: 'text', value: 'Notes on ' },
      { kind: 'ref', value: 'Another Page' },
      { kind: 'text', value: ' with ' },
      { kind: 'tag', value: '#research' },
      { kind: 'text', value: ' and ' },
      { kind: 'tag', value: '#multi word' },
    ]);
    expect(p.unresolved).toEqual([]);
  });

  test('block references use the lookup, else a placeholder', () => {
    const raw = `quoting ((${UUID}))`;
    expect(
      parseBlockText(raw, { lookup: () => 'the target' }).segments,
    ).toEqual([
      { kind: 'text', value: 'quoting ' },
      { kind: 'ref', value: 'the target' },
    ]);
    const unresolved = parseBlockText(raw);
    expect(unresolved.text).toBe('quoting [block]');
    expect(unresolved.unresolved).toEqual([{ kind: 'block', uuid: UUID }]);
  });

  test('DB [[uuid]] / #[[uuid]] references are looked up as pages', () => {
    const lookup = ({ uuid }: { uuid: string }) =>
      uuid === UUID2 ? 'Another Page' : undefined;
    const p = parseBlockText(`about [[${UUID2}]] #[[${UUID}]]`, { lookup });
    expect(p.text).toBe('about Another Page #[page]');
    expect(p.unresolved).toEqual([{ kind: 'page', uuid: UUID }]);
  });

  test('a # inside a word or URL is not a tag, trailing punctuation is not part of it', () => {
    const p = parseBlockText('see https://x.com/a#frag and issue#3, then #todo.');
    expect(p.segments.filter((s) => s.kind === 'tag')).toEqual([
      { kind: 'tag', value: '#todo' },
    ]);
    expect(joined(p)).toBe(p.text);
    expect(p.text).toBe('see https://x.com/a#frag and issue#3, then #todo.');
  });

  test('properties, SCHEDULED, LOGBOOK and macros are removed', () => {
    const raw = [
      'TODO Write the [#A] report',
      'status:: draft',
      'SCHEDULED: <2030-01-01 Tue>',
      ':LOGBOOK:',
      'CLOCK: [2024-01-01 Mon 10:00]--[2024-01-01 Mon 11:00] =>  01:00:00',
      ':END:',
      '{{renderer :wordcount}}',
    ].join('\n');
    const p = parseBlockText(raw, { marker: 'TODO' });
    expect(p.text).toBe('Write the report');
    expect(p.task).toEqual({ marker: 'TODO', done: false });
  });

  test('a leading marker is a task even without the marker option', () => {
    expect(parseBlockText('DONE ship it').task).toEqual({ marker: 'DONE', done: true });
    expect(parseBlockText('CANCELED old idea').task?.done).toBe(true);
    expect(parseBlockText('NOW working').task).toEqual({ marker: 'NOW', done: false });
    expect(parseBlockText('TODOS list').task).toBeUndefined();
  });

  test('the DB status marker comes from the option', () => {
    const p = parseBlockText('Recallprobe review finished', { marker: 'done' });
    expect(p.task).toEqual({ marker: 'DONE', done: true });
    expect(p.text).toBe('Recallprobe review finished');
  });

  test('images become a placeholder, links keep their label, markup is stripped', () => {
    const p = parseBlockText(
      '## Shot ![alt](../assets/a.png){:height 10} and **bold** _it_ ~~old~~ ==hi== ^^mark^^ `code` [site](https://x.com) [label]([[Page]])',
    );
    expect(p.text).toBe('Shot [image] and bold it old hi mark code site label');
  });

  test('snake_case and URLs keep their underscores and asterisks', () => {
    expect(parseBlockText('my_var_name and 2*3*4').text).toBe('my_var_name and 2*3*4');
  });

  test('search highlight markers are removed', () => {
    expect(parseBlockText('$pfts_2lqh>$Recall$<pfts_2lqh$ notes').text).toBe('Recall notes');
  });

  test('whitespace collapses, segments join to the text', () => {
    const p = parseBlockText('  first line\n\n  second [[Page]]  \n third  ');
    expect(p.text).toBe('first line second Page third');
    expect(joined(p)).toBe(p.text);
  });

  test('a block of properties only is empty', () => {
    const p = parseBlockText('recallkind:: container\ncollapsed:: true');
    expect(p.text).toBe('');
    expect(p.segments).toEqual([]);
  });

  test('null and empty input', () => {
    expect(parseBlockText(undefined).text).toBe('');
    expect(parseBlockText('').segments).toEqual([]);
  });
});

describe('truncateSegments', () => {
  const segments = [
    { kind: 'text' as const, value: 'Notes on ' },
    { kind: 'ref' as const, value: 'Another Page' },
    { kind: 'text' as const, value: ' and more text' },
  ];

  test('short enough: unchanged', () => {
    expect(truncateSegments(segments, 100).text).toBe('Notes on Another Page and more text');
  });

  test('cut inside a text segment', () => {
    const t = truncateSegments(segments, 26);
    expect(t.text).toBe('Notes on Another Page and…');
    expect(t.text.length).toBeLessThanOrEqual(26);
    expect(t.segments.map((s) => s.value).join('')).toBe(t.text);
  });

  test('cut inside a reference keeps it a reference, ellipsis as text', () => {
    const t = truncateSegments(segments, 14);
    expect(t.segments).toEqual([
      { kind: 'text', value: 'Notes on ' },
      { kind: 'ref', value: 'Anot' },
      { kind: 'text', value: '…' },
    ]);
    expect(t.text).toBe('Notes on Anot…');
  });
});
