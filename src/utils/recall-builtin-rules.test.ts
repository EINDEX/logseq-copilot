import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing';
import {
  BUILTIN_RECALL_RULES,
  getBuiltinRule,
  isBuiltinRuleId,
  mergeBuiltinRules,
  rulesToStore,
} from './recall-builtin-rules';
import { RecallRuleProcessor } from './recall-rule-processor';
import { blockMatchesPage } from './recall-url-match';

const processor = RecallRuleProcessor.getInstance();

beforeEach(() => fakeBrowser.reset());

const governedBy = async (url: string) =>
  (await processor.processSearchContext(url)).appliedRules
    .map((r) => r.id)
    .filter((id) => id.startsWith('builtin:'));

describe('built-in rules', () => {
  it('have builtin: ids, the marker and a valid pattern', () => {
    expect(BUILTIN_RECALL_RULES.length).toBeGreaterThan(0);
    for (const rule of BUILTIN_RECALL_RULES) {
      expect(rule.id.startsWith('builtin:')).toBe(true);
      expect(rule.builtin).toBe(true);
      expect(rule.enabled).toBe(true);
      expect(() => new RegExp(rule.urlPattern, 'i')).not.toThrow();
    }
    expect(new Set(BUILTIN_RECALL_RULES.map((r) => r.id)).size).toBe(BUILTIN_RECALL_RULES.length);
  });

  it('govern video pages only', async () => {
    for (const url of [
      'https://www.youtube.com/watch?v=AAA&t=3',
      'https://m.youtube.com/watch?v=AAA',
      'https://www.youtube.com/shorts/AAA',
      'https://youtu.be/AAA?si=x',
    ]) {
      expect(await governedBy(url)).toEqual(['builtin:youtube-video']);
    }
    for (const url of [
      'https://www.youtube.com/playlist?list=L',
      'https://www.youtube.com/@channel',
      'https://www.youtube.com/channel/UC1',
      'https://www.youtube.com/',
      'https://www.youtube.com/results?search_query=x',
      'https://www.youtube.com/watchlater',
    ]) {
      expect(await governedBy(url)).toEqual([]);
    }
    expect(await governedBy('https://www.bilibili.com/video/BV1xx411c7mD/')).toEqual(['builtin:bilibili-video']);
    expect(await governedBy('https://m.bilibili.com/video/av123')).toEqual(['builtin:bilibili-video']);
    expect(await governedBy('https://www.bilibili.com/')).toEqual([]);
    expect(await governedBy('https://news.ycombinator.com/item?id=1')).toEqual(['builtin:hn-item']);
    expect(await governedBy('https://news.ycombinator.com/news')).toEqual([]);
    expect(await governedBy('https://mp.weixin.qq.com/s?__biz=a&mid=1')).toEqual(['builtin:wechat-article']);
    expect(await governedBy('https://mp.weixin.qq.com/s/AbC')).toEqual(['builtin:wechat-article']);
  });

  it('recall one YouTube video, not every video (#59)', async () => {
    const ctx = await processor.processSearchContext(
      'https://www.youtube.com/watch?v=AAA&t=30s&list=PL1&index=3&pp=x&feature=share',
    );
    expect(ctx.processedUrl.href).toBe('https://www.youtube.com/watch?v=AAA');
    expect(blockMatchesPage('https://www.youtube.com/watch?v=BBB', ctx.processedUrl, ctx.urlMatch)).toBe(false);
    expect(blockMatchesPage('https://youtu.be/AAA?si=q', ctx.processedUrl, ctx.urlMatch)).toBe(true);
  });
});

describe('mergeBuiltinRules', () => {
  const stored = (id: string, overrides = {}) => ({
    ...getBuiltinRule('builtin:hn-item')!,
    id,
    ...overrides,
  });

  it('adds every built-in that is not stored, after the stored rules', () => {
    const user = { ...getBuiltinRule('builtin:hn-item')!, id: 'mine', builtin: undefined };
    const merged = mergeBuiltinRules([user]);
    expect(merged.map((r) => r.id)).toEqual(['mine', ...BUILTIN_RECALL_RULES.map((r) => r.id)]);
  });

  it('a stored rule with a built-in id is the override', () => {
    const off = stored('builtin:hn-item', { enabled: false });
    const merged = mergeBuiltinRules([off]);
    expect(merged.filter((r) => r.id === 'builtin:hn-item')).toEqual([off]);
    expect(merged).toHaveLength(BUILTIN_RECALL_RULES.length);
  });

  it('copies the built-ins, so edits do not change them', () => {
    mergeBuiltinRules([])[0].name = 'changed';
    expect(BUILTIN_RECALL_RULES[0].name).not.toBe('changed');
  });

  it('rulesToStore drops built-ins that are unchanged, whatever their key order', () => {
    const original = getBuiltinRule('builtin:hn-item')!;
    const reordered = Object.fromEntries(Object.entries(original).reverse()) as typeof original;
    const edited = stored('builtin:hn-item', { enabled: false });
    const mine = stored('mine');
    expect(rulesToStore([original, reordered, edited, mine])).toEqual([edited, mine]);
    expect(isBuiltinRuleId('builtin:hn-item')).toBe(true);
    expect(isBuiltinRuleId('mine')).toBe(false);
  });
});

describe('the processor with built-in rules', () => {
  it('loads them without anything stored, next to the default rules', async () => {
    const ctx = await processor.processSearchContext('https://www.youtube.com/watch?v=AAA');
    expect(ctx.appliedRules.map((r) => r.id)).toEqual(['builtin:youtube-video', 'default-spa']);
  });

  it('a disabled copy turns a built-in off', async () => {
    await fakeBrowser.storage.local.set({
      recallRulesConfig: [{ ...getBuiltinRule('builtin:youtube-video')!, enabled: false }],
    });
    const ctx = await processor.processSearchContext('https://www.youtube.com/watch?v=AAA&t=3');
    expect(ctx.appliedRules.map((r) => r.id)).toEqual([]);
    expect(ctx.processedUrl.search).toBe('?v=AAA&t=3');
    expect(ctx.urlMatch).toEqual({});
  });

  it('an edited copy replaces the built-in', async () => {
    const copy = getBuiltinRule('builtin:youtube-video')!;
    copy.queryProcessing.keepQueryParams = ['v', 'list'];
    await fakeBrowser.storage.local.set({ recallRulesConfig: [copy] });
    const ctx = await processor.processSearchContext('https://www.youtube.com/watch?v=AAA&list=L&t=3');
    expect(ctx.urlMatch.keepQueryParams).toEqual(['v', 'list']);
    expect(ctx.processedUrl.href).toBe('https://www.youtube.com/watch?v=AAA&list=L');
  });

  it('deleting the stored copy resets it', async () => {
    await fakeBrowser.storage.local.set({
      recallRulesConfig: [{ ...getBuiltinRule('builtin:youtube-video')!, enabled: false }],
    });
    await fakeBrowser.storage.local.set({ recallRulesConfig: [] });
    const ctx = await processor.processSearchContext('https://www.youtube.com/watch?v=AAA&t=3');
    expect(ctx.appliedRules.map((r) => r.id)).toEqual(['builtin:youtube-video']);
    expect(ctx.processedUrl.search).toBe('?v=AAA');
  });
});
