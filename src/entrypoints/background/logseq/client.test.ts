import { describe, expect, test, vi } from 'vitest';
import MarkdownClient from './markdown/client';
import DBClient from './db/client';
import { escapeQueryString } from './client';

describe('escapeQueryString', () => {
  test('escapes quotes and backslashes', () => {
    expect(escapeQueryString('a"b')).toBe('a\\"b');
    expect(escapeQueryString('a\\b')).toBe('a\\\\b');
    expect(escapeQueryString('a\\"b')).toBe('a\\\\\\"b');
  });
});

describe.each([
  ['markdown', MarkdownClient],
  ['db', DBClient],
])('%s client find()', (_name, Client) => {
  test('escapes quotes in the query string', async () => {
    const client = new Client();
    const spy = vi.fn().mockResolvedValue([]);
    client.baseJson = spy;
    await client.find('https://x.com/?q="a"');
    expect(spy).toHaveBeenCalledWith('logseq.DB.q', [
      '"https://x.com/?q=\\"a\\""',
    ]);
  });
});

describe('db client Asset calls', () => {
  test('inserts a block with its uuid and properties below the parent', async () => {
    const client = new DBClient();
    const spy = vi.fn().mockResolvedValue({ uuid: 'u' });
    client.baseJson = spy;
    await client.insertBlockWithProperties('p', 'title', 'u', { 'logseq.property.asset/size': 3 });
    expect(spy).toHaveBeenCalledWith('logseq.Editor.insertBlock', [
      'p',
      'title',
      { sibling: false, focus: false, customUUID: 'u', properties: { 'logseq.property.asset/size': 3 } },
    ]);
  });

  test('tags a block', async () => {
    const client = new DBClient();
    const spy = vi.fn().mockResolvedValue('null');
    client.baseText = spy;
    await client.addBlockTag('u', 't');
    expect(spy).toHaveBeenCalledWith('logseq.Editor.addBlockTag', ['u', 't']);
  });
});
