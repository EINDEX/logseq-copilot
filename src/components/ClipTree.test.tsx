// @vitest-environment jsdom
/** A clip in the result list: the root with its subtree, hits marked, "+N" for the rest. */
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { onMessage } from '@/types/messaging';
import { LogseqResultList } from './LogseqResultList';
import type { LogseqBlockType } from '@/types/logseqBlock';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const handler = vi.fn();
beforeAll(() => {
  fakeBrowser.reset();
  onMessage('logseq:changeBlockMarker', ({ data }) => {
    handler(data);
    return { status: 'success', marker: data.marker } as any;
  });
});

const page = { name: 'p', originalName: 'P', id: 1, uuid: 'p1' };
const b = (
  uuid: string,
  children: LogseqBlockType[] | undefined,
  over: Partial<LogseqBlockType> = {},
): LogseqBlockType =>
  ({
    uuid,
    id: 1,
    page,
    html: `<p>${uuid}</p>`,
    content: uuid,
    format: 'markdown',
    marker: '',
    priority: '',
    children,
    ...over,
  }) as LogseqBlockType;

let root: Root | undefined;
let container: HTMLElement | undefined;
const render = async (blocks: LogseqBlockType[]) => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root!.render(<LogseqResultList graph="g" blocks={blocks} variant="sidebar" />));
  return container;
};
afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
});

describe('a clip in the result list', () => {
  test('draws the root with its blocks nested below', async () => {
    const el = await render([b('root', [b('a', [b('a1', [])]), b('c', [])])]);
    expect(el.querySelectorAll('.lc-block-row')).toHaveLength(4);
    const top = el.querySelector('.lc-results ul.lc-blocks > li')!;
    expect(top.querySelector(':scope > .lc-block-row')!.textContent).toContain('root');
    const nested = top.querySelector(':scope > ul.lc-blocks')!;
    expect([...nested.querySelectorAll(':scope > li > .lc-block-row')].map((r) => r.textContent)).toEqual([
      expect.stringContaining('a'),
      expect.stringContaining('c'),
    ]);
    expect(nested.querySelector(':scope > li > ul.lc-blocks .lc-block-row')!.textContent).toContain('a1');
  });

  test('marks the hit blocks', async () => {
    const el = await render([b('root', [b('hit', [], { matched: true }), b('other', [])])]);
    const rows = [...el.querySelectorAll<HTMLElement>('.lc-block-row')];
    expect(rows.map((row) => row.dataset.matched)).toEqual([undefined, 'true', undefined]);
  });

  test('a task below the root has its checkbox, and marks it DONE', async () => {
    handler.mockClear();
    const el = await render([
      b('root', [b('todo', [], { marker: 'TODO', content: 'TODO todo' })]),
    ]);
    const box = el.querySelector<HTMLElement>('button[role="checkbox"]')!;
    expect(box.getAttribute('aria-checked')).toBe('false');
    await act(async () => box.click());
    expect(handler).toHaveBeenCalledWith({ uuid: 'todo', marker: 'DONE' });
    expect(el.querySelector('button[role="checkbox"]')!.getAttribute('aria-checked')).toBe('true');
  });

  test('a long clip ends in "+N", which shows the rest in place', async () => {
    const kids = Array.from({ length: 30 }, (_, i) => b(`k${i}`, []));
    const el = await render([b('root', kids)]);
    expect(el.querySelectorAll('.lc-block-row')).toHaveLength(20);
    const more = el.querySelector<HTMLButtonElement>('.lc-clip-more button')!;
    expect(more.textContent).toBe('+11');
    await act(async () => more.click());
    expect(el.querySelectorAll('.lc-block-row')).toHaveLength(31);
    expect(el.querySelector('.lc-clip-more')).toBeNull();
  });

  test('a block without a subtree stays a plain row', async () => {
    const el = await render([b('solo', undefined)]);
    expect(el.querySelectorAll('.lc-block-row')).toHaveLength(1);
    expect(el.querySelector('ul.lc-blocks ul.lc-blocks')).toBeNull();
  });
});
