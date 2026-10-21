import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import * as CheckboxPrimitive from '@radix-ui/react-checkbox';
import { IconArrowUpRight, IconCheck } from '@tabler/icons-react';
import { LogseqBlockType } from '@/types/logseqBlock';
import LogseqPageLink, { pageUrl } from './LogseqPage';
import { sendMessage } from '@/types/messaging';
import './logseq-results.css';

type LogseqBlockProps = {
  graph: string;
  blocks: LogseqBlockType[];
  isPopUp?: boolean;
};

/** Markers Logseq draws an unchecked / checked box for (block-checkbox). */
const OPEN_MARKERS = ['TODO', 'DOING', 'LATER', 'NOW', 'IN-PROGRESS', 'WAIT', 'WAITING'];
const CHECKED_MARKERS = ['DONE'];
const CANCELED_MARKERS = ['CANCELED', 'CANCELLED'];

// Logseq's marker switch toggles between the "started" and "not started"
// state of a task; other markers have no such counterpart.
const NEXT_MARKER: Record<string, string> = {
  TODO: 'DOING',
  DOING: 'TODO',
  NOW: 'LATER',
  LATER: 'NOW',
};
/** Markers whose label stays in front of the text (in-progress styling). */
const SHOWN_MARKERS = ['DOING', 'NOW'];

export const blockUrl = (graph: string, uuid: string) =>
  `logseq://graph/${encodeURIComponent(graph)}?block-id=${encodeURIComponent(uuid)}`;

/** A task's marker and its changes, sent through the background. */
const useTaskMarker = (uuid: string, marker: string) => {
  const [status, setStatus] = useState(marker);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setStatus(marker);
    setError('');
  }, [marker, uuid]);

  const update = async (newMarker: string | undefined) => {
    if (!newMarker || pending) return;
    setPending(true);
    setError('');
    try {
      const result = await sendMessage('logseq:changeBlockMarker', {
        uuid,
        marker: newMarker,
      });
      if (result.status === 'success') {
        setStatus(result.marker);
      } else {
        setError(result.msg || 'Failed to change the task status.');
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to change the task status.',
      );
    } finally {
      setPending(false);
    }
  };

  return { status, pending, error, update };
};

const MarkerSwitch = ({
  status,
  pending,
  onSwitch,
}: {
  status: string;
  pending: boolean;
  onSwitch: () => void;
}) => (
  <button
    type="button"
    className="lc-marker"
    disabled={pending}
    title={`Change from ${status} to ${NEXT_MARKER[status]}`}
    onClick={onSwitch}
  >
    {status}
  </button>
);

/**
 * Folds content taller than seven lines behind "Show more". The height is
 * measured, so short blocks get no toggle; images re-measure when they load.
 */
const Foldable = ({ children }: { children: React.ReactNode }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [overflows, setOverflows] = useState(false);
  const [open, setOpen] = useState(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      // Folded height is 140px (7 lines, or a line and an image); a few px
      // of slack avoids a toggle that reveals nothing.
      setOverflows(el.scrollHeight > 146);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    el.querySelectorAll('img').forEach((img) => img.addEventListener('load', measure));
    return () => observer.disconnect();
  }, []);

  return (
    <>
      <div ref={ref} className="lc-clamp" data-folded={overflows && !open ? 'true' : 'false'}>
        {children}
      </div>
      {overflows && (
        <button
          type="button"
          className="lc-button lc-fold"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          {open ? 'Show less' : 'Show more'}
        </button>
      )}
    </>
  );
};

/**
 * One result block, drawn like a block in Logseq: a bullet, the task
 * checkbox and marker in front of the text, the text folded when long.
 * `children` are nested result blocks (indented under this one).
 */
export const LogseqBlockRow = ({
  graph,
  block,
  children,
}: {
  graph: string;
  block: LogseqBlockType;
  children?: React.ReactNode;
}) => {
  const { status, pending, error, update } = useTaskMarker(block.uuid, block.marker ?? '');
  const isOpen = OPEN_MARKERS.includes(status);
  const isChecked = CHECKED_MARKERS.includes(status);
  const hasCheckbox = isOpen || isChecked;
  const canSwitch = !!NEXT_MARKER[status];
  const showMarker = SHOWN_MARKERS.includes(status);
  const hasStatusLabel = !!status && !hasCheckbox && !CANCELED_MARKERS.includes(status);

  return (
    <li>
      <div className="lc-block-row" data-marker={status || undefined}>
        <Foldable>
          {(hasCheckbox || hasStatusLabel || showMarker) && (
            <span className="lc-task">
              {hasCheckbox && (
                <CheckboxPrimitive.Root
                  className="lc-checkbox"
                  checked={isChecked}
                  disabled={pending}
                  aria-label={isChecked ? `Mark as TODO` : `Mark as DONE`}
                  onCheckedChange={(checked) => update(checked === true ? 'DONE' : 'TODO')}
                >
                  <CheckboxPrimitive.Indicator>
                    <IconCheck stroke={3} />
                  </CheckboxPrimitive.Indicator>
                </CheckboxPrimitive.Root>
              )}
              {showMarker && (
                <MarkerSwitch status={status} pending={pending} onSwitch={() => update(NEXT_MARKER[status])} />
              )}
              {hasStatusLabel && <span className="lc-status">{status}</span>}
            </span>
          )}
          <div className="lc-content" dangerouslySetInnerHTML={{ __html: block.html }} />
          {block.tagNames && block.tagNames.length > 0 && (
            <div className="lc-block-tags">
              {block.tagNames.map((name) => (
                <a key={name} className="lc-block-tag" href={pageUrl(graph, name)}>
                  #{name}
                </a>
              ))}
            </div>
          )}
        </Foldable>
        {error && (
          <span role="alert" className="lc-task-error">
            {error}
          </span>
        )}
        <div className="lc-actions">
          {canSwitch && !showMarker && (
            <MarkerSwitch status={status} pending={pending} onSwitch={() => update(NEXT_MARKER[status])} />
          )}
          {block.uuid && (
            <a
              className="lc-button lc-icon-button"
              href={blockUrl(graph, block.uuid)}
              title="Open block in Logseq"
              aria-label="Open block in Logseq"
            >
              <IconArrowUpRight />
            </a>
          )}
        </div>
      </div>
      {children}
    </li>
  );
};

/**
 * A page title and its result blocks. Used where the blocks of one page are
 * shown on their own; the result lists group and nest through
 * LogseqResultList.
 */
export const LogseqBlock = ({ graph, blocks }: LogseqBlockProps) => {
  const shown = blocks.filter((block) => block.html);
  if (shown.length === 0) {
    return null;
  }

  return (
    <div className="lc-results lc-group">
      <LogseqPageLink graph={graph} page={shown[0].page} />
      <ul className="lc-blocks">
        {shown.map((block) => (
          <LogseqBlockRow key={block.uuid} graph={graph} block={block} />
        ))}
      </ul>
    </div>
  );
};
