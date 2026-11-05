import { describe, expect, test, vi } from 'vitest';
import { recallRequestKey, recentRequests } from './recent-requests';

describe('recentRequests', () => {
  test('shares an answer within the window, runs again after it', async () => {
    let time = 0;
    const shared = recentRequests<number>(5_000, () => time);
    const run = vi.fn(async () => 42);
    expect(await shared('k', run)).toBe(42);
    time = 4_000;
    expect(await shared('k', run)).toBe(42);
    expect(run).toHaveBeenCalledTimes(1);
    time = 9_001;
    await shared('k', run);
    expect(run).toHaveBeenCalledTimes(2);
  });

  test('shares a request still in flight', async () => {
    const shared = recentRequests<string>(5_000);
    let resolve!: (v: string) => void;
    const run = vi.fn(() => new Promise<string>((r) => (resolve = r)));
    const a = shared('k', run);
    const b = shared('k', run);
    resolve('done');
    expect(await Promise.all([a, b])).toEqual(['done', 'done']);
    expect(run).toHaveBeenCalledTimes(1);
  });

  test('other keys run on their own; failures are not kept', async () => {
    const shared = recentRequests<number>(5_000);
    const fail = vi.fn(async () => {
      throw new Error('offline');
    });
    await expect(shared('a', fail)).rejects.toThrow('offline');
    await expect(shared('a', fail)).rejects.toThrow('offline');
    expect(fail).toHaveBeenCalledTimes(2);
    expect(await shared('b', async () => 1)).toBe(1);
  });
});

describe('recallRequestKey', () => {
  test('ignores the query string of the page (Bing adds &rdr=1&rdrig=…)', () => {
    expect(
      recallRequestKey('copilot', 'https://www.bing.com/search?q=copilot'),
    ).toBe(
      recallRequestKey(
        'copilot ',
        'https://www.bing.com/search?q=copilot&rdr=1&rdrig=9E58F2A7',
      ),
    );
  });

  test('another query or site is another request', () => {
    const key = recallRequestKey('a', 'https://www.bing.com/search?q=a');
    expect(recallRequestKey('b', 'https://www.bing.com/search?q=b')).not.toBe(key);
    expect(recallRequestKey('a', 'https://www.google.com/search?q=a')).not.toBe(key);
  });
});
