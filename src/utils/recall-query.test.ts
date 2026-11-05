import { describe, expect, test } from 'vitest';
import { findMatchedTerms, normalizeQuery } from './recall-query';

describe('normalizeQuery', () => {
  test('drops English stop words and words of two characters or less', () => {
    expect(normalizeQuery('How to use the Logseq API in JS')).toEqual({
      primary: 'logseq api',
      terms: ['logseq', 'api'],
      fallbacks: ['logseq', 'api'],
    });
  });

  test('keeps CJK runs as typed, one term each', () => {
    expect(normalizeQuery('Logseq 双向链接 笔记')).toEqual({
      primary: 'logseq 双向链接 笔记',
      terms: ['logseq', '双向链接', '笔记'],
      fallbacks: ['logseq', '双向链接'],
    });
  });

  test('splits CJK from Latin text in one chunk', () => {
    expect(normalizeQuery('React组件').terms).toEqual(['react', '组件']);
  });

  test('keeps symbols that belong to a word, drops punctuation', () => {
    expect(normalizeQuery('c++ vs c#, node.js?').terms).toEqual([
      'c++',
      'c#',
      'node.js',
    ]);
  });

  test('a single term has no fallbacks', () => {
    expect(normalizeQuery('the logseq')).toEqual({
      primary: 'logseq',
      terms: ['logseq'],
      fallbacks: [],
    });
  });

  test('fallbacks are the two longest terms, longest first', () => {
    expect(normalizeQuery('rust async runtime tokio').fallbacks).toEqual([
      'runtime',
      'async',
    ]);
  });

  test('dedupes terms case-insensitively', () => {
    expect(normalizeQuery('Logseq logseq LOGSEQ').terms).toEqual(['logseq']);
  });

  test('keeps every word when all of them would be dropped', () => {
    expect(normalizeQuery('to be or not to be')).toEqual({
      primary: 'to be or not',
      terms: ['to', 'be', 'or', 'not'],
      fallbacks: ['not', 'to'],
    });
  });

  test('empty query', () => {
    expect(normalizeQuery('   ')).toEqual({
      primary: '',
      terms: [],
      fallbacks: [],
    });
  });
});

describe('findMatchedTerms', () => {
  test('matches each term on its own, case-insensitively', () => {
    expect(
      findMatchedTerms('Notes on the Logseq API', ['logseq', 'api', 'plugin']),
    ).toEqual(['logseq', 'api']);
  });

  test('regex characters in terms are literal', () => {
    expect(findMatchedTerms('learning C++ today', ['c++', 'c.'])).toEqual([
      'c++',
    ]);
  });

  test('CJK terms', () => {
    expect(findMatchedTerms('关于双向链接的笔记', ['双向链接', '大纲'])).toEqual([
      '双向链接',
    ]);
  });
});
