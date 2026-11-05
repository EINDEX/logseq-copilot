import { describe, expect, test } from 'vitest';
import { makeSnippet } from './snippet';

const marked = (s: ReturnType<typeof makeSnippet>) =>
  s.highlights.map((h) => s.text.slice(h.start, h.end));

describe('makeSnippet', () => {
  test('short text is kept whole, every term highlighted', () => {
    const s = makeSnippet('Logseq API notes about the api', ['api', 'logseq'], 100);
    expect(s).toMatchObject({
      text: 'Logseq API notes about the api',
      start: 0,
      cutBefore: false,
      cutAfter: false,
    });
    expect(marked(s)).toEqual(['Logseq', 'API', 'api']);
  });

  test('terms are matched one by one, not as a phrase', () => {
    const s = makeSnippet('plugin for the Logseq desktop', ['logseq plugin'], 100);
    expect(s.highlights).toEqual([]);
    const each = makeSnippet('plugin for the Logseq desktop', ['logseq', 'plugin'], 100);
    expect(marked(each)).toEqual(['plugin', 'Logseq']);
  });

  test('a window around the first match of a long text', () => {
    const text = `${'lorem ipsum '.repeat(20)}the Logseq query engine ${'dolor sit '.repeat(20)}`;
    const s = makeSnippet(text, ['logseq'], 60);
    expect(s.text.length).toBeLessThanOrEqual(60);
    expect(s.cutBefore).toBe(true);
    expect(s.cutAfter).toBe(true);
    expect(marked(s)).toEqual(['Logseq']);
    expect(text.slice(s.start, s.start + s.text.length)).toBe(s.text);
    // Some context before the match, cut on a word boundary.
    expect(s.text.indexOf('Logseq')).toBeGreaterThan(5);
    expect(s.text.startsWith('lorem') || s.text.startsWith('ipsum')).toBe(true);
  });

  test('a match near the end keeps the window inside the text', () => {
    const text = `${'word '.repeat(40)}logseq`;
    const s = makeSnippet(text, ['logseq'], 30);
    expect(s.cutAfter).toBe(false);
    expect(s.text.endsWith('logseq')).toBe(true);
    expect(marked(s)).toEqual(['logseq']);
  });

  test('no match: window from the start', () => {
    const s = makeSnippet('a'.repeat(50), ['zzz'], 20);
    expect(s).toMatchObject({ start: 0, cutBefore: false, cutAfter: true });
    expect(s.text).toHaveLength(20);
  });

  test('overlapping matches of different terms merge', () => {
    const s = makeSnippet('logseqcopilot', ['logseq', 'seqcop'], 50);
    expect(s.highlights).toEqual([{ start: 0, end: 9 }]);
  });

  test('highlights cut by the window edge are clipped', () => {
    const s = makeSnippet('aaaa bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', ['b'.repeat(38)], 20);
    for (const h of s.highlights) {
      expect(h.end).toBeLessThanOrEqual(s.text.length);
    }
  });

  test('CJK', () => {
    const s = makeSnippet('我在笔记里写过双向链接的用法', ['双向链接'], 50);
    expect(marked(s)).toEqual(['双向链接']);
  });
});
