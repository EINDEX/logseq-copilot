import { useEffect, useRef, useSyncExternalStore, type CSSProperties } from 'react';
import { zIndex } from '@/utils/z-index';
import {
  PICKER_MS,
  getActivePicker,
  setPanelElement,
  subscribeActivePicker,
  type ClipPicker as ClipPickerState,
} from './clip-picker';

// Inline px and an own <style>, like the clip error: the panel must not depend
// on the host page's rem size, nor on a utility class of the stylesheet.
const KEYFRAMES = `
@keyframes logseq-copilot-picker-in { from { opacity: 0; transform: translateY(6px); } }
@keyframes logseq-copilot-picker-drain { from { transform: scaleX(1); } to { transform: scaleX(0); } }`;

const FONT = '13px/18px system-ui, -apple-system, "Segoe UI", sans-serif';

const card: CSSProperties = {
  position: 'fixed',
  right: '16px',
  bottom: '16px',
  zIndex,
  boxSizing: 'border-box',
  overflow: 'hidden',
  width: 'min(280px, calc(100vw - 32px))',
  padding: '6px 6px 8px',
  background: 'var(--background)',
  color: 'var(--foreground)',
  border: '1px solid var(--border)',
  borderRadius: '8px',
  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
  font: FONT,
  animation: 'logseq-copilot-picker-in 160ms ease-out',
};

const Panel = ({ picker }: { picker: ClipPickerState }) => {
  const view = useSyncExternalStore(picker.subscribe, picker.getView);
  const cardRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const noteRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const element = cardRef.current;
    const before = document.activeElement as HTMLElement | null;
    setPanelElement(element);
    // The keys go to the panel from here on; the page's selection is already
    // captured, so taking the focus loses nothing.
    listRef.current?.focus({ preventScroll: true });
    return () => {
      setPanelElement(null);
      if (before?.isConnected) before.focus({ preventScroll: true });
    };
  }, []);

  if (view.phase === 'closed') return null;

  return (
    <div
      ref={cardRef}
      data-clip-picker
      onPointerEnter={() => picker.hover()}
      // What is typed in the panel is not the page's: its hotkeys must not
      // see it.
      onKeyDown={(event) => {
        if (picker.handleKey(event.nativeEvent, event.target === noteRef.current)) {
          event.preventDefault();
        }
        event.stopPropagation();
      }}
      onKeyUp={(event) => event.stopPropagation()}
      onKeyPress={(event) => event.stopPropagation()}
      style={card}
    >
      <style>{KEYFRAMES}</style>
      <div
        ref={listRef}
        role="listbox"
        tabIndex={0}
        aria-label="Template"
        aria-activedescendant={`logseq-copilot-picker-${view.highlighted}`}
        style={{ outline: 'none' }}
      >
        {view.templates.map((template, index) => {
          const current = index === view.highlighted;
          return (
            <div
              key={template.id}
              id={`logseq-copilot-picker-${index}`}
              role="option"
              aria-selected={current}
              data-template-id={template.id}
              // A press must not take the focus off the panel.
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => picker.decide(template.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '5px 8px',
                borderRadius: '6px',
                cursor: 'pointer',
                background: current ? 'var(--accent)' : 'transparent',
                color: current ? 'var(--accent-foreground)' : 'var(--foreground)',
                fontWeight: current ? 600 : 400,
              }}
            >
              <span style={{ flex: 'none', width: '10px', opacity: 0.55 }}>{index + 1}</span>
              <span
                style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              >
                {template.name || 'Untitled'}
              </span>
            </div>
          );
        })}
      </div>
      <textarea
        ref={noteRef}
        aria-label="Note"
        placeholder="Note"
        rows={2}
        value={view.note}
        onFocus={() => picker.focusNote()}
        onChange={(event) => picker.setNote(event.target.value)}
        style={{
          display: 'block',
          boxSizing: 'border-box',
          width: '100%',
          margin: '6px 0 0',
          padding: '6px 8px',
          font: FONT,
          color: 'var(--foreground)',
          background: 'var(--background)',
          border: '1px solid var(--input)',
          borderRadius: '6px',
          resize: 'none',
          outline: 'none',
        }}
      />
      {view.counting && (
        <div
          aria-hidden
          data-clip-picker-progress
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            height: '2px',
            background: 'var(--primary)',
            transformOrigin: 'left center',
            animation: `logseq-copilot-picker-drain ${PICKER_MS}ms linear forwards`,
          }}
        />
      )}
    </div>
  );
};

/** The picker panel of the clip in the making; nothing when there is none. */
export const ClipPicker = () => {
  const picker = useSyncExternalStore(subscribeActivePicker, getActivePicker);
  return picker ? <Panel picker={picker} /> : null;
};
