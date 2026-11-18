import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { fakeBrowser } from 'wxt/testing';
import type { HighlightData } from '@/types/highlight';
import { highlights } from '@/utils/storage';

const sendMessage = vi.fn();
vi.mock('@/types/messaging', () => ({
  sendMessage: (...args: unknown[]) => sendMessage(...args),
}));
vi.mock('@/assets/globals.css', () => ({}));

import { HighlightCommentPopup } from './HighlightCommentPopup';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const base: HighlightData = {
  id: 'h1',
  url: 'https://example.com/',
  title: 'Example',
  hostname: 'example.com',
  range: {
    startContainerXPath: '/html',
    endContainerXPath: '/html',
    startOffset: 0,
    endOffset: 5,
    textContent: 'hello',
  },
  createdAt: 1,
  lastAccessedAt: 1,
};
const linked: HighlightData = { ...base, logseq: { graph: 'notes', nodeUuid: 'n1' } };

let container: HTMLDivElement;
let root: Root;

const open = async (highlight: HighlightData) => {
  await highlights.setValue([highlight]);
  await act(async () => {
    root.render(
      <HighlightCommentPopup
        highlightData={highlight}
        position={{ x: 0, y: 0 }}
        onClose={() => {}}
        onUpdate={() => {}}
        onDelete={() => {}}
      />,
    );
  });
};

const button = (name: string) =>
  [...container.querySelectorAll('button')].find((b) => b.textContent?.includes(name))!;

const saveComment = async (text: string) => {
  await act(async () => button('Edit').click());
  const area = container.querySelector('textarea')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(area, text);
    area.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => button('Save').click());
};

beforeEach(() => {
  fakeBrowser.reset();
  sendMessage.mockReset().mockResolvedValue(true);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('HighlightCommentPopup comment sync', () => {
  it('saves the comment, then syncs it to Logseq', async () => {
    await open(linked);
    await saveComment('a comment');
    expect((await highlights.getValue())[0].note).toBe('a comment');
    expect(sendMessage).toHaveBeenCalledWith('logseq:syncHighlightNote', { id: 'h1' });
    expect(container.querySelector('[data-comment-sync-error]')).toBeNull();
  });

  it('does not sync a highlight without a link to a clip', async () => {
    await open(base);
    await saveComment('a comment');
    expect((await highlights.getValue())[0].note).toBe('a comment');
    // Not asked about either: it has no clip.
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('shows why the comment is not in Logseq, and keeps the comment', async () => {
    sendMessage.mockRejectedValue(
      new Error('The clip is gone from Logseq, so the comment was not synced.'),
    );
    await open(linked);
    await saveComment('a comment');
    expect((await highlights.getValue())[0].note).toBe('a comment');
    expect(container.querySelector('[data-comment-sync-error]')?.textContent).toBe(
      'The clip is gone from Logseq, so the comment was not synced.',
    );
  });

  it('tries again on the next save after a failure, also with the same comment, and clears the message', async () => {
    let failed = false;
    sendMessage.mockImplementation(async (type: string) => {
      if (type === 'logseq:syncHighlightNote' && !failed) {
        failed = true;
        throw new Error('Cannot connect to Logseq.');
      }
      return type === 'logseq:checkHighlightLinks' ? [] : true;
    });
    await open(linked);
    await saveComment('a comment');
    expect(container.querySelector('[data-comment-sync-error]')).not.toBeNull();

    await act(async () => button('Edit').click());
    await act(async () => button('Save').click());
    expect(sendMessage.mock.calls.filter(([type]) => type === 'logseq:syncHighlightNote')).toHaveLength(2);
    expect(container.querySelector('[data-comment-sync-error]')).toBeNull();
  });
});

describe('HighlightCommentPopup clip deleted in Logseq', () => {
  const removed = () => container.querySelector('[data-removed-from-logseq]');

  it('asks once when it opens for a linked highlight, and says nothing while the clip is there', async () => {
    sendMessage.mockResolvedValue([]);
    await open(linked);
    expect(sendMessage).toHaveBeenCalledExactlyOnceWith('logseq:checkHighlightLinks', { ids: ['h1'] });
    expect(removed()).toBeNull();
  });

  it('shows that the highlight was removed from Logseq when the clip is gone', async () => {
    sendMessage.mockResolvedValue(['h1']);
    await open(linked);
    expect(removed()?.textContent).toBe('Removed from Logseq');
  });

  it('shows nothing when Logseq could not be asked', async () => {
    sendMessage.mockRejectedValue(new Error('Cannot connect to Logseq.'));
    await open(linked);
    expect(removed()).toBeNull();
  });

  it('does not ask for a highlight without a link', async () => {
    await open(base);
    expect(sendMessage).not.toHaveBeenCalled();
    expect(removed()).toBeNull();
  });

  it('saves a comment locally, without an error, when the sync finds the clip gone', async () => {
    sendMessage.mockImplementation(async (type: string) =>
      type === 'logseq:checkHighlightLinks' ? [] : false,
    );
    await open(linked);
    await saveComment('a comment');
    expect((await highlights.getValue())[0].note).toBe('a comment');
    expect(container.querySelector('[data-comment-sync-error]')).toBeNull();
    expect(removed()?.textContent).toBe('Removed from Logseq');
  });
});
