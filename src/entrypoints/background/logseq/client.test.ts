import { describe, expect, test, vi } from 'vitest';
import NormalClient from './normal/client';
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
  ['normal', NormalClient],
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
