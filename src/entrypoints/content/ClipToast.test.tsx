import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { cleanup, render } from '@testing-library/react';
import { fakeBrowser } from 'wxt/testing';
import { contentEvents } from '@/utils/content-events';
import { templates } from '@/utils/storage';
import { CLIP_TOAST_MS, ClipToast } from './ClipToast';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
vi.mock('../../assets/img/logo.png', () => ({ default: '' }));

const RESULT = { templateId: 'clip', page: 'Nov 16th, 2026', rootUuid: 'r', added: true };
const TWO = [
  { id: 'clip', name: 'Clip', content: '{{content}}' },
  { id: 'task', name: 'Task', content: 'TODO {{content}}' },
];

const toast = () => document.querySelector('[data-clip-toast]');
const clipped = async (feedback: 'page' | 'sender' = 'page') => {
  await act(async () => {
    contentEvents.emit('clipped', { result: RESULT, feedback });
    await vi.advanceTimersByTimeAsync(0);
  });
};

describe('ClipToast', () => {
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    fakeBrowser.reset();
    await templates.setValue(TWO);
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('says where the clip went, with no template to switch to', async () => {
    render(<ClipToast />);
    await clipped();

    expect(toast()!.querySelector('[data-clip-toast-page]')!.textContent).toBe('Nov 16th, 2026');
    expect(toast()!.getAttribute('role')).toBe('status');
    expect(toast()!.querySelector('button')).toBeNull();
    expect(toast()!.querySelector('[data-template-id]')).toBeNull();
  });

  it('goes after a few seconds', async () => {
    render(<ClipToast />);
    await clipped();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(CLIP_TOAST_MS);
    });
    expect(toast()).toBeNull();
  });

  it('is not shown with a single template: that clip is saved as it always was', async () => {
    await templates.setValue([TWO[0]]);
    render(<ClipToast />);
    await clipped();
    expect(toast()).toBeNull();
  });

  it('is not shown for a clip whose feedback is the sender’s', async () => {
    render(<ClipToast />);
    await clipped('sender');
    expect(toast()).toBeNull();
  });
});
