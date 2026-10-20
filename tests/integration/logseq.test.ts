/**
 * Runs the extension's Logseq client/service code against a real Logseq app.
 * The same tests run for the file-graph (0.10.x) and DB-graph (2.x) variants;
 * see global-setup.ts for how Logseq is started and seeded.
 */
import { beforeAll, describe, expect, inject, test } from 'vitest';
import { fakeBrowser } from 'wxt/testing';
import {
  logseqAuthTokenItem,
  logseqHostNameItem,
  logseqPortItem,
} from '@/utils/storage';
import { getLogseqService } from '@/entrypoints/background/logseq/tool';
import LogseqDBService from '@/entrypoints/background/logseq/db/service';
import LogseqService from '@/entrypoints/background/logseq/normal/service';
import { LogseqServiceInterface } from '@/entrypoints/background/logseq/interfaces';

const variant = inject('logseqVariant');
const isDB = variant === 'db';
const TEST_PAGE = 'Copilot Test Page';

// Known extension bugs on DB graphs: LogseqDBService expects search results
// keyed by `block/uuid`, but Logseq 2.x returns `uuid`. `test.fails` keeps CI
// green and turns red once fixed, so the marker can be removed.
const failsOnDB = isDB ? test.fails : test;

const api = async (method: string, args: unknown[] = []) => {
  const resp = await fetch(`${inject('logseqApi')}/api`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${inject('logseqToken')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ method, args }),
  });
  return { status: resp.status, body: await resp.json().catch(() => null) };
};

beforeAll(async () => {
  fakeBrowser.reset();
  const apiUrl = new URL(inject('logseqApi'));
  await logseqHostNameItem.setValue(apiUrl.hostname);
  await logseqPortItem.setValue(Number(apiUrl.port));
  await logseqAuthTokenItem.setValue(inject('logseqToken'));
});

describe(`Logseq HTTP API (${variant})`, () => {
  test('rejects a wrong token', async () => {
    const resp = await fetch(`${inject('logseqApi')}/api`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer wrong-token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ method: 'logseq.App.getAppInfo', args: [] }),
    });
    expect(resp.status).toBe(401);
  });

  test('reports the expected graph type', async () => {
    const { body } = await api('logseq.App.checkCurrentIsDbGraph');
    // 0.10.x has no such API at all and answers with an error object.
    expect(body === true).toBe(isDB);
  });

  test('search returns seeded blocks', async () => {
    const { status, body } = await api('logseq.App.search', ['copilot']);
    expect(status).toBe(200);
    expect(body.blocks.length).toBeGreaterThanOrEqual(3);
  });
});

describe(`extension services (${variant})`, () => {
  let service: LogseqServiceInterface;

  beforeAll(async () => {
    service = await getLogseqService();
  });

  test('getLogseqService picks the matching service', () => {
    expect(service).toBeInstanceOf(isDB ? LogseqDBService : LogseqService);
  });

  test('getGraph returns the current graph name', async () => {
    const graph = await service.getGraph();
    expect(graph).toBe(isDB ? 'Demo' : 'copilot-file-graph');
  });

  test('getVersion returns the Logseq version', async () => {
    const version = await service.getVersion();
    expect(version).toMatch(isDB ? /^2\./ : /^0\.10\./);
  });

  failsOnDB('search finds seeded blocks and renders html', async () => {
    const result = await service.search('copilot');
    expect(result.status).toBe(200);
    const blocks = result.response.blocks;
    expect(blocks.length).toBeGreaterThanOrEqual(3);
    const hello = blocks.find((b: any) =>
      b.content.toLowerCase().includes('hello from copilot'),
    );
    expect(hello).toBeDefined();
    expect(hello.html).toMatch(/^<p>.*copilot.*<\/p>$/i);
    expect(hello.page?.name?.toLowerCase()).toBe(TEST_PAGE.toLowerCase());
  });

  failsOnDB('urlSearch finds blocks mentioning the URL', async () => {
    const result = await service.urlSearch(
      new URL('https://example.com/copilot/article'),
    );
    expect(result.status).toBe(200);
    expect(result.response.blocks.length).toBeGreaterThanOrEqual(1);
    expect(result.response.blocks[0].content).toContain(
      'example.com/copilot/article',
    );
  });

  test('client.appendBlock writes into a page (clip note path)', async () => {
    const marker = `clip-${Date.now()}`;
    const block = await service.client.appendBlock(
      TEST_PAGE,
      `Clipped ${marker}`,
    );
    expect(block?.uuid).toBeTruthy();

    const { body } = await api('logseq.Editor.getBlock', [block.uuid]);
    expect(body.content).toContain(marker);
  });
});
