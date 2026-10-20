/**
 * The highlight comment popup must only open on requests from the content
 * script itself (in-memory event bus), never on DOM events a page script can
 * dispatch on `document`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import type { Root } from 'react-dom/client';
import { fakeBrowser } from 'wxt/testing';
import type { HighlightData } from '@/types/highlight';

vi.mock('@/types/messaging', () => ({ sendMessage: vi.fn() }));
vi.mock('@/assets/globals.css', () => ({}));
vi.mock('./index.module.scss', () => ({ default: {} }));
vi.mock('../../assets/img/logo.png', () => ({ default: '' }));

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const storedHighlight: HighlightData = {
  id: 'h1',
  url: 'http://localhost:3000/',
  title: 'Page',
  hostname: 'localhost',
  range: {
    startContainerXPath: '/html/body[1]/p[1]',
    endContainerXPath: '/html/body[1]/p[1]',
    startOffset: 0,
    endOffset: 1,
    textContent: 'hello',
  },
  createdAt: 1,
  lastAccessedAt: 1,
  note: 'original note',
};

const forged: HighlightData = {
  ...storedHighlight,
  id: 'forged',
  note: 'attacker note',
};

describe('QuickCapture comment popup events', () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(async () => {
    fakeBrowser.reset();
    (globalThis as any).CSS = { highlights: new Map() };
    (globalThis as any).Highlight = class {
      add() {}
    };
    await fakeBrowser.storage.local.set({ highlights: [storedHighlight] });

    const { default: mountQuickCapture } = await import('./QuickCapture');
    container = document.createElement('div');
    document.body.appendChild(container);
    await act(async () => {
      root = mountQuickCapture(container);
    });
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it('ignores a forged showHighlightComment CustomEvent on document', async () => {
    await act(async () => {
      document.dispatchEvent(
        new CustomEvent('showHighlightComment', {
          detail: {
            highlightId: forged.id,
            highlightData: forged,
            clickPosition: { x: 10, y: 10 },
          },
        }),
      );
    });

    expect(document.querySelector('[data-highlight-popup]')).toBeNull();
    expect(document.body.textContent).not.toContain('attacker note');
    const { highlights } = await fakeBrowser.storage.local.get('highlights');
    expect(highlights).toEqual([storedHighlight]);
  });

  it('opens the popup from the in-memory content event bus', async () => {
    const { contentEvents } = await import('@/utils/content-events');
    await act(async () => {
      contentEvents.emit('showHighlightComment', {
        highlightData: storedHighlight,
        clickPosition: { x: 10, y: 10 },
      });
    });

    expect(document.querySelector('[data-highlight-popup]')).not.toBeNull();
    expect(document.body.textContent).toContain('original note');
  });
});
