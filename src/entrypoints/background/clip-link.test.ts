/**
 * What a highlight records of its clip: a clip is rendered and written for
 * real (renderClip, writeClipBlocks), only Logseq is a recording writer.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing';
import { linkFromClip } from '@/types/annotation';
import { templates } from '@/utils/storage';
import { clipToLogseq } from './clip';
import { writeClipBlocks } from './logseq/clip-blocks';

const writes: string[] = [];
const blocks = new Map<string, string>();
// A group target exists when a test says so.
const state = vi.hoisted(() => ({ group: false }));

vi.mock('./logseq/tool', () => ({
  getLogseqService: async () => {
    let next = 0;
    const write = async (parent: string, content: string) => {
      const uuid = `b${++next}`;
      blocks.set(uuid, content);
      writes.push(`${parent} | ${content}`);
      return { uuid };
    };
    return {
      getGraph: async () => 'notes',
      client: { getUserConfig: async () => ({ preferredDateFormat: 'yyyy-MM-dd' }) },
      clipBlocks: (page: string, root: never, opts: { group?: unknown }) =>
        writeClipBlocks(
          page,
          root,
          { append: (to, content) => write(to, content), insertChild: write },
          undefined,
          state.group && opts.group ? { uuid: 'T' } : undefined,
        ),
    };
  },
}));

const NOTE_BULLET = '- [{{title}}]({{url}})\n  - {{note}}\n  - {{content}}';
const NO_NOTE_TAG = '- [{{title}}]({{url}})\n  - {{content}}';
const INLINE = '- [{{title}}]({{url}}) {{note}}\n  - {{content}}';

const clip = async (template: string, note: string | null = 'my note') => {
  await templates.setValue([
    { id: 't', name: 'T', content: template, clipNoteLocation: 'customPage', clipNoteCustomPage: 'P' },
  ] as never);
  return await clipToLogseq({
    url: 'https://example.com/a',
    title: 'A',
    data: 'quote',
    templateId: 't',
    ...(note !== null && { note }),
  });
};

beforeEach(() => {
  fakeBrowser.reset();
  writes.length = 0;
  blocks.clear();
  state.group = false;
});

describe('the link of a highlight to its clip', () => {
  it('tracks a bullet that has only {{note}}, with the text written to it', async () => {
    const link = linkFromClip(await clip(NOTE_BULLET, 'a [[linked]] note'));
    expect(link).toEqual({
      graph: 'notes',
      nodeUuid: 'b1',
      noteUuid: 'b2',
      syncedText: 'a [[linked]] note',
    });
    expect(blocks.get('b2')).toBe('a [[linked]] note');
  });

  it('tracks the child a template without {{note}} gets, last under the root', async () => {
    const link = linkFromClip(await clip(NO_NOTE_TAG, 'fallback note'));
    expect(writes.at(-1)).toBe('b1 | fallback note');
    expect(link).toMatchObject({ nodeUuid: 'b1', noteUuid: 'b3', syncedText: 'fallback note' });
  });

  it('does not track an inline {{note}}', async () => {
    const link = linkFromClip(await clip(INLINE, 'inline note'));
    expect(blocks.get('b1')).toContain('inline note');
    expect(link).toEqual({ graph: 'notes', nodeUuid: 'b1' });
  });

  it('tracks nothing of the note when there is none', async () => {
    expect(linkFromClip(await clip(NOTE_BULLET, null))).toEqual({
      graph: 'notes',
      nodeUuid: 'b1',
    });
  });

  it('links a grouped clip to the node it added under the root, and its note below it', async () => {
    state.group = true;
    const link = linkFromClip(
      await clip('- [{{title}}]({{url}})\n  - {{content}}\n  - {{note}}', 'grouped note'),
    );
    // The one child the clip added to the root `T` is the node; the note is its child.
    expect(writes).toEqual(['T | quote', 'b1 | grouped note']);
    expect(link).toEqual({
      graph: 'notes',
      nodeUuid: 'b1',
      noteUuid: 'b2',
      syncedText: 'grouped note',
    });
  });

  it('links a grouped clip whose note comes first to the note block, which is the node', async () => {
    state.group = true;
    const link = linkFromClip(await clip(NOTE_BULLET, 'grouped note'));
    // The first block of the clip is the node, the content goes below it.
    expect(writes).toEqual(['T | grouped note', 'b1 | quote']);
    expect(link).toEqual({
      graph: 'notes',
      nodeUuid: 'b1',
      noteUuid: 'b1',
      syncedText: 'grouped note',
    });
  });

  it('has no link when a grouped clip added nothing', async () => {
    state.group = true;
    expect(linkFromClip(await clip('- [{{title}}]({{url}})\n  - {{content}}', null).then((r) => ({ ...r, added: false })))).toBeUndefined();
  });
});
