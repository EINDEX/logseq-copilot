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
    expect(sendMessage).toHaveBeenCalledExactlyOnceWith('logseq:syncHighlightNote', { id: 'h1' });
    expect(container.querySelector('[data-comment-sync-error]')).toBeNull();
  });

  it('does not sync a highlight without a link to a clip', async () => {
    await open(base);
    await saveComment('a comment');
    expect((await highlights.getValue())[0].note).toBe('a comment');
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
    sendMessage.mockRejectedValueOnce(new Error('Cannot connect to Logseq.'));
    await open(linked);
    await saveComment('a comment');
    expect(container.querySelector('[data-comment-sync-error]')).not.toBeNull();

    await act(async () => button('Edit').click());
    await act(async () => button('Save').click());
    expect(sendMessage).toHaveBeenCalledTimes(2);
    expect(container.querySelector('[data-comment-sync-error]')).toBeNull();
  });
});
