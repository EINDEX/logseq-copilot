import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import type { Root } from 'react-dom/client';
import { contentEvents } from '@/utils/content-events';
import {
  CannotConnectWithLogseq,
  LogseqError,
  UnknownIssues,
} from '@/entrypoints/background/logseq/error';
import log from '@/utils/logger';

const sendMessage = vi.fn();
vi.mock('@/types/messaging', () => ({
  sendMessage: (...args: unknown[]) => sendMessage(...args),
}));
vi.mock('@/assets/globals.css', () => ({}));
vi.mock('./index.module.scss', () => ({ default: {} }));
vi.mock('../../assets/img/logo.png', () => ({ default: '' }));

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const selectParagraph = () => {
  const range = document.createRange();
  range.selectNodeContents(document.getElementById('p')!);
  window.getSelection()!.addRange(range);
};

describe('QuickCapture capture()', () => {
  beforeEach(async () => {
    sendMessage.mockReset();
    (globalThis as any).CSS = { highlights: new Map() };
    (globalThis as any).Highlight = class {
      add() {}
    };
    document.body.innerHTML = '<p id="p">hello world</p>';
    window.getSelection()?.removeAllRanges();
  });

  it('clips the whole page when nothing is selected', async () => {
    const { runClipCommand } = await import('./QuickCapture');
    await runClipCommand('selectionOrPage');
    expect(sendMessage).toHaveBeenCalledWith('logseq:clipPage');
  });

  it('clips the whole page when the selection is collapsed', async () => {
    const { runClipCommand } = await import('./QuickCapture');
    const p = document.getElementById('p')!;
    window.getSelection()!.collapse(p.firstChild, 2);
    await runClipCommand('selectionOrPage');
    expect(sendMessage).toHaveBeenCalledWith('logseq:clipPage');
  });

  it('clips the selected text when there is a selection', async () => {
    const { runClipCommand } = await import('./QuickCapture');
    selectParagraph();
    await runClipCommand('selectionOrPage');
    expect(sendMessage).toHaveBeenCalledWith(
      'logseq:clipWithSelection',
      'hello world',
    );
  });

  it('clips the page link only for the page command', async () => {
    const { runClipCommand } = await import('./QuickCapture');
    selectParagraph();
    await runClipCommand('page');
    expect(sendMessage).toHaveBeenCalledWith('logseq:clipPage');
    expect(sendMessage).not.toHaveBeenCalledWith(
      'logseq:clipWithSelection',
      expect.anything(),
    );
  });

  it('ignores quickCapture events dispatched on document by page scripts', async () => {
    await import('./QuickCapture');
    document.dispatchEvent(new Event('quickCapture'));
    document.dispatchEvent(new Event('quickCaptureWithSelection'));
    document.dispatchEvent(new Event('quickCapturePage'));
    expect(sendMessage).not.toHaveBeenCalled();
  });
});

describe('a failed clip (#48)', () => {
  const failures: string[] = [];
  let off: () => void;

  beforeEach(() => {
    sendMessage.mockReset();
    vi.spyOn(log, 'error').mockImplementation(() => {});
    document.body.innerHTML = '<p id="p">hello world</p>';
    window.getSelection()?.removeAllRanges();
    failures.length = 0;
    off = contentEvents.on('clipFailed', ({ message }) => failures.push(message));
  });

  afterEach(() => off());

  it('started in the page (shortcut, context menu) is shown in the page, and the command resolves', async () => {
    const { runClipCommand } = await import('./QuickCapture');
    sendMessage.mockRejectedValue(new LogseqError(CannotConnectWithLogseq));

    await expect(runClipCommand('selectionOrPage')).resolves.toBeUndefined();
    await expect(runClipCommand('page', { feedback: 'page' })).resolves.toBeUndefined();

    expect(failures).toEqual([CannotConnectWithLogseq.msg, CannotConnectWithLogseq.msg]);
  });

  it('of a selection is reported once the clip fails, not when the highlight is saved', async () => {
    const { runClipCommand } = await import('./QuickCapture');
    selectParagraph();
    sendMessage.mockRejectedValue(new LogseqError(CannotConnectWithLogseq));

    await runClipCommand('selectionOrPage');

    expect(failures).toEqual([CannotConnectWithLogseq.msg]);
  });

  it('asked for by the popup rejects with the message, and shows nothing in the page', async () => {
    const { runClipCommand } = await import('./QuickCapture');
    selectParagraph();
    sendMessage.mockRejectedValue(new LogseqError(CannotConnectWithLogseq));

    await expect(
      runClipCommand('selectionOrPage', { feedback: 'sender' }),
    ).rejects.toThrow(CannotConnectWithLogseq.msg);

    expect(failures).toEqual([]);
  });

  it('without a readable message gets the generic one', async () => {
    const { runClipCommand } = await import('./QuickCapture');
    sendMessage.mockRejectedValue({});

    await runClipCommand('page');

    expect(failures).toEqual([UnknownIssues.msg]);
  });
});

describe('ClipError, the message of a failed clip in the page', () => {
  let root: Root;
  let container: HTMLDivElement;
  const alert = () => container.querySelector('[data-clip-error]');

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    (globalThis as any).CSS = { highlights: new Map() };
    const { default: mountQuickCapture } = await import('./QuickCapture');
    container = document.createElement('div');
    document.body.appendChild(container);
    await act(async () => {
      root = mountQuickCapture(container, { showFloatButton: false });
    });
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.useRealTimers();
  });

  it('shows the message, also without the float button', async () => {
    expect(alert()).toBeNull();

    await act(async () =>
      contentEvents.emit('clipFailed', { message: CannotConnectWithLogseq.msg }),
    );

    expect(alert()?.getAttribute('role')).toBe('alert');
    expect(alert()?.textContent).toBe(CannotConnectWithLogseq.msg);
  });

  it('goes away after a while, or on a click', async () => {
    await act(async () => contentEvents.emit('clipFailed', { message: 'first' }));
    await act(async () => vi.advanceTimersByTime(8_000));
    expect(alert()).toBeNull();

    await act(async () => contentEvents.emit('clipFailed', { message: 'second' }));
    await act(async () => (alert() as HTMLElement).click());
    expect(alert()).toBeNull();
  });

  it('shows the latest failure for the full time', async () => {
    await act(async () => contentEvents.emit('clipFailed', { message: 'first' }));
    await act(async () => vi.advanceTimersByTime(6_000));
    await act(async () => contentEvents.emit('clipFailed', { message: 'second' }));
    await act(async () => vi.advanceTimersByTime(6_000));

    expect(alert()?.textContent).toBe('second');
  });
});
