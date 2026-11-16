import { describe, expect, it } from 'vitest';
import { linkKeys, samePageKey } from './same-page';

describe('samePageKey', () => {
  it.each([
    ['http and https', 'http://a.com/x', 'https://a.com/x'],
    ['host case', 'https://A.COM/x', 'https://a.com/x'],
    ['fragment', 'https://a.com/x#top', 'https://a.com/x'],
    ['trailing slash', 'https://a.com/x/', 'https://a.com/x'],
    ['root path', 'https://a.com', 'https://a.com/'],
    ['utm params', 'https://a.com/x?utm_source=a&utm_medium=b', 'https://a.com/x'],
    ['utm case', 'https://a.com/x?UTM_Campaign=a', 'https://a.com/x'],
    ['fbclid and gclid', 'https://a.com/x?fbclid=1&gclid=2', 'https://a.com/x'],
    ['mailchimp and ref_src', 'https://a.com/x?mc_cid=1&mc_eid=2&ref_src=t', 'https://a.com/x'],
    ['query order', 'https://a.com/x?b=2&a=1', 'https://a.com/x?a=1&b=2'],
    ['tracking among others', 'https://a.com/x?a=1&utm_source=z', 'https://a.com/x?a=1'],
    ['percent encoding', 'https://a.com/caf%C3%A9', 'https://a.com/café'],
    ['escaped paren', 'https://a.com/wiki/Foo_(bar\\)', 'https://a.com/wiki/Foo_(bar)'],
    ['default port', 'https://a.com:443/x', 'https://a.com/x'],
    ['plus in query', 'https://a.com/x?q=a+b', 'https://a.com/x?q=a%20b'],
  ])('is the same page: %s', (_name, a, b) => {
    expect(samePageKey(a)).toBeDefined();
    expect(samePageKey(a)).toBe(samePageKey(b));
  });

  it.each([
    ['www', 'https://www.a.com/x', 'https://a.com/x'],
    ['path', 'https://a.com/x', 'https://a.com/y'],
    ['path case', 'https://a.com/X', 'https://a.com/x'],
    ['other query', 'https://a.com/x?id=1', 'https://a.com/x?id=2'],
    ['query vs none', 'https://a.com/x?id=1', 'https://a.com/x'],
    ['host', 'https://a.com/x', 'https://b.com/x'],
    ['other port', 'https://a.com:8080/x', 'https://a.com/x'],
    ['root vs path', 'https://a.com/', 'https://a.com/x'],
  ])('is another page: %s', (_name, a, b) => {
    expect(samePageKey(a)).not.toBe(samePageKey(b));
  });

  it('has no key for what is not an http(s) URL', () => {
    expect(samePageKey(undefined)).toBeUndefined();
    expect(samePageKey('')).toBeUndefined();
    expect(samePageKey('not a url')).toBeUndefined();
    expect(samePageKey('file:///tmp/a')).toBeUndefined();
    expect(samePageKey('chrome-extension://abc/x.html')).toBeUndefined();
  });
});

describe('linkKeys', () => {
  const a = samePageKey('https://a.com/x')!;

  it('reads Markdown links and bare URLs', () => {
    expect(linkKeys('#[[Clip]] [A page](https://a.com/x)').has(a)).toBe(true);
    expect(linkKeys('see https://a.com/x.').has(a)).toBe(true);
    expect(linkKeys('<https://a.com/x#frag>').has(a)).toBe(true);
  });

  it('reads a link whose parenthesis is escaped', () => {
    const wiki = samePageKey('https://a.com/wiki/Foo_(bar)')!;
    expect(linkKeys('[w](https://a.com/wiki/Foo_(bar\\))').has(wiki)).toBe(true);
    expect(linkKeys('[w](https://a.com/wiki/Foo_(bar))').has(wiki)).toBe(true);
  });

  it('reads links as the escaping stores them', () => {
    const frag = samePageKey('https://a.com/x#frag')!;
    expect(linkKeys('[A \\[1\\] \\#tag](https://a.com/x\\#frag)').has(frag)).toBe(true);
    expect(linkKeys('[A](https://a.com/x#frag)').has(frag)).toBe(true);
    expect(linkKeys('see https://a.com/x\\#frag').has(frag)).toBe(true);
    const wiki = samePageKey('https://a.com/wiki/Foo_(bar)')!;
    // A bare URL keeps an escaped `\)` and a balanced `)`, loses a sentence's.
    expect(linkKeys('see https://a.com/wiki/Foo_(bar\\)').has(wiki)).toBe(true);
    expect(linkKeys('see https://a.com/wiki/Foo_(bar).').has(wiki)).toBe(true);
    expect(linkKeys('(see https://a.com/x)').has(a)).toBe(true);
    expect(linkKeys('[l \\[1\\]](https://a.com/wiki/Foo_(bar))').has(wiki)).toBe(true);
    expect(linkKeys('[A \\] x](https://a.com/x)').has(a)).toBe(true);
  });

  it('finds no link in plain text', () => {
    expect(linkKeys('nothing a.com/x here').size).toBe(0);
  });
});
