import { describe, expect, it } from 'vitest';
import { highlightToAnnotation, linkFromClip } from './annotation';
import type { ClipResult } from './clip';
import type { HighlightData } from './highlight';

const clip = (extra: Partial<ClipResult> = {}): ClipResult => ({
  page: 'Inbox',
  graph: 'notes',
  templateId: 't',
  rootUuid: 'node-1',
  added: true,
  ...extra,
});

describe('linkFromClip', () => {
  it('links the node the clip added', () => {
    expect(linkFromClip(clip())).toEqual({ graph: 'notes', nodeUuid: 'node-1' });
  });

  it('tracks the note block with the text written to it (a {{note}} bullet, or the fallback child)', () => {
    expect(
      linkFromClip(clip({ noteBlockUuid: 'note-1', noteBlockText: 'my note' })),
    ).toEqual({
      graph: 'notes',
      nodeUuid: 'node-1',
      noteUuid: 'note-1',
      syncedText: 'my note',
    });
  });

  it('does not track an inline {{note}}: the clip names no note block', () => {
    const link = linkFromClip(clip());
    expect(link).not.toHaveProperty('noteUuid');
    expect(link).not.toHaveProperty('syncedText');
  });

  it('links a clip grouped under an existing root to the node it added, not to the root', () => {
    // `rootUuid` is the one node a clip adds, also when it joined a root.
    expect(linkFromClip(clip({ rootUuid: 'child-under-root' }))?.nodeUuid).toBe(
      'child-under-root',
    );
  });

  it('is no link when the clip added nothing, or does not say its graph', () => {
    expect(linkFromClip(clip({ added: false }))).toBeUndefined();
    expect(linkFromClip(clip({ graph: '' }))).toBeUndefined();
  });
});

describe('highlightToAnnotation', () => {
  const highlight: HighlightData = {
    id: 'h1',
    url: 'https://example.com/a',
    title: 'A',
    hostname: 'example.com',
    range: {
      startContainerXPath: '/html/body[1]/p[1]/text()[1]',
      endContainerXPath: '/html/body[1]/p[1]/text()[1]',
      startOffset: 0,
      endOffset: 5,
      textContent: 'hello',
    },
    createdAt: 1,
    lastAccessedAt: 1,
  };

  it('anchors a stored highlight to its text range', () => {
    expect(highlightToAnnotation(highlight)).toEqual({
      id: 'h1',
      url: 'https://example.com/a',
      title: 'A',
      anchor: { kind: 'text-range', range: highlight.range },
    });
  });

  it('carries the note and the link along', () => {
    const logseq = { graph: 'notes', nodeUuid: 'n' };
    expect(highlightToAnnotation({ ...highlight, note: 'hi', logseq })).toMatchObject({
      note: 'hi',
      logseq,
    });
  });
});
