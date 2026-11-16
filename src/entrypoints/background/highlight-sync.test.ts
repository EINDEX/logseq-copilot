import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing';
import type { HighlightData } from '@/types/highlight';
import { highlights } from '@/utils/storage';

const calls = vi.hoisted(() => ({
  log: [] as string[],
  gates: [] as Array<() => void>,
  hold: false,
}));
const blocks = vi.hoisted(() => new Map<string, string>());

vi.mock('./logseq/tool', () => ({
  getLogseqService: async () => ({
    getGraph: async () => 'notes',
    readBlock: async (uuid: string) =>
      blocks.has(uuid) ? { texts: [blocks.get(uuid)!], hasChildren: false } : null,
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

import { syncHighlightNote } from './highlight-sync';

const highlight = (id: string, extra: Partial<HighlightData> = {}): HighlightData => ({
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
    blocks.delete('node-1');
    await expect(syncHighlightNote('linked')).rejects.toThrow(/gone from Logseq/);
    expect((await stored('linked'))?.note).toBe('one');
    blocks.set('node-1', '- the clip');
    await expect(syncHighlightNote('linked')).resolves.toBe(true);
  });
});
