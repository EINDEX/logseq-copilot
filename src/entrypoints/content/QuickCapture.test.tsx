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
import { fakeBrowser } from 'wxt/testing';
import { HighlightManager } from '@/utils/highlight-manager';
import { templates } from '@/utils/storage';

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

  it('names the template of a clip of the page', async () => {
    const { runClipCommand } = await import('./QuickCapture');
    await runClipCommand('selectionOrPage', { templateId: 'task' });
    expect(sendMessage).toHaveBeenCalledWith('logseq:clipPage', {
      templateId: 'task',
    });
    sendMessage.mockReset();
    await runClipCommand('page', { templateId: 'task' });
    expect(sendMessage).toHaveBeenCalledWith('logseq:clipPage', {
      templateId: 'task',
    });
  });

  it('names the template of a clip of the selection', async () => {
    const { runClipCommand } = await import('./QuickCapture');
    selectParagraph();
    await runClipCommand('selectionOrPage', { templateId: 'task' });
    expect(sendMessage).toHaveBeenCalledWith('logseq:clipWithSelection', {
      text: 'hello world',
      templateId: 'task',
    });
  });

  it('ignores quickCapture events dispatched on document by page scripts', async () => {
    await import('./QuickCapture');
    document.dispatchEvent(new Event('quickCapture'));
    document.dispatchEvent(new Event('quickCaptureWithSelection'));
    document.dispatchEvent(new Event('quickCapturePage'));
    expect(sendMessage).not.toHaveBeenCalled();
  });
});

describe('a clip that is in Logseq', () => {
  const clips: unknown[] = [];
  const RESULT = { templateId: 'clip', page: 'Nov 16th, 2026', rootUuid: 'r' };
  let off: () => void;

  beforeEach(() => {
    sendMessage.mockReset().mockResolvedValue(RESULT);
    document.body.innerHTML = '<p id="p">hello world</p>';
    window.getSelection()?.removeAllRanges();
    clips.length = 0;
    off = contentEvents.on('clipped', (clip) => clips.push(clip));
  });

  afterEach(() => off());

  it('started in the page (shortcut, context menu, float button) tells ClipToast, for the page and for a selection', async () => {
    const { runClipCommand } = await import('./QuickCapture');
    await runClipCommand('page');
    selectParagraph();
    await runClipCommand('selectionOrPage', { templateId: 'task' });

    expect(clips).toEqual([
      { result: RESULT, feedback: 'page' },
      { result: RESULT, feedback: 'page' },
    ]);
  });

  it('asked for by a sidebar tells nobody: the sidebar shows it', async () => {
    const { runClipCommand } = await import('./QuickCapture');
    await runClipCommand('page', { feedback: 'sender' });
    expect(clips).toEqual([]);
  });

  it('that failed tells nobody', async () => {
    const { runClipCommand } = await import('./QuickCapture');
    sendMessage.mockRejectedValue(new LogseqError(CannotConnectWithLogseq));
    vi.spyOn(log, 'error').mockImplementation(() => {});
    await runClipCommand('page');
    expect(clips).toEqual([]);
  });
});

describe('the picker panel (runPickedClip)', () => {
  const RESULT = { templateId: 'clip', page: 'Nov 16th, 2026', rootUuid: 'r' };
  const ONE = [{ id: 'clip', name: 'Clip', content: '{{content}}' }];
  const TWO = [
    { id: 'clip', name: 'Clip', content: '{{content}}' },
    { id: 'task', name: 'Task', content: 'TODO {{content}}', pinned: true },
  ];

  beforeEach(async () => {
    fakeBrowser.reset();
    sendMessage.mockReset().mockResolvedValue(RESULT);
    document.body.innerHTML = '<p id="p">hello world</p>';
    window.getSelection()?.removeAllRanges();
  });

  afterEach(async () => {
    const { getActivePicker } = await import('./clip-picker');
    getActivePicker()?.destroy();
    vi.restoreAllMocks();
  });

  it('saves at once with the default settings: no panel, the same messages as ever', async () => {
    const { runPickedClip } = await import('./QuickCapture');
    const { getActivePicker } = await import('./clip-picker');
    await templates.setValue(ONE);

    await runPickedClip();
    expect(getActivePicker()).toBeNull();
    expect(sendMessage).toHaveBeenCalledExactlyOnceWith('logseq:clipPage');

    sendMessage.mockClear();
    selectParagraph();
    await runPickedClip();
    expect(getActivePicker()).toBeNull();
    expect(sendMessage).toHaveBeenCalledExactlyOnceWith('logseq:clipWithSelection', 'hello world');
  });

  it('opens the panel when a second template is pinned, and sends nothing yet', async () => {
    const { runPickedClip } = await import('./QuickCapture');
    const { getActivePicker } = await import('./clip-picker');
    await templates.setValue(TWO);

    await runPickedClip();

    expect(getActivePicker()?.getView().templates).toEqual([
      { id: 'clip', name: 'Clip' },
      { id: 'task', name: 'Task' },
    ]);
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('takes the selection when it opens: the clip has it after the selection is gone', async () => {
    const { runPickedClip } = await import('./QuickCapture');
    const { getActivePicker } = await import('./clip-picker');
    const save = vi
      .spyOn(HighlightManager.prototype, 'addHighlight')
      .mockResolvedValue(null);
    vi.spyOn(HighlightManager.prototype, 'addTemporaryHighlight').mockImplementation(() => {});
    await templates.setValue(TWO);
    selectParagraph();

    await runPickedClip();
    // Focus moves into the panel, the page selection is lost.
    window.getSelection()!.removeAllRanges();
    getActivePicker()!.setNote('my note');
    getActivePicker()!.decide('task');
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(sendMessage).toHaveBeenCalledExactlyOnceWith('logseq:clipWithSelection', {
      text: 'hello world',
      templateId: 'task',
      note: 'my note',
    });
    // The highlight is the cloned range, with the note.
    expect(save).toHaveBeenCalledTimes(1);
    const [range, note] = save.mock.calls[0];
    expect(range.toString()).toBe('hello world');
    expect(note).toBe('my note');
  });

  it('clips the page link with the chosen template and the note', async () => {
    const { runPickedClip } = await import('./QuickCapture');
    const { getActivePicker } = await import('./clip-picker');
    await templates.setValue(TWO);

    await runPickedClip();
    getActivePicker()!.setNote('page note');
    getActivePicker()!.decide('clip');
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(sendMessage).toHaveBeenCalledExactlyOnceWith('logseq:clipPage', {
      templateId: 'clip',
      note: 'page note',
    });
  });

  it('saves nothing, and no highlight, when it is cancelled', async () => {
    const { runPickedClip } = await import('./QuickCapture');
    const { getActivePicker } = await import('./clip-picker');
    const save = vi.spyOn(HighlightManager.prototype, 'addHighlight').mockResolvedValue(null);
    await templates.setValue(TWO);
    selectParagraph();

    await runPickedClip();
    getActivePicker()!.cancel();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(sendMessage).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
    // The page selection was not touched.
    expect(window.getSelection()!.toString()).toBe('hello world');
  });

  it('the shortcut again while the panel is up saves the highlighted template', async () => {
    const { runPickedClip } = await import('./QuickCapture');
    await templates.setValue(TWO);

    await runPickedClip();
    await runPickedClip();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(sendMessage).toHaveBeenCalledExactlyOnceWith('logseq:clipPage', { templateId: 'clip' });
  });

  it('a failure after the panel is shown in the page, like any clip', async () => {
    const { runPickedClip } = await import('./QuickCapture');
    const { getActivePicker } = await import('./clip-picker');
    const failures: string[] = [];
    const off = contentEvents.on('clipFailed', ({ message }) => failures.push(message));
    vi.spyOn(log, 'error').mockImplementation(() => {});
    sendMessage.mockRejectedValue(new LogseqError(CannotConnectWithLogseq));
    await templates.setValue(TWO);

    await runPickedClip();
    getActivePicker()!.decide();
    await new Promise((resolve) => setTimeout(resolve, 0));
    off();

    expect(failures).toEqual([CannotConnectWithLogseq.msg]);
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

  it('asked for by the browser sidebar rejects with the message, and shows nothing in the page', async () => {
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
