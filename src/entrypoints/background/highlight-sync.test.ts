import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing';
import type { HighlightData, TextHighlightData } from '@/types/highlight';
import { highlights } from '@/utils/storage';

const calls = vi.hoisted(() => ({
  log: [] as string[],
  gates: [] as Array<() => void>,
  hold: false,
}));
const blocks = vi.hoisted(() => new Map<string, string>());
const logseq = vi.hoisted(() => ({
  graph: 'notes',
  /** What reading a block does: fails when set. */
  readError: null as Error | null,
  reads: [] as string[],
}));

vi.mock('./logseq/tool', () => ({
  getLogseqService: async () => ({
    getGraph: async () => logseq.graph,
    readBlock: async (uuid: string) => {
      logseq.reads.push(uuid);
      if (logseq.readError) throw logseq.readError;
      return blocks.has(uuid) ? { texts: [blocks.get(uuid)!], hasChildren: false } : null;
    },
    insertChildBlock: async (parent: string, content: string) => {
      calls.log.push(`insert start ${content}`);
      // A test that asks for it holds the first write until it lets it go.
      if (calls.hold && calls.gates.length === 0 && content === 'one') {
        await new Promise<void>((resolve) => calls.gates.push(resolve));
      }
      const uuid = `c-${content}`;
      blocks.set(uuid, content);
      calls.log.push(`insert end ${content} under ${parent}`);
      return { uuid };
    },
    updateBlockText: async (uuid: string, content: string) => {
      calls.log.push(`update ${uuid} ${content}`);
      blocks.set(uuid, content);
    },
    removeBlock: async (uuid: string) => {
      calls.log.push(`remove ${uuid}`);
      blocks.delete(uuid);
    },
  }),
}));

import { checkHighlightLinks, syncHighlightNote } from './highlight-sync';
import { deleteHighlight } from '@/utils/highlight-service';

const highlight = (id: string, extra: Partial<TextHighlightData> = {}): TextHighlightData => ({
  id,
  url: 'https://example.com/',
  title: 'Example',
  hostname: 'example.com',
  range: {
    startContainerXPath: '/html',
    endContainerXPath: '/html',
    startOffset: 0,
    endOffset: 1,
    textContent: 'x',
  },
  createdAt: 1,
  lastAccessedAt: 1,
  ...extra,
});

const stored = async (id: string) => (await highlights.getValue()).find((h) => h.id === id);
const setNote = async (id: string, note: string) =>
  highlights.setValue(
    (await highlights.getValue()).map((h) => (h.id === id ? { ...h, note } : h)),
  );

beforeEach(async () => {
  fakeBrowser.reset();
  calls.log.length = 0;
  calls.gates.length = 0;
  calls.hold = false;
  logseq.graph = 'notes';
  logseq.readError = null;
  logseq.reads.length = 0;
  blocks.clear();
  blocks.set('node-1', '- the clip');
  await highlights.setValue([
    highlight('linked', { note: 'one', logseq: { graph: 'notes', nodeUuid: 'node-1' } }),
    highlight('other', { note: 'x', logseq: { graph: 'notes', nodeUuid: 'node-1' } }),
    highlight('older', { note: 'old' }),
  ]);
});

describe('syncHighlightNote', () => {
  it('writes the comment and keeps the link to it with the highlight', async () => {
    await expect(syncHighlightNote('linked')).resolves.toBe(true);
    expect((await stored('linked'))?.logseq).toEqual({
      graph: 'notes',
      nodeUuid: 'node-1',
      noteUuid: 'c-one',
      syncedText: 'one',
    });
    expect(calls.log).toEqual(['insert start one', 'insert end one under node-1']);
  });

  it('has nothing to sync for a highlight without a link, or one that is gone', async () => {
    await expect(syncHighlightNote('older')).resolves.toBe(false);
    await expect(syncHighlightNote('missing')).resolves.toBe(false);
    expect(calls.log).toEqual([]);
  });

  it('runs the syncs of one highlight one after the other, the second with the latest note and link', async () => {
    calls.hold = true;
    const first = syncHighlightNote('linked');
    await vi.waitFor(() => expect(calls.gates).toHaveLength(1));
    await setNote('linked', 'two');
    const second = syncHighlightNote('linked');
    // The second has not started while the first is writing.
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(calls.log).toEqual(['insert start one']);

    calls.gates[0]();
    await Promise.all([first, second]);
    // One comment block, updated: not two inserts.
    expect(calls.log).toEqual([
      'insert start one',
      'insert end one under node-1',
      'update c-one two',
    ]);
    expect((await stored('linked'))?.logseq).toMatchObject({
      noteUuid: 'c-one',
      syncedText: 'two',
    });
  });

  it('does not hold up another highlight', async () => {
    calls.hold = true;
    const first = syncHighlightNote('linked');
    await vi.waitFor(() => expect(calls.gates).toHaveLength(1));
    await expect(syncHighlightNote('other')).resolves.toBe(true);
    calls.gates[0]();
    await first;
  });

  it('a failed sync does not hold up the next one, and leaves the local note', async () => {
    logseq.graph = 'another';
    await expect(syncHighlightNote('linked')).rejects.toThrow(/"another" is open/);
    expect((await stored('linked'))?.note).toBe('one');
    // Another open graph is not a deleted clip: the link stays.
    expect((await stored('linked'))?.logseq).toBeDefined();
    logseq.graph = 'notes';
    await expect(syncHighlightNote('linked')).resolves.toBe(true);
  });
});

describe('a clip that was deleted in Logseq', () => {
  it('drops the link of the highlight and keeps everything else, when a sync finds the node gone', async () => {
    blocks.delete('node-1');
    await expect(syncHighlightNote('linked')).resolves.toBe(false);
    const after = await stored('linked');
    expect(after?.logseq).toBeUndefined();
    expect(after?.note).toBe('one');
    expect(after?.range?.textContent).toBe('x');
    // Nothing was written to Logseq, and the next save is local only.
    expect(calls.log).toEqual([]);
    await expect(syncHighlightNote('linked')).resolves.toBe(false);
    expect(calls.log).toEqual([]);
  });

  it('does not bring a dropped link back when a sync that was running ends', async () => {
    calls.hold = true;
    const sync = syncHighlightNote('linked');
    await vi.waitFor(() => expect(calls.gates).toHaveLength(1));
    blocks.delete('node-1');
    await expect(checkHighlightLinks(['linked'])).resolves.toEqual(['linked']);
    calls.gates[0]();
    await sync;
    expect((await stored('linked'))?.logseq).toBeUndefined();
  });
});

describe('checkHighlightLinks', () => {
  it('unlinks the highlights whose node is gone, with one read per node', async () => {
    blocks.delete('node-1');
    await expect(checkHighlightLinks(['linked', 'other', 'older'])).resolves.toEqual([
      'linked',
      'other',
    ]);
    expect(logseq.reads).toEqual(['node-1']);
    expect((await stored('linked'))).toMatchObject({ note: 'one' });
    expect((await stored('linked'))?.logseq).toBeUndefined();
    expect((await stored('other'))?.logseq).toBeUndefined();
  });

  it('leaves a highlight whose node is there, and one that was not asked about', async () => {
    await expect(checkHighlightLinks(['linked'])).resolves.toEqual([]);
    expect((await stored('linked'))?.logseq).toBeDefined();
    blocks.delete('node-1');
    await checkHighlightLinks(['linked']);
    expect((await stored('other'))?.logseq).toBeDefined();
  });

  it('does not touch the highlights of a graph that is not the open one', async () => {
    logseq.graph = 'another';
    blocks.delete('node-1');
    await expect(checkHighlightLinks(['linked'])).resolves.toEqual([]);
    expect(logseq.reads).toEqual([]);
    expect((await stored('linked'))?.logseq).toBeDefined();
  });

  it('changes nothing when Logseq cannot be asked', async () => {
    logseq.readError = new Error('Cannot connect to Logseq.');
    await expect(checkHighlightLinks(['linked'])).resolves.toEqual([]);
    expect((await stored('linked'))?.logseq).toBeDefined();
  });

  it('writes nothing to Logseq, and nothing to storage when nothing is gone', async () => {
    await checkHighlightLinks(['linked', 'other']);
    blocks.delete('node-1');
    await checkHighlightLinks(['linked']);
    expect(calls.log).toEqual([]);
  });
});

describe('deleting a highlight', () => {
  it('never touches Logseq: the clip and the comment block stay', async () => {
    await syncHighlightNote('linked');
    const written = [...calls.log];
    const before = new Map(blocks);

    await deleteHighlight('linked');

    expect(await stored('linked')).toBeUndefined();
    expect(calls.log).toEqual(written);
    expect(blocks).toEqual(before);
    expect(logseq.reads.filter((u) => u === 'c-one')).toEqual([]);
  });
});
