import React, { useState } from 'react';
import {
  IconAlertCircle,
  IconCalendar,
  IconCheck,
  IconChevronDown,
  IconFile,
  IconSettings,
} from '@tabler/icons-react';
import type { RecallHit, RecallPage, RecallResult } from '@/types/recall';
import logo from '@/assets/img/logo.png';
import { buildPageTree, VISIBLE_PAGES, type RecallNode } from './recall-tree';
import { RecallText } from './RecallText';
import { formatRelativeTime } from './relative-time';
import './recall-card.css';

// Snippet windows (characters): a hit shows two lines, a context line one.
const HIT_SNIPPET = 90;
const CONTEXT_SNIPPET = 50;

// In a module of their own so the sidebar can use them without this card's CSS.
import { blockUrl, graphUrl, pageUrl } from '@/utils/logseq-url';
export { blockUrl, graphUrl, pageUrl };

type Shared = { graph: string; terms: string[] };

const TaskBox = ({ task }: { task: NonNullable<RecallHit['task']> }) => {
  if (task.done && task.marker === 'DONE') {
    return (
      <i className="lc-box" data-state="done">
        <IconCheck aria-hidden />
      </i>
    );
  }
  const doing = task.marker === 'DOING' || task.marker === 'NOW';
  return <i className="lc-box" data-state={doing ? 'doing' : task.done ? 'canceled' : 'todo'} />;
};

const HitRow = ({ hit, graph, terms, hasChildren }: Shared & { hit: RecallHit; hasChildren: boolean }) => (
  <a
    className="lc-hit"
    href={blockUrl(graph, hit.uuid)}
    data-marker={hit.task?.marker}
    data-done={hit.task?.done || undefined}
    data-kids={hasChildren || undefined}
  >
    <span className="lc-glyph" aria-hidden>
      {hit.task ? <TaskBox task={hit.task} /> : <i className="lc-bullet" />}
    </span>
    <span className="lc-hit-text">
      <RecallText text={hit.text} segments={hit.segments} terms={terms} maxLength={HIT_SNIPPET} />
    </span>
  </a>
);

const Node = ({ node, graph, terms }: Shared & { node: RecallNode }) => {
  const hasChildren = node.children.length > 0;
  return (
    <div className="lc-node">
      {node.hit ? (
        <HitRow hit={node.hit} graph={graph} terms={terms} hasChildren={hasChildren} />
      ) : (
        <a
          className="lc-ctx"
          href={blockUrl(graph, node.uuid)}
          title={node.context!.text}
          data-kids={hasChildren || undefined}
        >
          <span className="lc-glyph" aria-hidden>
            <i className="lc-bullet" />
          </span>
          <span className="lc-ctx-text">
            <RecallText
              text={node.context!.text}
              segments={node.context!.segments}
              terms={terms}
              maxLength={CONTEXT_SNIPPET}
              styleRefs={false}
            />
          </span>
        </a>
      )}
      {hasChildren && (
        <div className="lc-kids">
          {node.children.map((child) => (
            <Node key={child.uuid} node={child} graph={graph} terms={terms} />
          ))}
        </div>
      )}
    </div>
  );
};

/** "Projects/Homelab": the namespace muted, the last part bold. */
const PageTitle = ({ page }: { page: RecallPage }) => {
  const cut = page.kind === 'page' ? page.title.lastIndexOf('/') : -1;
  if (cut <= 0) return <>{page.title}</>;
  return (
    <>
      <span className="lc-ns">{page.title.slice(0, cut + 1)}</span>
      {page.title.slice(cut + 1)}
    </>
  );
};

const PageGroup = ({
  page,
  graph,
  terms,
  locale,
  now,
}: Shared & { page: RecallPage; locale?: string; now: number }) => {
  const [expanded, setExpanded] = useState(false);
  const { nodes, hidden } = buildPageTree(page, expanded);
  const Icon = page.kind === 'journal' ? IconCalendar : IconFile;
  return (
    <section className="lc-page" data-kind={page.kind}>
      <a className="lc-page-row" href={pageUrl(graph, page.name)}>
        <Icon className="lc-page-icon" aria-hidden />
        <span className="lc-page-name">
          <PageTitle page={page} />
        </span>
        {page.kind !== 'journal' && page.updatedAt !== undefined && (
          <time dateTime={new Date(page.updatedAt).toISOString()}>
            {formatRelativeTime(page.updatedAt, now, locale)}
          </time>
        )}
      </a>
      {nodes.length > 0 && (
        <div className="lc-tree">
          {nodes.map((node) => (
            <Node key={node.uuid} node={node} graph={graph} terms={terms} />
          ))}
        </div>
      )}
      {hidden > 0 && (
        <button
          type="button"
          className="lc-plus"
          aria-label={`Show ${hidden} more`}
          onClick={() => setExpanded(true)}
        >
          +{hidden}
        </button>
      )}
    </section>
  );
};

const Header = ({ graph, onOpenOptions }: { graph?: string; onOpenOptions: () => void }) => (
  <div className="lc-head">
    {graph ? (
      <a className="lc-graph" href={graphUrl(graph)}>
        <img className="lc-logo" src={logo} alt="" />
        <span className="lc-graph-name">{graph}</span>
      </a>
    ) : (
      <span className="lc-graph">
        <img className="lc-logo" src={logo} alt="" />
        <span className="lc-graph-name">Logseq</span>
      </span>
    )}
    <button
      type="button"
      className="lc-gear"
      title="Logseq Copilot settings"
      aria-label="Logseq Copilot settings"
      onClick={onOpenOptions}
    >
      <IconSettings aria-hidden />
    </button>
  </div>
);

const Skeleton = () => {
  const group = (title: string, first: string, second: string) => (
    <div className="lc-sk-group">
      <div className="lc-sk-row">
        <i className="lc-sk" style={{ width: 14, height: 14 }} />
        <i className="lc-sk" style={{ width: title, height: 11 }} />
        <i className="lc-sk lc-sk-end" style={{ width: 34, height: 9 }} />
      </div>
      <div className="lc-sk-line">
        <i className="lc-sk" style={{ width: first }} />
      </div>
      <div className="lc-sk-line">
        <i className="lc-sk" style={{ width: second }} />
      </div>
    </div>
  );
  return (
    <div className="lc-card" aria-busy="true" aria-label="Searching Logseq">
      <div className="lc-head">
        <span className="lc-graph">
          <img className="lc-logo lc-logo-dim" src={logo} alt="" />
          <i className="lc-sk" style={{ width: 52, height: 9 }} />
        </span>
      </div>
      {group('38%', '92%', '64%')}
      {group('52%', '84%', '40%')}
    </div>
  );
};

export type RecallCardProps = {
  state: 'loading' | 'success' | 'error';
  result?: RecallResult;
  /** Query terms to mark in the text (normalizeQuery(query).terms). */
  terms: string[];
  error?: string;
  onOpenOptions: () => void;
  /** Locale of the relative times; the browser default when left out. */
  locale?: string;
  /** Clock for the relative times (tests). */
  now?: number;
};

/**
 * Search engine result page card: the Logseq pages that mention the query,
 * each with its best hits under their context lines.
 */
export const RecallCard = ({
  state,
  result,
  terms,
  error,
  onOpenOptions,
  locale,
  now = Date.now(),
}: RecallCardProps) => {
  const [allPages, setAllPages] = useState(false);

  if (state === 'loading') return <Skeleton />;

  if (state === 'error') {
    return (
      <div className="lc-card">
        <Header onOpenOptions={onOpenOptions} />
        <div className="lc-error" role="status">
          <IconAlertCircle className="lc-error-icon" aria-hidden />
          <span>
            {error || 'Unable to connect to Logseq.'}{' '}
            <button type="button" className="lc-inline-link" onClick={onOpenOptions}>
              Check the connection
            </button>
          </span>
        </div>
      </div>
    );
  }

  const pages = result?.pages ?? [];
  if (!result || pages.length === 0) {
    return (
      <div className="lc-card">
        <div className="lc-empty" role="status">
          <img className="lc-logo" src={logo} alt="" />
          No related notes in Logseq
        </div>
      </div>
    );
  }

  const shown = allPages ? pages : pages.slice(0, VISIBLE_PAGES);
  return (
    <div className="lc-card">
      <Header graph={result.graph} onOpenOptions={onOpenOptions} />
      {shown.map((page) => (
        <PageGroup
          key={page.uuid}
          page={page}
          graph={result.graph}
          terms={terms}
          locale={locale}
          now={now}
        />
      ))}
      {!allPages && pages.length > VISIBLE_PAGES && (
        <button
          type="button"
          className="lc-chev"
          aria-label={`Show ${pages.length - VISIBLE_PAGES} more pages`}
          onClick={() => setAllPages(true)}
        >
          <IconChevronDown aria-hidden />
        </button>
      )}
    </div>
  );
};
