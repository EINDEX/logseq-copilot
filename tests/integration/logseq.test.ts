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
import LogseqService from '@/entrypoints/background/logseq/markdown/service';
import { LogseqServiceInterface } from '@/entrypoints/background/logseq/interfaces';

const variant = inject('logseqVariant');
const isDB = variant === 'db';
const TEST_PAGE = 'Copilot Test Page';

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

  test('search finds seeded blocks and renders html', async () => {
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
    if (isDB) {
      // The page hit is resolved through logseq.Editor.getPage.
      const page = result.response.pages.find(
        (p: any) => p?.name === TEST_PAGE.toLowerCase(),
      );
      expect(page?.originalName).toBe(TEST_PAGE);
    }
  });

  test('urlSearch finds blocks mentioning the URL', async () => {
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

  describe('changeBlockMarker', () => {
    const readBlock = async (uuid: string) =>
      (await api('logseq.Editor.getBlock', [uuid])).body;

    // The block entity is re-parsed asynchronously after an edit.
    const eventually = async <T>(fn: () => Promise<T>, ok: (v: T) => boolean) => {
      let value = await fn();
      for (let i = 0; i < 20 && !ok(value); i++) {
        await new Promise((r) => setTimeout(r, 250));
        value = await fn();
      }
      return value;
    };

    test.skipIf(isDB)('cycles TODO -> DONE -> TODO and changes the block', async () => {
      const text = `marker-cycle-${Date.now()}`;
      const created = await service.client.appendBlock(TEST_PAGE, `TODO ${text}`);
      expect(created?.uuid).toBeTruthy();
      expect((await readBlock(created.uuid)).content).toContain(`TODO ${text}`);

      const done = await service.changeBlockMarker(created.uuid, 'DONE');
      expect(done).toMatchObject({ status: 'success', marker: 'DONE' });
      const afterDone = await eventually(
        () => readBlock(created.uuid),
        (b) => b.marker === 'DONE',
      );
      expect(afterDone.content).toContain(`DONE ${text}`);
      expect(afterDone.content).not.toContain(`TODO ${text}`);
      expect(afterDone.marker).toBe('DONE');

      const todo = await service.changeBlockMarker(created.uuid, 'TODO');
      expect(todo).toMatchObject({ status: 'success', marker: 'TODO' });
      const afterTodo = await eventually(
        () => readBlock(created.uuid),
        (b) => b.marker === 'TODO',
      );
      expect(afterTodo.content).toContain(`TODO ${text}`);
      expect(afterTodo.marker).toBe('TODO');
    });

    // DB graphs keep the task state in the `logseq.property/status` property
    // instead of a TODO/DONE prefix in the block text.
    test.skipIf(!isDB)('cycles the status property TODO -> DONE -> TODO', async () => {
      const text = `marker-cycle-${Date.now()}`;
      const created = await service.client.appendBlock(TEST_PAGE, text);
      expect(created?.uuid).toBeTruthy();

      const statusOf = async () =>
        (await readBlock(created.uuid))[':logseq.property/status']?.ident;

      const done = await service.changeBlockMarker(created.uuid, 'DONE');
      expect(done).toMatchObject({ status: 'success', marker: 'DONE' });
      expect(
        await eventually(statusOf, (v) => v === ':logseq.property/status.done'),
      ).toBe(':logseq.property/status.done');
      // The block text is untouched, the badge marker is derived from the status.
      const rendered = await service.getBlock(created.uuid, 'Demo');
      expect(rendered.content).toContain(text);
      expect(rendered.marker).toBe('DONE');

      const todo = await service.changeBlockMarker(created.uuid, 'TODO');
      expect(todo).toMatchObject({ status: 'success', marker: 'TODO' });
      expect(
        await eventually(statusOf, (v) => v === ':logseq.property/status.todo'),
      ).toBe(':logseq.property/status.todo');

      const refused = await service.changeBlockMarker(created.uuid, 'NOW');
      expect(refused.status).toBe('failed');
      expect(await statusOf()).toBe(':logseq.property/status.todo');
    });

    test.skipIf(isDB)('refuses a scheduled task and leaves it untouched', async () => {
      const text = `marker-scheduled-${Date.now()}`;
      const created = await service.client.appendBlock(
        TEST_PAGE,
        `TODO ${text}\nSCHEDULED: <2030-01-01 Tue>`,
      );
      expect((await readBlock(created.uuid)).content).toContain('SCHEDULED:');

      const result = await service.changeBlockMarker(created.uuid, 'DONE');
      expect(result.status).toBe('failed');
      expect((await readBlock(created.uuid)).content).toContain(`TODO ${text}`);
    });
  });
});
