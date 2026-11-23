/**
 * #59: the recall count of a video page is about that video, not about every
 * link on /watch. Runs the same steps as the `logseq:urlSearch` handler (recall
 * rules, then urlSearch) against a real Logseq, both graph types. The notes are
 * written on the fixture page `Copilot Test Page`.
 */
import { beforeAll, describe, expect, inject, test } from 'vitest';
import { fakeBrowser } from 'wxt/testing';
import {
  logseqAuthTokenItem,
  logseqHostNameItem,
  logseqPortItem,
} from '@/utils/storage';
import { getLogseqService } from '@/entrypoints/background/logseq/tool';
import { LogseqServiceInterface } from '@/entrypoints/background/logseq/interfaces';
import { RecallRuleProcessor } from '@/utils/recall-rule-processor';

const variant = inject('logseqVariant');
const TEST_PAGE = 'Copilot Test Page';

const eventually = async <T>(fn: () => Promise<T>, ok: (v: T) => boolean) => {
  let value = await fn();
  for (let i = 0; i < 40 && !ok(value); i++) {
    await new Promise((r) => setTimeout(r, 500));
    value = await fn();
  }
  return value;
};

beforeAll(async () => {
  fakeBrowser.reset();
  const apiUrl = new URL(inject('logseqApi'));
  await logseqHostNameItem.setValue(apiUrl.hostname);
  await logseqPortItem.setValue(Number(apiUrl.port));
  await logseqAuthTokenItem.setValue(inject('logseqToken'));
});

describe(`recalling a video page (${variant})`, () => {
  let service: LogseqServiceInterface;
  beforeAll(async () => {
    service = await getLogseqService();
  });

  // What the background handler does: rules first, then the search.
  const search = async (url: string) => {
    const ctx = await RecallRuleProcessor.getInstance().processSearchContext(url);
    return await service.urlSearch(ctx.processedUrl, {
      scopeDepth: ctx.scopeDepth,
      ...ctx.urlMatch,
    });
  };
  const mine = (res: any, stamp: number) =>
    (res.response.blocks as any[]).filter((b) => JSON.stringify(b).includes(`${stamp}`));

  test('a clipped video counts 1, another video counts 0', async () => {
    const stamp = Date.now();
    const clipped = `Vid${stamp}A`;
    await service.client.appendBlock(
      TEST_PAGE,
      `[Talk ${stamp}](https://www.youtube.com/watch?v=${clipped})`,
    );
    await service.client.appendBlock(
      TEST_PAGE,
      `Other ${stamp} https://www.youtube.com/watch?v=Vid${stamp}B&t=30s`,
    );
    await service.client.appendBlock(
      TEST_PAGE,
      `Short link ${stamp} https://youtu.be/Vid${stamp}C?si=abc`,
    );

    // Wait until the index has the clipped video, then ask about another one.
    const hit: any = await eventually(
      () => search(`https://www.youtube.com/watch?v=${clipped}`),
      (r: any) => mine(r, stamp).length > 0,
    );
    expect(mine(hit, stamp)).toHaveLength(1);
    expect(JSON.stringify(mine(hit, stamp)[0])).toContain(`Talk ${stamp}`);
    expect(hit.count).toBeGreaterThanOrEqual(1);

    const none: any = await search(`https://www.youtube.com/watch?v=Vid${stamp}Z`);
    expect(mine(none, stamp)).toEqual([]);
    expect(none.count).toBe(0);
  });

  test('time, playlist and share parameters do not tell videos apart', async () => {
    const stamp = Date.now();
    await service.client.appendBlock(
      TEST_PAGE,
      `Clip ${stamp} https://www.youtube.com/watch?v=Vid${stamp}A&t=90s`,
    );
    const res: any = await eventually(
      () =>
        search(
          `https://www.youtube.com/watch?v=Vid${stamp}A&list=PL1&index=2&pp=x&feature=share`,
        ),
      (r: any) => mine(r, stamp).length > 0,
    );
    expect(mine(res, stamp)).toHaveLength(1);
  });

  test('a youtu.be link and a watch link are the same video', async () => {
    const stamp = Date.now();
    await service.client.appendBlock(
      TEST_PAGE,
      `Seen ${stamp} https://youtu.be/Vid${stamp}A?si=abc`,
    );
    const res: any = await eventually(
      () => search(`https://www.youtube.com/watch?v=Vid${stamp}A`),
      (r: any) => mine(r, stamp).length > 0,
    );
    expect(mine(res, stamp)).toHaveLength(1);
    const other: any = await search(`https://www.youtube.com/watch?v=Vid${stamp}B`);
    expect(mine(other, stamp)).toEqual([]);
  });
});
