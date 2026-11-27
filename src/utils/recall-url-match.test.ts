import { describe, expect, test } from 'vitest';
import {
  blockMatchesPage,
  canonicalUrl,
  effectiveQuery,
  matchForm,
  searchTermsFor,
  type UrlMatchOptions,
} from './recall-url-match';

// The options the built-in rules set (src/utils/recall-builtin-rules.ts).
const YT: UrlMatchOptions = {
  keepQueryParams: ['v'],
  urlForms: ['youtube.com/watch?v={id}', 'youtu.be/{id}', 'youtube.com/shorts/{id}'],
};
const BILI: UrlMatchOptions = {
  keepQueryParams: ['p'],
  urlForms: ['bilibili.com/video/{id}'],
};
const HN: UrlMatchOptions = { keepQueryParams: ['id'] };
const WECHAT: UrlMatchOptions = { keepQueryParams: ['__biz', 'mid', 'idx', 'sn'] };

const page = (href: string) => new URL(href);
const matches = (content: string | undefined, href: string, opts: UrlMatchOptions = {}) =>
  blockMatchesPage(content, page(href), opts);

describe('effectiveQuery', () => {
  test('does not depend on the order of the parameters', () => {
    expect(effectiveQuery('https://x.com/a?b=2&a=1')).toBe(effectiveQuery('https://x.com/a?a=1&b=2'));
  });

  test('drops tracking parameters only', () => {
    expect(
      effectiveQuery(
        'https://x.com/a?id=5&utm_source=n&UTM_medium=m&fbclid=1&gclid=2&dclid=3&msclkid=4&mc_cid=5&mc_eid=6&igshid=7&_ga=8',
      ),
    ).toBe('id=5');
  });

  test('a list keeps only the listed parameters', () => {
    const opts = { keepQueryParams: ['v'] };
    expect(effectiveQuery('https://x.com/w?t=3&v=A&list=L&utm_source=x', opts)).toBe('v=A');
    expect(effectiveQuery('https://x.com/w?t=3', opts)).toBe('');
  });

  test('repeated keys keep all their values, sorted', () => {
    expect(effectiveQuery('https://x.com/a?t=b&t=a&u=1')).toBe('t=a&t=b&u=1');
    expect(effectiveQuery('https://x.com/a?t=b&t=a')).toBe(effectiveQuery('https://x.com/a?t=a&t=b'));
  });

  test('is empty without a query', () => {
    expect(effectiveQuery('https://x.com/a')).toBe('');
    expect(effectiveQuery('https://x.com/a?utm_source=x')).toBe('');
  });
});

describe('blockMatchesPage without forms', () => {
  const href = 'https://example.com/watch?v=AAA';

  test('keeps a block with the same query, in any order, with tracking', () => {
    expect(matches('[t](https://example.com/watch?v=AAA)', href)).toBe(true);
    expect(matches('https://example.com/watch?utm_source=x&v=AAA', href)).toBe(true);
    expect(matches('x', 'https://example.com/a?b=2&a=1')).toBe(true);
    expect(matches('https://example.com/a?a=1&b=2', 'https://example.com/a?b=2&a=1')).toBe(true);
  });

  test('drops a block that only has other queries', () => {
    expect(matches('[t](https://example.com/watch?v=BBB)', href)).toBe(false);
    expect(matches('https://example.com/watch?v=BBB and https://example.com/watch?v=CCC', href)).toBe(false);
  });

  test('keeps a block that also has the right one or a bare path mention', () => {
    expect(matches('https://example.com/watch?v=BBB https://example.com/watch?v=AAA', href)).toBe(true);
    expect(matches('https://example.com/watch?v=BBB and https://example.com/watch', href)).toBe(true);
    expect(matches('all videos: example.com/watch', href)).toBe(true);
  });

  test('keeps a block when no URL to the path can be read', () => {
    expect(matches('nothing here', href)).toBe(true);
    expect(matches('https://other.com/watch?v=BBB', href)).toBe(true);
    expect(matches('https://example.com/watching?v=BBB', href)).toBe(true);
    expect(matches('', href)).toBe(true);
    expect(matches(undefined, href)).toBe(true);
  });

  test('keeps the stored forms of a path with parentheses', () => {
    const f = 'https://example.com/f(x+1)?q=1';
    expect(matches('[x](https://example.com/f(x+1\\)?q=2)', f)).toBe(true);
    expect(matches('https://example.com/f%28x+1)?q=2', f)).toBe(true);
  });

  test('keeps a block whose URL may go on past a bracket in the query', () => {
    const r6 = 'https://example.com/r6/p?q=a(b)c(d&e=f)g#h(i';
    expect(matches(`[Recall](${r6})`, r6)).toBe(true);
    expect(matches('https://example.com/a?q=x)y', 'https://example.com/a?q=x)y')).toBe(true);
    expect(matches('https://example.com/a?q=x[1]', 'https://example.com/a?q=x[1]')).toBe(true);
    // The bracket that closes a markdown link does not count.
    expect(matches('[t](https://example.com/watch?v=BBB)', href)).toBe(false);
    expect(matches('([t](https://example.com/watch?v=BBB)).', href)).toBe(false);
    expect(matches('[[https://example.com/watch?v=BBB]] x', href)).toBe(false);
  });

  test('a page without an identifying query is not filtered', () => {
    expect(matches('https://example.com/a?id=5', 'https://example.com/a')).toBe(true);
    expect(matches('https://example.com/a?id=5', 'https://example.com/a?utm_source=x')).toBe(true);
  });

  test('ignores www., m., trailing slashes, scheme and the hash', () => {
    expect(matches('http://m.example.com/watch/?v=BBB', 'https://www.example.com/watch?v=AAA')).toBe(false);
    expect(matches('example.com/watch?v=AAA#t=3', href)).toBe(true);
  });

  test('stops a URL at the end of a sentence and at CJK text', () => {
    expect(matches('See https://example.com/watch?v=AAA.', href)).toBe(true);
    expect(matches('看https://example.com/watch?v=AAA这个', href)).toBe(true);
  });
});

describe('forms', () => {
  test('matchForm reads the id of every form, with or without www. / m.', () => {
    const forms = YT.urlForms;
    expect(matchForm('https://www.youtube.com/watch?v=AAA', forms)).toEqual({ id: 'AAA' });
    expect(matchForm('https://m.youtube.com/watch?v=AAA', forms)).toEqual({ id: 'AAA' });
    expect(matchForm('https://youtube.com/watch?feature=share&v=AAA&t=3', forms)).toEqual({ id: 'AAA' });
    expect(matchForm('https://youtu.be/AAA?si=x', forms)).toEqual({ id: 'AAA' });
    expect(matchForm('https://www.youtube.com/shorts/Ab_-1', forms)).toEqual({ id: 'Ab_-1' });
  });

  test('matchForm rejects other pages', () => {
    const forms = YT.urlForms;
    expect(matchForm('https://www.youtube.com/watch', forms)).toBeUndefined();
    expect(matchForm('https://www.youtube.com/playlist?list=L', forms)).toBeUndefined();
    expect(matchForm('https://www.youtube.com/@channel', forms)).toBeUndefined();
    expect(matchForm('https://music.youtube.com/watch?v=AAA', forms)).toBeUndefined();
    expect(matchForm('https://youtu.be/AAA/extra', forms)).toBeUndefined();
    expect(matchForm('https://www.youtube.com/watch?v=A%20B', forms)).toBeUndefined();
    expect(matchForm('https://www.youtube.com/watch?v=AAA', undefined)).toBeUndefined();
  });

  test('forms without exactly one {id} are ignored, never run as patterns', () => {
    expect(matchForm('https://a.com/x', ['a.com/x'])).toBeUndefined();
    expect(matchForm('https://a.com/x/1', ['a.com/{id}/{id}'])).toBeUndefined();
    expect(matchForm('https://a.com/x/1', ['a.com/.*/{id}'])).toBeUndefined();
  });

  test('searchTermsFor renders every form without scheme', () => {
    expect(searchTermsFor('https://youtu.be/AAA?si=x', YT.urlForms)).toEqual([
      'youtube.com/watch?v=AAA',
      'youtu.be/AAA',
      'youtube.com/shorts/AAA',
    ]);
    expect(searchTermsFor('https://www.youtube.com/playlist?list=L', YT.urlForms)).toEqual([]);
    expect(searchTermsFor('https://x.com/a', undefined)).toEqual([]);
  });

  test('canonicalUrl uses the first form, keeps allowed parameters', () => {
    const canon = (href: string, opts: UrlMatchOptions) => canonicalUrl(page(href), opts)?.href;
    expect(canon('https://youtu.be/AAA?si=x&t=30', YT)).toBe('https://www.youtube.com/watch?v=AAA');
    expect(canon('https://www.youtube.com/shorts/AAA', YT)).toBe('https://www.youtube.com/watch?v=AAA');
    expect(canon('https://m.youtube.com/watch?v=AAA&t=3', YT)).toBe('https://www.youtube.com/watch?v=AAA');
    expect(canon('https://www.bilibili.com/video/BV1xx411c7mD/?p=2&spm_id_from=x', BILI)).toBe(
      'https://www.bilibili.com/video/BV1xx411c7mD?p=2',
    );
    expect(canon('https://www.youtube.com/playlist?list=L', YT)).toBeUndefined();
  });
});

describe('YouTube', () => {
  const href = 'https://www.youtube.com/watch?v=AAA';
  const yes = (content: string, p = href) => expect(matches(content, p, YT)).toBe(true);
  const no = (content: string, p = href) => expect(matches(content, p, YT)).toBe(false);

  test('another video is dropped, the same one is kept', () => {
    no('[b](https://www.youtube.com/watch?v=BBB)');
    yes('[a](https://www.youtube.com/watch?v=AAA)');
  });

  test('the same video in any URL shape is kept', () => {
    yes('https://m.youtube.com/watch?v=AAA');
    yes('https://youtu.be/AAA?si=abc');
    yes('https://www.youtube.com/shorts/AAA');
    yes('youtube.com/watch?v=AAA&t=30s&list=PL1&index=3&pp=xyz&feature=share');
    yes('https://www.youtube.com/watch?feature=share&v=AAA');
  });

  test('other shapes of other videos are dropped', () => {
    no('https://youtu.be/BBB?si=abc');
    no('https://www.youtube.com/shorts/BBB');
    no('https://youtu.be/BBB and https://www.youtube.com/watch?v=CCC&t=3');
  });

  test('the visited URL may be any shape too', () => {
    yes('https://www.youtube.com/watch?v=AAA', 'https://youtu.be/AAA?si=x');
    no('https://www.youtube.com/watch?v=BBB', 'https://youtu.be/AAA?si=x');
    yes('https://youtu.be/AAA', 'https://www.youtube.com/shorts/AAA');
  });

  test('ids compare exactly and case-sensitively', () => {
    no('https://youtu.be/AAAA');
    no('https://youtu.be/aaa');
  });

  test('a block without a readable video URL is kept', () => {
    yes('watching youtube.com/watch later');
    yes('[x](https://www.youtube.com/watch?v=A%28)');
  });

  test('a playlist page is compared by its query, not by this rule', () => {
    expect(matches('https://www.youtube.com/playlist?list=B', 'https://www.youtube.com/playlist?list=A')).toBe(false);
  });
});

describe('Bilibili', () => {
  const href = 'https://www.bilibili.com/video/BV1xx411c7mD/';
  const check = (content: string, p = href) => matches(content, p, BILI);

  test('tracking parameters do not matter, a trailing slash is optional', () => {
    expect(check('https://www.bilibili.com/video/BV1xx411c7mD/?spm_id_from=333.1007&vd_source=abc')).toBe(true);
    expect(check('https://www.bilibili.com/video/BV1xx411c7mD?share_source=copy_web&t=12')).toBe(true);
    expect(check('bilibili.com/video/BV1xx411c7mD')).toBe(true);
  });

  test('the mobile site is the same page', () => {
    expect(check('https://m.bilibili.com/video/BV1xx411c7mD')).toBe(true);
    expect(check('https://www.bilibili.com/video/BV1xx411c7mD', 'https://m.bilibili.com/video/BV1xx411c7mD')).toBe(true);
  });

  test('another video is dropped; av123 is not av1234', () => {
    expect(check('https://www.bilibili.com/video/BV1yy411c7mE')).toBe(false);
    expect(check('https://www.bilibili.com/video/av1234', 'https://www.bilibili.com/video/av123')).toBe(false);
    expect(check('https://www.bilibili.com/video/av123/', 'https://www.bilibili.com/video/av123')).toBe(true);
  });

  test('parts of a video are told apart by p', () => {
    const part2 = 'https://www.bilibili.com/video/BV1xx411c7mD/?p=2&spm_id_from=x';
    expect(check('https://www.bilibili.com/video/BV1xx411c7mD?p=2', part2)).toBe(true);
    expect(check('https://www.bilibili.com/video/BV1xx411c7mD?p=3', part2)).toBe(false);
    // No part named: a mention of the whole video.
    expect(check('https://www.bilibili.com/video/BV1xx411c7mD', part2)).toBe(true);
    // A page without a part is not filtered by one.
    expect(check('https://www.bilibili.com/video/BV1xx411c7mD?p=3')).toBe(true);
  });

  test('a b23.tv link names no video and is kept', () => {
    expect(check('https://b23.tv/abcd')).toBe(true);
  });
});

describe('Hacker News', () => {
  const href = 'https://news.ycombinator.com/item?id=111';
  test('compares the item id', () => {
    expect(matches('https://news.ycombinator.com/item?id=111', href, HN)).toBe(true);
    expect(matches('https://news.ycombinator.com/item?id=111&p=2', href, HN)).toBe(true);
    expect(matches('https://news.ycombinator.com/item?id=222', href, HN)).toBe(false);
    expect(matches('https://news.ycombinator.com/item?id=222 and news.ycombinator.com/item?id=111', href, HN)).toBe(true);
  });
});

describe('WeChat', () => {
  const href = 'https://mp.weixin.qq.com/s?__biz=MzA&mid=100&idx=1&sn=abc&chksm=zzz&scene=21#wechat_redirect';
  test('compares the four identifying parameters', () => {
    expect(matches('https://mp.weixin.qq.com/s?sn=abc&idx=1&mid=100&__biz=MzA', href, WECHAT)).toBe(true);
    expect(matches('https://mp.weixin.qq.com/s?__biz=MzA&mid=101&idx=1&sn=def', href, WECHAT)).toBe(false);
  });

  test('a short link is path based and unaffected', () => {
    const short = 'https://mp.weixin.qq.com/s/AbCdEf';
    expect(matches('https://mp.weixin.qq.com/s/AbCdEf', short, WECHAT)).toBe(true);
    expect(matches('https://mp.weixin.qq.com/s/XyZ', short, WECHAT)).toBe(true);
  });
});
