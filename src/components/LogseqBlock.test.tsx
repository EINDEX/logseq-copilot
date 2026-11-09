// @vitest-environment jsdom
/**
 * Drives LogseqBlock's TODO/DONE controls through real webext-core messaging
 * (fakeBrowser). The component uses the same sendMessage in the content script
 * and in the popup, so one context covers both.
 */
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { fakeBrowser } from 'wxt/testing/fake-browser';
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
    // Like Logseq, DONE is a checked box and struck-through text, no label.
    expect(el.querySelector('[data-marker]')!.getAttribute('data-marker')).toBe('DONE');
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
    expect(el.querySelector('[data-marker]')!.getAttribute('data-marker')).toBe('TODO');
    expect(
      el.querySelector('button[role="checkbox"]')!.getAttribute('aria-checked'),
    ).toBe('false');
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

    expect(el.querySelector('[data-marker]')!.getAttribute('data-marker')).toBe('TODO');
    expect(
      el.querySelector('button[role="checkbox"]')!.getAttribute('aria-checked'),
    ).toBe('false');
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
    const rows = el.querySelectorAll('[data-marker]');
    expect(rows[0].getAttribute('data-marker')).toBe('TODO');
    expect(rows[1].getAttribute('data-marker')).toBe('DONE');
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

// The block's HTML comes from the Markdown of the notes, raw HTML included,
// and the sidebar on pages draws it in the page's own document.
describe('LogseqBlock HTML', () => {
  test('draws no script and no event handler from the notes', async () => {
    const el = await render([
      {
        ...makeBlock('x1', ''),
        html:
          '<p>clipped <img src="x" onerror="window.__pwned = 1"><b onmouseover="alert(1)">page</b></p>' +
          '<script>window.__pwned = 2</script><iframe src="https://evil.example"></iframe>' +
          '<a href="javascript:alert(1)">bad</a>',
      },
    ]);
    const content = el.querySelector('.lc-content')!;

    expect(content.querySelector('script, iframe')).toBeNull();
    expect(content.querySelectorAll('[onerror], [onmouseover]')).toHaveLength(0);
    expect(content.innerHTML).not.toMatch(/onerror|onmouseover|javascript:/i);
    expect(content.querySelector('a')!.hasAttribute('href')).toBe(false);
    expect((window as any).__pwned).toBeUndefined();
    // The text is still there.
    expect(content.textContent).toContain('clipped');
    expect(content.querySelector('b')!.textContent).toBe('page');
  });

  test('keeps Logseq links, tags and search marks', async () => {
    const html =
      '<p><a class="logseq-page-link" href="logseq://graph/g?page=books">books</a> ' +
      '<a class="logseq-tag" href="logseq://graph/g?page=bug"><mark>#bug</mark></a> ' +
      '<a href="https://github.com/logseq">repo</a></p>';
    const el = await render([{ ...makeBlock('x2', ''), html }]);

    expect(el.querySelector('.lc-content')!.innerHTML).toBe(html);
  });
});
