import { beforeEach, describe, expect, it } from 'vitest';
import type { Annotation, LogseqLink } from '@/types/annotation';
import type { NoteBlockApi } from './note-blocks';
import { NodeGoneError, NoteSyncError, syncAnnotationNote } from './note-sync';

/** A graph in memory: blocks by uuid, and the calls that wrote to it. */
const makeGraph = (open = 'notes') => {
  const blocks = new Map<string, string>([['node-1', '- the clip']]);
  const writes: string[] = [];
  const withChildren = new Set<string>();
  let next = 0;
  const api: NoteBlockApi = {
    getGraph: async () => open,
    readBlock: async (uuid) =>
      blocks.has(uuid)
        ? { texts: [blocks.get(uuid)!], hasChildren: withChildren.has(uuid) }
        : null,
    insertChildBlock: async (parent, content) => {
      if (!blocks.has(parent)) throw new Error('no parent');
      const uuid = `new-${++next}`;
      blocks.set(uuid, content);
      writes.push(`insert ${parent} ${content}`);
      return { uuid };
    },
    updateBlockText: async (uuid, content) => {
      blocks.set(uuid, content);
      writes.push(`update ${uuid} ${content}`);
    },
    removeBlock: async (uuid) => {
      blocks.delete(uuid);
      writes.push(`remove ${uuid}`);
    },
  };
  return { api, blocks, writes, withChildren };
};

const annotation = (note: string | undefined, logseq?: LogseqLink): Annotation => ({
  id: 'h1',
  url: 'https://example.com/',
  title: 'Example',
  anchor: {
    kind: 'text-range',
    range: {
      startContainerXPath: '/html',
      endContainerXPath: '/html',
      startOffset: 0,
      endOffset: 1,
      textContent: 'x',
    },
  },
  ...(note !== undefined && { note }),
  ...(logseq && { logseq }),
});

const NODE: LogseqLink = { graph: 'notes', nodeUuid: 'node-1' };
const TRACKED: LogseqLink = { ...NODE, noteUuid: 'note-1', syncedText: 'first' };

let graph: ReturnType<typeof makeGraph>;
beforeEach(() => {
  graph = makeGraph();
  graph.blocks.set('note-1', 'first');
});

describe('syncAnnotationNote', () => {
  it('adds a comment as one child of the node, and tracks it', async () => {
    const link = await syncAnnotationNote(annotation('a comment', NODE), graph.api);
    expect(graph.writes).toEqual(['insert node-1 a comment']);
    expect(link).toEqual({ ...NODE, noteUuid: 'new-1', syncedText: 'a comment' });
  });

  it('keeps the Logseq syntax of the comment, neutralising what would split the block', async () => {
    await syncAnnotationNote(annotation('see [[Page]] #tag\n- not a bullet', NODE), graph.api);
    expect(graph.writes).toEqual(['insert node-1 see [[Page]] #tag\n\\- not a bullet']);
  });

  it('does nothing for a blank comment it never wrote', async () => {
    expect(await syncAnnotationNote(annotation('  ', NODE), graph.api)).toEqual(NODE);
    expect(graph.writes).toEqual([]);
  });

  it('updates the block it wrote while it still has the text it wrote', async () => {
    const link = await syncAnnotationNote(annotation('second', TRACKED), graph.api);
    expect(graph.writes).toEqual(['update note-1 second']);
    expect(link).toEqual({ ...NODE, noteUuid: 'note-1', syncedText: 'second' });
    // Again: the block now reads what the link says, so it is still ours.
    await syncAnnotationNote(annotation('third', link), graph.api);
    expect(graph.blocks.get('note-1')).toBe('third');
  });

  it('writes nothing when the comment is what is already there', async () => {
    const link = await syncAnnotationNote(annotation('first', TRACKED), graph.api);
    expect(graph.writes).toEqual([]);
    expect(link).toEqual(TRACKED);
  });

  it('adds a new child and tracks it when the user changed the block in Logseq, and leaves their edit', async () => {
    graph.blocks.set('note-1', 'first, edited in Logseq');
    const link = await syncAnnotationNote(annotation('second', TRACKED), graph.api);
    expect(graph.writes).toEqual(['insert node-1 second']);
    expect(graph.blocks.get('note-1')).toBe('first, edited in Logseq');
    expect(link).toEqual({ ...NODE, noteUuid: 'new-1', syncedText: 'second' });
  });

  it('removes the block on a blank comment when it is unchanged, and untracks it', async () => {
    const link = await syncAnnotationNote(annotation(undefined, TRACKED), graph.api);
    expect(graph.writes).toEqual(['remove note-1']);
    expect(graph.blocks.has('note-1')).toBe(false);
    expect(link).toEqual(NODE);
  });

  it('keeps an unchanged block that has blocks below it on a blank comment, and untracks it', async () => {
    graph.withChildren.add('note-1');
    const link = await syncAnnotationNote(annotation('', TRACKED), graph.api);
    expect(graph.writes).toEqual([]);
    expect(graph.blocks.has('note-1')).toBe(true);
    expect(link).toEqual(NODE);
  });

  it('keeps the block on a blank comment when the user changed it, and untracks it', async () => {
    graph.blocks.set('note-1', 'first, edited in Logseq');
    const link = await syncAnnotationNote(annotation('', TRACKED), graph.api);
    expect(graph.writes).toEqual([]);
    expect(graph.blocks.get('note-1')).toBe('first, edited in Logseq');
    expect(link).toEqual(NODE);
    // Untracked: a new comment is a new block, the edited one stays.
    await syncAnnotationNote(annotation('again', link), graph.api);
    expect(graph.writes).toEqual(['insert node-1 again']);
  });

  it('counts any text the block shows for itself (a DB graph has title and fullTitle)', async () => {
    graph.api.readBlock = async () => ({ texts: ['[[uuid]] note', 'first'], hasChildren: false });
    await syncAnnotationNote(annotation('second', TRACKED), graph.api);
    expect(graph.writes).toEqual(['update note-1 second']);
  });

  it('writes nothing and never recreates the node when it is gone', async () => {
    graph.blocks.delete('node-1');
    await expect(syncAnnotationNote(annotation('a comment', NODE), graph.api)).rejects.toThrow(
      NoteSyncError,
    );
    expect(graph.writes).toEqual([]);
    expect(graph.blocks.has('node-1')).toBe(false);
  });

  it('writes nothing when the node is gone and the block was changed', async () => {
    graph.blocks.delete('node-1');
    graph.blocks.set('note-1', 'edited');
    await expect(syncAnnotationNote(annotation('second', TRACKED), graph.api)).rejects.toThrow(
      /gone from Logseq/,
    );
    expect(graph.writes).toEqual([]);
  });

  it('tells a gone node (the link is dropped) from a gone comment block (it is written again)', async () => {
    graph.blocks.delete('node-1');
    graph.blocks.delete('note-1');
    await expect(syncAnnotationNote(annotation('second', TRACKED), graph.api)).rejects.toThrow(
      NodeGoneError,
    );
    await expect(syncAnnotationNote(annotation('a comment', NODE), graph.api)).rejects.toThrow(
      NodeGoneError,
    );

    expect(graph.writes).toEqual([]);
  });

  it('writes the comment as a new block when only the comment block is gone', async () => {
    graph.blocks.delete('note-1');
    const link = await syncAnnotationNote(annotation('second', TRACKED), graph.api);
    expect(graph.writes).toEqual(['insert node-1 second']);
    expect(link).toMatchObject({ nodeUuid: 'node-1', syncedText: 'second' });
    expect(link?.noteUuid).not.toBe('note-1');
  });

  it('writes nothing, and forgets the block, when the comment block is gone and the comment blank', async () => {
    graph.blocks.delete('note-1');
    const link = await syncAnnotationNote(annotation('', TRACKED), graph.api);
    expect(graph.writes).toEqual([]);
    expect(link).toEqual({ graph: 'notes', nodeUuid: 'node-1' });
  });

  it('writes nothing when another graph is open, and says which one to open', async () => {
    const other = makeGraph('other');
    await expect(syncAnnotationNote(annotation('a comment', NODE), other.api)).rejects.toThrow(
      /graph "notes".*"other" is open/,
    );
    expect(other.writes).toEqual([]);
  });

  it('never syncs an annotation without a link', async () => {
    expect(await syncAnnotationNote(annotation('a comment'), graph.api)).toBeUndefined();
    expect(graph.writes).toEqual([]);
  });

  it('does not read the anchor: any kind of annotation syncs the same', async () => {
    const media = {
      ...annotation('at 1:23', NODE),
      anchor: { kind: 'media-time', seconds: 83 },
    } as unknown as Annotation;
    await syncAnnotationNote(media, graph.api);
    expect(graph.writes).toEqual(['insert node-1 at 1:23']);
  });

  it('passes on what Logseq refuses', async () => {
    graph.api.insertChildBlock = async () => {
      throw new Error('Logseq said no');
    };
    await expect(syncAnnotationNote(annotation('a comment', NODE), graph.api)).rejects.toThrow(
      'Logseq said no',
    );
  });
});
