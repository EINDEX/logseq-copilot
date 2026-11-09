import React, { useMemo, useState } from 'react';
import { IconChevronDown, IconChevronUp, IconFile } from '@tabler/icons-react';
import { cn } from '@/lib/utils';
import { LogseqBlockType, LogseqPageIdenity } from '@/types/logseqBlock';
import LogseqPageLink from './LogseqPage';
import { LogseqBlockRow } from './LogseqBlock';
import './logseq-results.css';

/** Results shown before "Show all". */
export const DEFAULT_VISIBLE_RESULTS = 10;

type ResultNode = { block: LogseqBlockType; children: ResultNode[] };
type PageGroup = { key: string; page: LogseqPageIdenity; nodes: ResultNode[] };

const pageKey = (page?: LogseqPageIdenity) =>
  (page?.name ?? page?.originalName ?? '').toLowerCase();

/**
 * Group blocks by page, in the order the pages first appear, and nest a block
 * under its parent when the parent is a result too (indented like in
 * Logseq). Blocks without HTML (e.g. only properties) are left out.
 */
export const groupResults = (blocks: LogseqBlockType[]): PageGroup[] => {
  const groups = new Map<string, PageGroup>();
  const nodes = new Map<number, ResultNode>();
  const shown = blocks.filter((block) => block.html);
  for (const block of shown) {
    const node: ResultNode = { block, children: [] };
    if (typeof block.id === 'number') nodes.set(block.id, node);
    const key = pageKey(block.page);
    if (!groups.has(key)) groups.set(key, { key, page: block.page, nodes: [] });
  }
  for (const block of shown) {
    const node = typeof block.id === 'number' ? nodes.get(block.id)! : { block, children: [] };
    const parent = block.parent?.id !== undefined ? nodes.get(block.parent.id) : undefined;
    if (parent && parent !== node && pageKey(parent.block.page) === pageKey(block.page)) {
      parent.children.push(node);
      continue;
    }
    groups.get(pageKey(block.page))!.nodes.push(node);
  }
  return [...groups.values()].filter((group) => group.nodes.length > 0);
};

const ResultTree = ({ graph, nodes }: { graph: string; nodes: ResultNode[] }) => (
  <ul className="lc-blocks">
    {nodes.map(({ block, children }) => (
      <LogseqBlockRow key={block.uuid} graph={graph} block={block}>
        {children.length > 0 && <ResultTree graph={graph} nodes={children} />}
      </LogseqBlockRow>
    ))}
  </ul>
);

type LogseqResultListProps = {
  graph: string;
  blocks: LogseqBlockType[];
  /** Page hits (title matches); pages that also have block results are not repeated. */
  pages?: (LogseqPageIdenity | null | undefined)[];
  /** Blocks shown before "Show all". */
  initialCount?: number;
  /**
   * `sidebar`: the browser sidebars' outline (checkbox in place of the
   * bullet, guide lines, a "+N" for the rest). The popup keeps the default.
   */
  variant?: 'default' | 'sidebar';
};

/**
 * Search results as page groups: the page title (opens the page), then its
 * blocks with Logseq task controls. The first `initialCount` blocks are shown,
 * the rest behind "Show all".
 */
export const LogseqResultList = ({
  graph,
  blocks,
  pages = [],
  initialCount = DEFAULT_VISIBLE_RESULTS,
  variant = 'default',
}: LogseqResultListProps) => {
  const [showAll, setShowAll] = useState(false);
  const withHtml = useMemo(() => blocks.filter((block) => block.html), [blocks]);
  const visible = showAll ? withHtml : withHtml.slice(0, initialCount);
  const groups = useMemo(() => groupResults(visible), [visible]);
  const allKeys = useMemo(() => new Set(withHtml.map((b) => pageKey(b.page))), [withHtml]);
  const pageOnly = pages.filter(
    (page): page is LogseqPageIdenity => !!page?.name && !allKeys.has(pageKey(page)),
  );
  const hidden = withHtml.length - visible.length;
  const sidebar = variant === 'sidebar';
  const moreLabel = showAll ? 'Show fewer' : `Show all ${withHtml.length} results`;

  return (
    <div className={cn('lc-results', sidebar && 'lc-results--sidebar')}>
      {pageOnly.map((page) => (
        <div className="lc-group" key={`page-${pageKey(page)}`}>
          <LogseqPageLink graph={graph} page={page} />
        </div>
      ))}
      {groups.map((group) => (
        <div className="lc-group" key={group.key}>
          <LogseqPageLink graph={graph} page={group.page} />
          <ResultTree graph={graph} nodes={group.nodes} />
        </div>
      ))}
      {(hidden > 0 || showAll) && withHtml.length > initialCount && (
        <div className="lc-more">
          {sidebar ? (
            <button
              type="button"
              className="lc-button lc-more-count"
              aria-expanded={showAll}
              aria-label={moreLabel}
              title={moreLabel}
              onClick={() => setShowAll(!showAll)}
            >
              {showAll ? <IconChevronUp /> : <IconFile />}
              {!showAll && `+${hidden}`}
            </button>
          ) : (
            <button
              type="button"
              className="lc-button"
              aria-expanded={showAll}
              onClick={() => setShowAll(!showAll)}
            >
              {showAll ? <IconChevronUp /> : <IconChevronDown />}
              {moreLabel}
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default LogseqResultList;
