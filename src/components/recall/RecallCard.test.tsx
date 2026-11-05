/**
 * The search engine result page card: page rows, hits under their context
 * lines (shared, nested, journal), "+N" and the page chevron, highlights,
 * relative times, links, and the empty / loading / error states.
 */
import { afterEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { RecallAncestor, RecallHit, RecallPage, RecallResult } from '@/types/recall';
import { RecallCard, type RecallCardProps } from './RecallCard';
import { buildPageTree } from './recall-tree';
import { formatRelativeTime } from './relative-time';

afterEach(cleanup);

const NOW = Date.parse('2026-11-05T12:00:00Z');
const DAY = 24 * 60 * 60 * 1000;

const ctx = (uuid: string, text: string): RecallAncestor => ({
  uuid,
  text,
  segments: [{ kind: 'text', value: text }],
});

const hit = (uuid: string, text: string, over: Partial<RecallHit> = {}): RecallHit => ({
  uuid,
  text,
  segments: [{ kind: 'text', value: text }],
  context: [],
  matchedTerms: [],
  ...over,
});

const page = (title: string, hits: RecallHit[], over: Partial<RecallPage> = {}): RecallPage => ({
  uuid: `page-${title}`,
  name: title.toLowerCase(),
  title,
  kind: 'page',
  updatedAt: NOW - 3 * DAY,
  matchedTerms: [],
  score: 1,
  totalHits: hits.length,
  hits,
  ...over,
});

const renderCard = (pages: RecallPage[], over: Partial<RecallCardProps> = {}) =>
  render(
    <RecallCard
      state="success"
      result={{ graph: 'my notes', pages } satisfies RecallResult}
      terms={['nginx']}
      onOpenOptions={() => {}}
      locale="en"
      now={NOW}
      {...over}
    />,
  );

/** Rows of the card in document order, as "hit:<text>" / "ctx:<text>" with their depth. */
const outline = (container: HTMLElement) =>
  [...container.querySelectorAll<HTMLElement>('.lc-hit, .lc-ctx')].map((row) => {
    let depth = 0;
    for (let el = row.parentElement; el; el = el.parentElement) {
      if (el.classList.contains('lc-kids')) depth++;
    }
    const kind = row.classList.contains('lc-hit') ? 'hit' : 'ctx';
    return `${'  '.repeat(depth)}${kind}:${row.textContent}`;
  });

describe('page rows', () => {
  test('page row links to the page, with the namespace split and a relative time', () => {
    const { container } = renderCard([page('Projects/Homelab & Lab', [], { name: 'projects/homelab & lab' })]);
    const row = container.querySelector<HTMLAnchorElement>('.lc-page-row')!;
    expect(row.getAttribute('href')).toBe(
      'logseq://graph/my%20notes?page=projects%2Fhomelab%20%26%20lab',
    );
    expect(row.querySelector('.lc-ns')!.textContent).toBe('Projects/');
    expect(row.querySelector('.lc-page-name')!.textContent).toBe('Projects/Homelab & Lab');
    expect(row.querySelector('time')!.textContent).toBe('3d ago');
  });

  test('a title-only page shows just its row', () => {
    const { container } = renderCard([page('Nginx', [])]);
    expect(container.querySelectorAll('.lc-page-row')).toHaveLength(1);
    expect(container.querySelector('.lc-hit, .lc-ctx, .lc-plus')).toBeNull();
  });

  test('journals show their date title, no relative time', () => {
    const { container } = renderCard([
      page('Nov 3rd, 2026', [hit('j1', 'nginx')], { kind: 'journal', journalDay: 20261103 }),
    ]);
    expect(container.querySelector('.lc-page')!.getAttribute('data-kind')).toBe('journal');
    expect(container.querySelector('.lc-page-row time')).toBeNull();
    expect(container.querySelector('.lc-ns')).toBeNull();
  });

  test('three pages first, the rest behind the chevron', () => {
    const pages = ['A', 'B', 'C', 'D', 'E'].map((t) => page(t, []));
    const { container } = renderCard(pages);
    expect(container.querySelectorAll('.lc-page')).toHaveLength(3);
    fireEvent.click(screen.getByRole('button', { name: 'Show 2 more pages' }));
    expect(container.querySelectorAll('.lc-page')).toHaveLength(5);
    expect(screen.queryByRole('button', { name: /more pages/ })).toBeNull();
  });

  test('no chevron with three pages or fewer', () => {
    renderCard(['A', 'B', 'C'].map((t) => page(t, [])));
    expect(screen.queryByRole('button', { name: /more pages/ })).toBeNull();
  });
});

describe('hits', () => {
  test('a hit links to its block', () => {
    const { container } = renderCard([page('P', [hit('a b/c', 'nginx')])]);
    expect(container.querySelector('.lc-hit')!.getAttribute('href')).toBe(
      'logseq://graph/my%20notes?block-id=a%20b%2Fc',
    );
  });

  test('two hits first, "+N" opens the rest in place', () => {
    const hits = ['one', 'two', 'three', 'four'].map((t) => hit(t, `nginx ${t}`));
    const { container } = renderCard([page('P', hits, { totalHits: 9 })]);
    expect(outline(container)).toEqual(['hit:nginx one', 'hit:nginx two']);
    fireEvent.click(screen.getByRole('button', { name: 'Show 2 more' }));
    expect(outline(container)).toEqual([
      'hit:nginx one',
      'hit:nginx two',
      'hit:nginx three',
      'hit:nginx four',
    ]);
    expect(container.querySelector('.lc-plus')).toBeNull();
  });

  test('"+N" counts the hits not shown', () => {
    renderCard([page('P', ['a', 'b', 'c'].map((t) => hit(t, t)))]);
    expect(screen.getByRole('button', { name: 'Show 1 more' }).textContent).toBe('+1');
  });

  test('tasks: DONE checked and struck, DOING with a dot, TODO empty', () => {
    const { container } = renderCard([
      page('P', [
        hit('d', 'nginx done', { task: { marker: 'DONE', done: true } }),
        hit('n', 'nginx now', { task: { marker: 'NOW', done: false } }),
        hit('t', 'nginx todo', { task: { marker: 'TODO', done: false } }),
      ]),
    ]);
    fireEvent.click(screen.getByRole('button', { name: 'Show 1 more' }));
    const states = [...container.querySelectorAll('.lc-box')].map((b) => b.getAttribute('data-state'));
    expect(states).toEqual(['done', 'doing', 'todo']);
    expect(container.querySelector('.lc-box[data-state="done"] svg')).not.toBeNull();
    expect(container.querySelector('.lc-hit[data-done]')!.textContent).toBe('nginx done');
    expect(container.querySelectorAll('.lc-hit[data-done]')).toHaveLength(1);
  });
});

describe('context lines', () => {
  test('a hit hangs one level under its context line, which links to its block', () => {
    const { container } = renderCard([
      page('Homelab', [hit('h', 'nginx terminates TLS', { context: [ctx('pi', 'pi-01 (Raspberry Pi 5)')] })]),
    ]);
    expect(outline(container)).toEqual(['ctx:pi-01 (Raspberry Pi 5)', '  hit:nginx terminates TLS']);
    expect(container.querySelector('.lc-ctx')!.getAttribute('href')).toBe(
      'logseq://graph/my%20notes?block-id=pi',
    );
  });

  test('a context line shared by two hits is drawn once', () => {
    const stack = ctx('docker', 'Docker stack');
    const { container } = renderCard([
      page('Homelab', [
        hit('a', 'nginx alpha', { context: [stack] }),
        hit('b', 'nginx beta', { context: [stack] }),
      ]),
    ]);
    expect(outline(container)).toEqual(['ctx:Docker stack', '  hit:nginx alpha', '  hit:nginx beta']);
  });

  test('a context line that is a hit of the page is drawn as that hit', () => {
    const parent = hit('proxy', 'nginx as a reverse proxy');
    const child = hit('strip', 'nginx strips Host', {
      context: [{ uuid: 'proxy', text: parent.text, segments: parent.segments }],
    });
    const { container } = renderCard([page('Nginx', [child, parent, hit('x', 'nginx third')])]);
    expect(outline(container)).toEqual(['hit:nginx as a reverse proxy', '  hit:nginx strips Host']);
    // The parent counts as shown: one hit left.
    expect(screen.getByRole('button', { name: 'Show 1 more' })).toBeTruthy();
  });

  test('hits hang under a shown parent hit, whatever the hit order', () => {
    const outlineHit = hit('outline', 'nginx outline', { context: [] });
    const asContext = (h: RecallHit) => ({ uuid: h.uuid, text: h.text, segments: h.segments });
    const childHit = hit('child', 'nginx child', { context: [ctx('pre', 'Above'), asContext(outlineHit)] });
    const grandHit = hit('grand', 'nginx grandchild', { context: [asContext(childHit)] });
    // The child is shown as the grandchild's context: nothing is left over.
    const { container } = renderCard([page('P', [outlineHit, grandHit, childHit])]);
    expect(container.querySelector('.lc-plus')).toBeNull();
    expect(outline(container)).toEqual([
      'hit:nginx outline',
      '  hit:nginx child',
      '    hit:nginx grandchild',
    ]);
  });

  test('journal: root and parent context lines indent step by step', () => {
    const home = ctx('home', 'Homelab');
    const alice = ctx('alice', '1:1 with Alice');
    const { container } = renderCard([
      page(
        'Nov 3rd, 2026',
        [
          hit('a', 'nginx kept dropping the websocket', { context: [home, ctx('notes', 'Notes')] }),
          hit('b', 'Write down why we keep nginx', { context: [alice, ctx('fu', 'Follow-up')] }),
        ],
        { kind: 'journal' },
      ),
    ]);
    expect(outline(container)).toEqual([
      'ctx:Homelab',
      '  ctx:Notes',
      '    hit:nginx kept dropping the websocket',
      'ctx:1:1 with Alice',
      '  ctx:Follow-up',
      '    hit:Write down why we keep nginx',
    ]);
  });

  test('rows with children carry the guide marker', () => {
    const { container } = renderCard([
      page('P', [hit('h', 'nginx', { context: [ctx('c', 'Parent')] })]),
    ]);
    expect(container.querySelector('.lc-ctx')!.hasAttribute('data-kids')).toBe(true);
    expect(container.querySelector('.lc-hit')!.hasAttribute('data-kids')).toBe(false);
  });
});

describe('highlights', () => {
  test('each term marked case-insensitively, neighbours joined into one mark', () => {
    const { container } = renderCard(
      [page('P', [hit('h', 'Set up Nginx as a Reverse  proxy for nginx')])],
      { terms: ['nginx', 'reverse', 'proxy'] },
    );
    const marks = [...container.querySelectorAll('.lc-hit mark')].map((m) => m.textContent);
    expect(marks).toEqual(['Nginx', 'Reverse  proxy', 'nginx']);
  });

  test('references in the theme color without brackets, tags muted with #', () => {
    const segments = [
      { kind: 'text' as const, value: 'nginx for ' },
      { kind: 'ref' as const, value: 'Gitea' },
      { kind: 'text' as const, value: ' ' },
      { kind: 'tag' as const, value: '#infra' },
    ];
    const { container } = renderCard([
      page('P', [hit('h', segments.map((s) => s.value).join(''), { segments })]),
    ]);
    const row = container.querySelector('.lc-hit')!;
    expect(row.textContent).toBe('nginx for Gitea #infra');
    expect(row.querySelector('.lc-ref')!.textContent).toBe('Gitea');
    expect(row.querySelector('.lc-tag')!.textContent).toBe('#infra');
    // The row is the link; references are not links of their own.
    expect(row.querySelectorAll('a')).toHaveLength(0);
  });

  test('a mark inside a reference stays inside it', () => {
    const segments = [
      { kind: 'text' as const, value: 'see ' },
      { kind: 'ref' as const, value: 'Nginx cheatsheet' },
    ];
    const { container } = renderCard([page('P', [hit('h', 'see Nginx cheatsheet', { segments })])]);
    expect(container.querySelector('.lc-ref mark')!.textContent).toBe('Nginx');
  });

  test('a long hit is cut so the match is in view', () => {
    const text = `${'filler words before the match '.repeat(6)}nginx at the end`;
    const { container } = renderCard([page('P', [hit('h', text)])]);
    const shown = container.querySelector('.lc-hit-text')!.textContent!;
    expect(shown.startsWith('…')).toBe(true);
    expect(shown).toContain('nginx at the end');
    expect(shown.length).toBeLessThan(text.length);
  });

  test('context lines mark the terms too, references plain', () => {
    const line: RecallAncestor = {
      uuid: 'c',
      text: 'Nginx on Homelab',
      segments: [
        { kind: 'text', value: 'Nginx on ' },
        { kind: 'ref', value: 'Homelab' },
      ],
    };
    const { container } = renderCard([page('P', [hit('h', 'x', { context: [line] })])]);
    const row = container.querySelector('.lc-ctx')!;
    expect(row.querySelector('mark')!.textContent).toBe('Nginx');
    expect(row.querySelector('.lc-ref')).toBeNull();
  });
});

describe('states', () => {
  test('header: graph name opens the graph, settings button', () => {
    const onOpenOptions = vi.fn();
    const { container } = renderCard([page('P', [])], { onOpenOptions });
    const graph = container.querySelector('.lc-graph')!;
    expect(graph.getAttribute('href')).toBe('logseq://graph/my%20notes');
    expect(graph.textContent).toBe('my notes');
    fireEvent.click(screen.getByRole('button', { name: 'Logseq Copilot settings' }));
    expect(onOpenOptions).toHaveBeenCalledOnce();
  });

  test('no pages: one line and nothing else', () => {
    const { container } = renderCard([]);
    expect(screen.getByRole('status').textContent).toBe('No related notes in Logseq');
    expect(container.querySelector('.lc-head, .lc-page, button')).toBeNull();
  });

  test('loading: a skeleton', () => {
    const { container } = render(
      <RecallCard state="loading" terms={[]} onOpenOptions={() => {}} />,
    );
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(container.querySelectorAll('.lc-sk-group')).toHaveLength(2);
  });

  test('error: the message and the way to settings', () => {
    const onOpenOptions = vi.fn();
    render(
      <RecallCard
        state="error"
        error="Cannot connect to Logseq"
        terms={[]}
        onOpenOptions={onOpenOptions}
      />,
    );
    const status = screen.getByRole('status');
    expect(status.textContent).toContain('Cannot connect to Logseq');
    fireEvent.click(within(status).getByRole('button', { name: 'Check the connection' }));
    expect(onOpenOptions).toHaveBeenCalledOnce();
  });
});

describe('buildPageTree', () => {
  test('counts hidden hits from the hits, not totalHits', () => {
    const p = page('P', ['a', 'b', 'c'].map((t) => hit(t, t)), { totalHits: 40 });
    expect(buildPageTree(p).hidden).toBe(1);
    expect(buildPageTree(p, true).hidden).toBe(0);
  });
});

describe('formatRelativeTime', () => {
  test.each([
    [30 * 1000, '1m ago'],
    [5 * 60 * 1000, '5m ago'],
    [3 * 60 * 60 * 1000, '3h ago'],
    [3 * DAY, '3d ago'],
    [15 * DAY, '2w ago'],
    [90 * DAY, '3mo ago'],
    [800 * DAY, '2y ago'],
  ])('%i ms ago reads %s', (ago, expected) => {
    expect(formatRelativeTime(NOW - ago, NOW, 'en')).toBe(expected);
  });

  test('future times read as just now, other locales follow the language', () => {
    expect(formatRelativeTime(NOW + DAY, NOW, 'en')).toBe('1m ago');
    expect(formatRelativeTime(NOW - 3 * DAY, NOW, 'zh-CN')).toBe('3天前');
  });
});
