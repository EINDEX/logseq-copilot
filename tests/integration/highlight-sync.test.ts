/**
 * Syncing the comment of a highlight to its clip (see
 * background/logseq/note-sync.ts), against a real Logseq app, for both graph
 * types. Clips go to the fixture page, never to today's journal: a file graph
 * re-reads a journal file it has just created, which can undo later edits.
 */
import { beforeAll, describe, expect, inject, test } from 'vitest';
import { fakeBrowser } from 'wxt/testing';
import { highlightToAnnotation, linkFromClip, type LogseqLink } from '@/types/annotation';
import type { HighlightData } from '@/types/highlight';
import {
  highlights,
  logseqAuthTokenItem,
  logseqHostNameItem,
  logseqPortItem,
  templates,
} from '@/utils/storage';
import { getLogseqService } from '@/entrypoints/background/logseq/tool';
import { clipToLogseq } from '@/entrypoints/background/clip';
import { syncAnnotationNote, NoteSyncError } from '@/entrypoints/background/logseq/note-sync';
import { checkHighlightLinks, syncHighlightNote } from '@/entrypoints/background/highlight-sync';
import { deleteHighlight } from '@/utils/highlight-service';
import { blockTexts } from '@/entrypoints/background/logseq/clip-blocks';

const variant = inject('logseqVariant');
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
  return await resp.json().catch(() => null);
};

const eventually = async <T>(fn: () => Promise<T>, ok: (v: T) => boolean) => {
  let value = await fn();
  for (let i = 0; i < 40 && !ok(value); i++) {
    await new Promise((r) => setTimeout(r, 500));
    value = await fn();
  }
  return value;
};

/** What the block shows now, with its children: the text, and the texts below it. */
interface Seen {
  text: string;
  children: string[];
}
const text = (block: any) => blockTexts(block)[0] ?? '';
const read = async (uuid: string): Promise<Seen | null> => {
  const block = await api('logseq.Editor.getBlock', [uuid, { includeChildren: true }]);
  if (!block || block.error) return null;
  return { text: text(block), children: (block.children ?? []).map(text) };
};
/** The children of the node, after Logseq has them. */
const childrenOf = async (uuid: string, count: number) =>
  (await eventually(async () => (await read(uuid))?.children ?? [], (c) => c.length >= count));

const location = { clipNoteLocation: 'customPage', clipNoteCustomPage: TEST_PAGE };
/** The note is a bullet of its own, before the content. */
const NOTE_BULLET = {
  id: 's-bullet',
  name: 'Note bullet',
  content: '- [{{title}}]({{url}})\n  - {{note}}\n  - {{content}}',
  ...location,
};
/** No {{note}}: a note becomes the last child of the root. */
const FALLBACK = {
  id: 's-fallback',
  name: 'Fallback note',
  content: '- [{{title}}]({{url}})\n  - {{content}}',
  ...location,
};
/** {{note}} inside the root's own line. */
const INLINE = {
  id: 's-inline',
  name: 'Inline note',
  content: '- [{{title}}]({{url}}) {{note}}\n  - {{content}}',
  ...location,
};

beforeAll(async () => {
  fakeBrowser.reset();
  const apiUrl = new URL(inject('logseqApi'));
  await logseqHostNameItem.setValue(apiUrl.hostname);
  await logseqPortItem.setValue(Number(apiUrl.port));
  await logseqAuthTokenItem.setValue(inject('logseqToken'));
  await templates.setValue([NOTE_BULLET, FALLBACK, INLINE]);
});

let counter = 0;
const clip = async (templateId: string, note?: string, page = `sync-${Date.now()}-${++counter}`) => {
  const result = await clipToLogseq({
    url: `https://example.com/${page}`,
    title: `Sync ${page}`,
    data: `Quote ${page}`,
    templateId,
    ...(note !== undefined && { note }),
  });
  const link = linkFromClip(result);
  expect(link, 'the clip is linked').toBeDefined();
  return { result, link: link!, page };
};

/** The annotation of a highlight on that link, with `note`. */
const annotate = (link: LogseqLink | undefined, note?: string) =>
  highlightToAnnotation({
    id: 'h',
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
    ...(note !== undefined && { note }),
    ...(link && { logseq: link }),
  } as HighlightData);

const sync = async (link: LogseqLink | undefined, note?: string) =>
  await syncAnnotationNote(annotate(link, note), await getLogseqService());

describe(`syncing highlight comments (${variant})`, () => {
  test('the clip links its highlight to the note block it wrote, the comment replaces it', async () => {
    const { link } = await clip('s-bullet', 'first note');
    expect(link.noteUuid).toBeDefined();
    expect(link.syncedText).toBe('first note');
    // The note block holds the note (the content is a sibling).
    expect((await read(link.noteUuid!))?.text).toBe('first note');

    const edited = await sync(link, 'second note');
    expect(edited).toMatchObject({ nodeUuid: link.nodeUuid, noteUuid: link.noteUuid, syncedText: 'second note' });
    expect((await read(link.noteUuid!))?.text).toBe('second note');
    // Still one note block: nothing was added.
    expect(await childrenOf(link.nodeUuid, 2)).toHaveLength(2);
  });

  test('a comment on a clip without a note block is one new last child of the clip node', async () => {
    const { link } = await clip('s-fallback');
    expect(link.noteUuid).toBeUndefined();
    const before = await childrenOf(link.nodeUuid, 1);
    expect(before).toHaveLength(1);

    // Logseq syntax stays live: a DB graph stores the page and the tag by uuid.
    const added = await sync(link, 'a comment\nwith [[Copilot Test Page]] and #tag');
    expect(added?.noteUuid).toBeDefined();
    const children = await childrenOf(link.nodeUuid, 2);
    expect(children).toHaveLength(2);
    expect(children[1]).toContain('a comment\nwith [[');
    expect(children[1]).toMatch(/and #/);

    // Edit: the same block, not a third child.
    const edited = await sync(added, 'edited comment');
    expect(edited?.noteUuid).toBe(added!.noteUuid);
    expect((await read(added!.noteUuid!))?.text).toBe('edited comment');
    expect(await childrenOf(link.nodeUuid, 2)).toHaveLength(2);
  });

  test('an inline {{note}} is not tracked: the first comment is a new child', async () => {
    const { link } = await clip('s-inline', 'inline note');
    expect(link).toEqual({ graph: link.graph, nodeUuid: link.nodeUuid });
    const added = await sync(link, 'later comment');
    expect(added?.noteUuid).toBeDefined();
    expect((await read(added!.noteUuid!))?.text).toBe('later comment');
  });

  test('a block the user changed in Logseq is left alone: the new comment is a new child', async () => {
    const { link } = await clip('s-bullet', 'original');
    await api('logseq.Editor.updateBlock', [link.noteUuid, 'original, my own edit']);
    await eventually(async () => (await read(link.noteUuid!))?.text, (t) => t === 'original, my own edit');

    const added = await sync(link, 'new comment');
    expect(added?.noteUuid).not.toBe(link.noteUuid);
    expect(added?.syncedText).toBe('new comment');
    expect((await read(link.noteUuid!))?.text).toBe('original, my own edit');
    expect((await read(added!.noteUuid!))?.text).toBe('new comment');
    // The new block is the last child of the node.
    const children = await childrenOf(link.nodeUuid, 3);
    expect(children[children.length - 1]).toBe('new comment');
  });

  test('a blank comment removes the block it wrote, and untracks it', async () => {
    const { link } = await clip('s-bullet', 'to be removed');
    const untracked = await sync(link, '');
    expect(untracked).toEqual({ graph: link.graph, nodeUuid: link.nodeUuid });
    await eventually(async () => await read(link.noteUuid!), (b) => b === null);
    expect(await read(link.noteUuid!)).toBeNull();
    // The node, and the content below it, are still there.
    expect(await read(link.nodeUuid)).not.toBeNull();
  });

  test('a blank comment keeps a block the user changed, and untracks it', async () => {
    const { link } = await clip('s-bullet', 'will be changed');
    await api('logseq.Editor.updateBlock', [link.noteUuid, 'changed by me']);
    await eventually(async () => (await read(link.noteUuid!))?.text, (t) => t === 'changed by me');

    const untracked = await sync(link, undefined);
    expect(untracked).toEqual({ graph: link.graph, nodeUuid: link.nodeUuid });
    expect((await read(link.noteUuid!))?.text).toBe('changed by me');
  });

  test('writes nothing, and does not recreate the node, when the node is gone', async () => {
    const { link } = await clip('s-fallback');
    await api('logseq.Editor.removeBlock', [link.nodeUuid]);
    await eventually(async () => await read(link.nodeUuid), (b) => b === null);

    const comment = `never written ${Date.now()}`;
    await expect(sync(link, comment)).rejects.toThrow(NoteSyncError);
    expect(await read(link.nodeUuid)).toBeNull();
    const tree = await api('logseq.Editor.getPageBlocksTree', [TEST_PAGE]);
    expect(JSON.stringify(tree)).not.toContain(comment);
  });

  test('writes the comment as a new last child when the note block is gone, nothing for a blank one', async () => {
    const { link } = await clip('s-bullet', 'soon gone');
    await api('logseq.Editor.removeBlock', [link.noteUuid]);
    await eventually(async () => await read(link.noteUuid!), (b) => b === null);

    // A blank comment writes nothing and forgets the block.
    expect(await sync(link, '')).toEqual({ graph: link.graph, nodeUuid: link.nodeUuid });
    expect(await childrenOf(link.nodeUuid, 1)).toHaveLength(1);

    const written = await sync(link, 'edited');
    expect(written).toMatchObject({ nodeUuid: link.nodeUuid, syncedText: 'edited' });
    expect(written?.noteUuid).not.toBe(link.noteUuid);
    expect((await read(written!.noteUuid!))?.text).toBe('edited');
    expect(await read(link.noteUuid!)).toBeNull();
    expect((await childrenOf(link.nodeUuid, 2))[1]).toBe('edited');
  });

  test('writes nothing when the linked graph is not the open one', async () => {
    const { link } = await clip('s-fallback');
    await expect(sync({ ...link, graph: 'some-other-graph' }, 'a comment')).rejects.toThrow(
      /some-other-graph/,
    );
    expect(await childrenOf(link.nodeUuid, 1)).toHaveLength(1);
  });

  test('never syncs a highlight that has no link', async () => {
    expect(await sync(undefined, 'a comment')).toBeUndefined();
  });

  test('a clip grouped under an existing root: the comment goes under this clip\'s node', async () => {
    const template = {
      id: 's-grouped',
      name: 'Grouped note',
      content: '- #[[Clip]] [{{title}}]({{url}})\n  - {{content}}\n  - {{note}}',
      ...location,
    };
    await templates.setValue([NOTE_BULLET, FALLBACK, INLINE, template]);
    const stamp = `grp-${Date.now()}`;
    const source = (data: string) => ({
      url: `https://example.com/${stamp}`,
      title: `Grouped ${stamp}`,
      data,
      templateId: 's-grouped',
    });
    const first = await clipToLogseq({ ...source('First quote'), note: 'first note' });
    const second = await clipToLogseq(source('Second quote'));
    const link = linkFromClip(second)!;
    expect(second.added).toBe(true);
    // This clip's node is its own child of the root, not the root.
    expect(link.nodeUuid).not.toBe(first.rootUuid);
    expect(link.noteUuid).toBeUndefined();
    const rootChildren = await childrenOf(first.rootUuid, 3);
    expect(rootChildren).toEqual(['First quote', 'first note', 'Second quote']);

    const added = await sync(link, 'comment on the second');
    expect(added?.noteUuid).toBeDefined();
    // The comment is the last child of the second clip's node ...
    expect(await childrenOf(link.nodeUuid, 1)).toEqual(['comment on the second']);
    // ... and the root, with the first clip's node and note, got nothing.
    expect(await childrenOf(first.rootUuid, 3)).toEqual(['First quote', 'first note', 'Second quote']);
  });

  test('a grouped clip with a note: the comment edits that note, under the clip\'s node', async () => {
    const stamp = `grn-${Date.now()}`;
    const source = (data: string) => ({
      url: `https://example.com/${stamp}`,
      title: `Grouped ${stamp}`,
      data,
      templateId: 's-grouped',
    });
    await clipToLogseq(source('First quote'));
    const second = await clipToLogseq({ ...source('Second quote'), note: 'second note' });
    const link = linkFromClip(second)!;
    expect(await childrenOf(link.nodeUuid, 1)).toEqual(['second note']);

    const edited = await sync(link, 'the comment replaces it');
    expect(edited?.noteUuid).toBe(link.noteUuid);
    expect(await childrenOf(link.nodeUuid, 1)).toEqual(['the comment replaces it']);
  });

  test('quick edits of one highlight are written one after the other, to one block', async () => {
    const { link } = await clip('s-fallback');
    await highlights.setValue([
      {
        id: 'queued',
        url: 'https://example.com/queued',
        title: 'Queued',
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
        note: 'edit 1',
        logseq: link,
      },
    ]);
    const setNote = async (note: string) =>
      highlights.setValue((await highlights.getValue()).map((h) => ({ ...h, note })));

    const first = syncHighlightNote('queued');
    await setNote('edit 2');
    const second = syncHighlightNote('queued');
    await setNote('edit 3');
    const third = syncHighlightNote('queued');
    await Promise.all([first, second, third]);

    const stored = (await highlights.getValue())[0];
    expect(stored.logseq?.noteUuid).toBeDefined();
    expect(stored.logseq?.syncedText).toBe('edit 3');
    // The clip's content and one comment block: the edits did not each add one.
    const children = await childrenOf(link.nodeUuid, 2);
    expect(children).toHaveLength(2);
    expect(children[1]).toBe('edit 3');
  });

  describe('a clip deleted in Logseq', () => {
    const linkedHighlight = (id: string, link: LogseqLink, note: string): HighlightData => ({
      ...(annotate(link, note) as unknown as HighlightData),
      id,
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
      note,
      logseq: link,
    });
    const removeNode = async (uuid: string) => {
      await api('logseq.Editor.removeBlock', [uuid]);
      await eventually(() => read(uuid), (block) => block === null);
    };
    const stored = async (id: string) => (await highlights.getValue()).find((h) => h.id === id);

    test('the check drops the link of a highlight whose node was deleted, and only of it', async () => {
      const gone = await clip('s-bullet', 'first note');
      const kept = await clip('s-fallback');
      await highlights.setValue([
        linkedHighlight('gone', gone.link, 'first note'),
        linkedHighlight('kept', kept.link, 'kept note'),
      ]);

      // Nothing is gone yet.
      expect(await checkHighlightLinks(['gone', 'kept'])).toEqual([]);

      await removeNode(gone.link.nodeUuid);
      expect(await checkHighlightLinks(['gone', 'kept'])).toEqual(['gone']);

      const after = await stored('gone');
      expect(after?.logseq).toBeUndefined();
      expect(after?.note).toBe('first note');
      expect((await stored('kept'))?.logseq).toEqual(kept.link);
      // The clip that is still there was not touched.
      expect(await read(kept.link.nodeUuid)).not.toBeNull();
    });

    test('a sync that finds the node gone drops the link, writes nothing and does not fail', async () => {
      const { link } = await clip('s-fallback');
      await highlights.setValue([linkedHighlight('syncing', link, 'a comment')]);
      await removeNode(link.nodeUuid);

      expect(await syncHighlightNote('syncing')).toBe(false);
      expect((await stored('syncing'))?.logseq).toBeUndefined();
      expect((await stored('syncing'))?.note).toBe('a comment');
      // The node is not recreated.
      expect(await read(link.nodeUuid)).toBeNull();
    });

    test('a node that is there is not mistaken for a gone one, with or without its comment block', async () => {
      const { link } = await clip('s-bullet', 'first note');
      await highlights.setValue([linkedHighlight('present', link, 'first note')]);
      // Only the comment block is deleted: the node is still there.
      await removeNode(link.noteUuid!);
      expect(await checkHighlightLinks(['present'])).toEqual([]);
      expect((await stored('present'))?.logseq).toEqual(link);
    });

    test('deleting a highlight leaves the clip and its comment in Logseq', async () => {
      const { link } = await clip('s-fallback');
      await highlights.setValue([linkedHighlight('removed', link, 'a comment')]);
      await syncHighlightNote('removed');
      const written = (await stored('removed'))!.logseq!;
      expect(await childrenOf(link.nodeUuid, 2)).toHaveLength(2);

      await deleteHighlight('removed');

      expect(await stored('removed')).toBeUndefined();
      expect(await read(link.nodeUuid)).not.toBeNull();
      expect((await read(written.noteUuid!))?.text).toBe('a comment');
    });
  });
});
