/**
 * Drives LogseqBlock's TODO/DONE controls through real webext-core messaging
 * (fakeBrowser). The component uses the same sendMessage in the content script
 * and in the popup, so one context covers both.
 */
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { fakeBrowser } from 'wxt/testing';
import { onMessage } from '@/types/messaging';
import { LogseqBlock } from './LogseqBlock';
import type { LogseqBlockType } from '@/types/logseqBlock';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const handler = vi.fn();

beforeAll(() => {
  fakeBrowser.reset();
  onMessage('logseq:changeBlockMarker', ({ data }) => handler(data));
});

const makeBlock = (uuid: string, marker: string): LogseqBlockType => ({
  uuid,
  marker,
  html: `<p>task ${uuid}</p>`,
  page: { name: 'p', id: 1, uuid: 'p1' },
  content: `${marker} task ${uuid}`,
  format: 'markdown',
  priority: '',
});

let root: Root | undefined;
let container: HTMLElement | undefined;

const render = async (blocks: LogseqBlockType[]) => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(<LogseqBlock graph="g" blocks={blocks} />);
  });
  return container;
};

const flush = () => act(async () => {
  await new Promise((r) => setTimeout(r, 20));
});

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  handler.mockReset();
});

const reply = (uuid: string, marker: string) => ({
  type: 'change-block-marker-result' as const,
  uuid,
  status: 'success' as const,
  marker,
});

describe('LogseqBlock marker controls', () => {
  test('checking the box sends TODO->DONE through the background and shows DONE', async () => {
    handler.mockImplementation(({ uuid, marker }) => reply(uuid, marker));
    const el = await render([makeBlock('b1', 'TODO')]);

    const checkbox = el.querySelector('button[role="checkbox"]') as HTMLElement;
    expect(checkbox.getAttribute('aria-checked')).toBe('false');

    await act(async () => checkbox.click());
    await flush();

    expect(handler).toHaveBeenCalledWith({ uuid: 'b1', marker: 'DONE' });
    expect(el.textContent).toContain('DONE');
    expect(
      el.querySelector('button[role="checkbox"]')!.getAttribute('aria-checked'),
    ).toBe('true');
  });

  test('unchecking goes back to TODO', async () => {
    handler.mockImplementation(({ uuid, marker }) => reply(uuid, marker));
    const el = await render([makeBlock('b2', 'DONE')]);

    await act(async () =>
      (el.querySelector('button[role="checkbox"]') as HTMLElement).click(),
    );
    await flush();

    expect(handler).toHaveBeenCalledWith({ uuid: 'b2', marker: 'TODO' });
    expect(el.textContent).toContain('TODO');
  });

  test('a failed change keeps the old status and shows the reason', async () => {
    handler.mockImplementation(({ uuid, marker }) => ({
      type: 'change-block-marker-result',
      uuid,
      status: 'failed',
      marker,
      msg: 'Not support scheduled task.',
    }));
    const el = await render([makeBlock('b3', 'TODO')]);

    await act(async () =>
      (el.querySelector('button[role="checkbox"]') as HTMLElement).click(),
    );
    await flush();

    expect(el.textContent).toContain('TODO');
    expect(el.textContent).not.toContain('DONE');
    expect(el.querySelector('[role="alert"]')?.textContent).toBe(
      'Not support scheduled task.',
    );
  });

  test('a rejected message shows the readable error', async () => {
    handler.mockRejectedValue(new Error('Cannot connect to Logseq'));
    const el = await render([makeBlock('b4', 'TODO')]);

    await act(async () =>
      (el.querySelector('button[role="checkbox"]') as HTMLElement).click(),
    );
    await flush();

    expect(el.querySelector('[role="alert"]')?.textContent).toBe(
      'Cannot connect to Logseq',
    );
  });

  test('each block in a group changes only itself', async () => {
    handler.mockImplementation(({ uuid, marker }) => reply(uuid, marker));
    const el = await render([makeBlock('a', 'TODO'), makeBlock('b', 'DOING')]);

    const boxes = el.querySelectorAll('button[role="checkbox"]');
    await act(async () => (boxes[1] as HTMLElement).click());
    await flush();

    expect(handler).toHaveBeenCalledWith({ uuid: 'b', marker: 'DONE' });
    const items = el.querySelectorAll('li');
    expect(items[0].textContent).toContain('TODO');
    expect(items[1].textContent).toContain('DONE');
  });

  test('the status badge toggles DOING to TODO', async () => {
    handler.mockImplementation(({ uuid, marker }) => reply(uuid, marker));
    const el = await render([makeBlock('c', 'DOING')]);

    const badge = () =>
      Array.from(el.querySelectorAll('button')).find(
        (b) => b.getAttribute('role') !== 'checkbox' && b.textContent === 'DOING',
      ) as HTMLElement;
    await act(async () => badge().click());
    await flush();
    expect(handler).toHaveBeenCalledWith({ uuid: 'c', marker: 'TODO' });
  });
});
