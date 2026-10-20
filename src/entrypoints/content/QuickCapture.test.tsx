import { describe, expect, it, vi, beforeEach } from 'vitest';
import { contentEvents } from '@/utils/content-events';

const sendMessage = vi.fn();
vi.mock('@/types/messaging', () => ({
  sendMessage: (...args: unknown[]) => sendMessage(...args),
}));
vi.mock('@/assets/globals.css', () => ({}));
vi.mock('./index.module.scss', () => ({ default: {} }));
vi.mock('../../assets/img/logo.png', () => ({ default: '' }));

describe('QuickCapture capture()', () => {
  beforeEach(async () => {
    sendMessage.mockReset();
    (globalThis as any).CSS = { highlights: new Map() };
    (globalThis as any).Highlight = class {
      add() {}
    };
    await import('./QuickCapture');
    document.body.innerHTML = '<p id="p">hello world</p>';
    window.getSelection()?.removeAllRanges();
  });

  it('clips the whole page when nothing is selected', () => {
    contentEvents.emit('quickCapture', undefined);
    expect(sendMessage).toHaveBeenCalledWith('logseq:clipPage');
  });

  it('clips the whole page when the selection is collapsed', () => {
    const p = document.getElementById('p')!;
    window.getSelection()!.collapse(p.firstChild, 2);
    contentEvents.emit('quickCapture', undefined);
    expect(sendMessage).toHaveBeenCalledWith('logseq:clipPage');
  });

  it('clips the selected text when there is a selection', () => {
    const p = document.getElementById('p')!;
    const range = document.createRange();
    range.selectNodeContents(p);
    window.getSelection()!.addRange(range);
    contentEvents.emit('quickCapture', undefined);
    expect(sendMessage).toHaveBeenCalledWith(
      'logseq:clipWithSelection',
      'hello world',
    );
  });

  it('ignores quickCapture events dispatched on document by page scripts', () => {
    document.dispatchEvent(new Event('quickCapture'));
    document.dispatchEvent(new Event('quickCaptureWithSelection'));
    document.dispatchEvent(new Event('quickCapturePage'));
    expect(sendMessage).not.toHaveBeenCalled();
  });
});
