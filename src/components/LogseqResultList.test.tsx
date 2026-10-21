/**
 * The shared result list (search engine sidebar and popup): page groups,
 * nesting under parent results, "Show all", page-only hits, and Logseq-style
 * task rendering.
 */
import { afterEach, describe, expect, test } from 'vitest';
import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { LogseqResultList, groupResults } from './LogseqResultList';
import type { LogseqBlockType, LogseqPageIdenity } from '@/types/logseqBlock';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const pageA: LogseqPageIdenity = { id: 1, name: 'page a', originalName: 'Page A', uuid: 'pa' };
const pageB: LogseqPageIdenity = { id: 2, name: 'page b', originalName: 'Page B', uuid: 'pb' };

let n = 0;
const block = (over: Partial<LogseqBlockType> = {}): LogseqBlockType => {
  n += 1;
  return {
    uuid: `u${n}`,
    id: 100 + n,
    html: `<p>block ${n}</p>`,
    page: pageA,
    content: `block ${n}`,
    format: 'markdown',
    marker: '',
    priority: '',
    ...over,
  };
};

let root: Root | undefined;
let container: HTMLElement | undefined;

const render = async (props: Parameters<typeof LogseqResultList>[0]) => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root!.render(<LogseqResultList {...props} />));
  return container;
};

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
});

describe('groupResults', () => {
  test('groups by page in first-seen order and nests children under parent hits', () => {
    const parent = block();
    const child = block({ parent: { id: parent.id! } });
    const grandchild = block({ parent: { id: child.id! } });
    const other = block({ page: pageB });
    const sibling = block({ parent: { id: 1 } });
    const groups = groupResults([child, other, parent, grandchild, sibling]);

    expect(groups.map((g) => g.page.originalName)).toEqual(['Page A', 'Page B']);
    const [a] = groups;
    expect(a.nodes.map((node) => node.block.uuid)).toEqual([parent.uuid, sibling.uuid]);
    expect(a.nodes[0].children.map((node) => node.block.uuid)).toEqual([child.uuid]);
    expect(a.nodes[0].children[0].children.map((node) => node.block.uuid)).toEqual([grandchild.uuid]);
  });

  test('leaves out blocks without HTML instead of hiding the whole page', () => {
    const empty = block({ html: '' });
    const shown = block();
    const groups = groupResults([empty, shown]);
    expect(groups).toHaveLength(1);
    expect(groups[0].nodes.map((node) => node.block.uuid)).toEqual([shown.uuid]);
  });
});

describe('LogseqResultList', () => {
  test('shows the first results, the rest behind "Show all"', async () => {
    const blocks = Array.from({ length: 13 }, () => block());
    const el = await render({ graph: 'g', blocks, initialCount: 10 });
    expect(el.querySelectorAll('.lc-block-row')).toHaveLength(10);

    const more = Array.from(el.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Show all 13 results'),
    )!;
    expect(more).toBeTruthy();
    await act(async () => more.click());
    expect(el.querySelectorAll('.lc-block-row')).toHaveLength(13);
    expect(el.textContent).toContain('Show fewer');
  });

  test('no "Show all" when everything fits', async () => {
    const el = await render({ graph: 'g', blocks: [block(), block()] });
    expect(el.textContent).not.toContain('Show all');
  });

  test('page titles link to the page; page-only hits are listed once', async () => {
    const el = await render({
      graph: 'my graph',
      blocks: [block()],
      pages: [pageA, pageB, null],
    });
    const titles = Array.from(el.querySelectorAll('a.lc-page-title'));
    expect(titles.map((a) => a.textContent)).toEqual(['Page B', 'Page A']);
    expect(titles[1].getAttribute('href')).toBe('logseq://graph/my%20graph?page=page%20a');
  });

  test('each block has an "open block" link', async () => {
    const b = block();
    const el = await render({ graph: 'g', blocks: [b] });
    expect(el.querySelector('a[aria-label="Open block in Logseq"]')!.getAttribute('href')).toBe(
      `logseq://graph/g?block-id=${b.uuid}`,
    );
  });

  test('DB class tags follow the text as links to the tag page', async () => {
    const el = await render({
      graph: 'g',
      blocks: [block({ tagNames: ['Book', 'Multi Word'] }), block()],
    });
    const tags = Array.from(el.querySelectorAll('.lc-block-tags a'));
    expect(tags.map((a) => a.textContent)).toEqual(['#Book', '#Multi Word']);
    expect(tags[1].getAttribute('href')).toBe('logseq://graph/g?page=Multi%20Word');
    expect(el.querySelectorAll('.lc-block-tags')).toHaveLength(1);
  });
});

describe('task rendering (like Logseq)', () => {
  const row = (el: HTMLElement) => el.querySelector('.lc-block-row')!;

  test('TODO: an unchecked box, the switch to DOING only in the hover toolbar', async () => {
    const el = await render({ graph: 'g', blocks: [block({ marker: 'TODO' })] });
    expect(row(el).getAttribute('data-marker')).toBe('TODO');
    expect(el.querySelector('[role="checkbox"]')!.getAttribute('aria-checked')).toBe('false');
    expect(el.querySelector('.lc-task .lc-marker')).toBeNull();
    const switcher = el.querySelector('.lc-actions .lc-marker')!;
    expect(switcher.textContent).toBe('TODO');
    expect(switcher.getAttribute('title')).toBe('Change from TODO to DOING');
  });

  test('DOING / NOW: the box and the marker in front of the text', async () => {
    const el = await render({ graph: 'g', blocks: [block({ marker: 'DOING' }), block({ marker: 'NOW' })] });
    const inline = Array.from(el.querySelectorAll('.lc-task .lc-marker')).map((m) => m.textContent);
    expect(inline).toEqual(['DOING', 'NOW']);
    expect(el.querySelectorAll('[role="checkbox"]')).toHaveLength(2);
  });

  test('DONE: a checked box and no marker text; CANCELED: no box', async () => {
    const el = await render({
      graph: 'g',
      blocks: [block({ marker: 'DONE' }), block({ marker: 'CANCELED' })],
    });
    const boxes = el.querySelectorAll('[role="checkbox"]');
    expect(boxes).toHaveLength(1);
    expect(boxes[0].getAttribute('aria-checked')).toBe('true');
    expect(el.querySelector('.lc-marker')).toBeNull();
    const markers = Array.from(el.querySelectorAll('.lc-block-row')).map((r) => r.getAttribute('data-marker'));
    expect(markers).toEqual(['DONE', 'CANCELED']);
  });

  test('other DB statuses (e.g. IN-REVIEW) show their name', async () => {
    const el = await render({ graph: 'g', blocks: [block({ marker: 'IN-REVIEW' })] });
    expect(el.querySelector('.lc-status')!.textContent).toBe('IN-REVIEW');
  });
});
