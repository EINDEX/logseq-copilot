/**
 * The state of the picker panel: which template a clip is saved with, and the
 * note typed with it. The panel is shown for the clip shortcut and the float
 * button when more than one template is on offer (src/utils/template-choice.ts).
 * It has no DOM of its own; ClipPicker.tsx draws it.
 *
 * - A countdown starts when it opens. When it runs out, the highlighted template
 *   (the first, the default) is saved.
 * - Interaction stops the countdown for good: the arrow keys, the pointer over
 *   the panel, focus or typing in the note field. After that only an explicit
 *   decision saves.
 * - Decide: Enter, a digit (not in the note field), a click on a template, or
 *   the clip command again: save at once. Escape: nothing is written.
 * - A click outside is ignored while counting, and cancels once stopped.
 * - The tab hidden while counting saves at once. The page leaving (`pagehide`)
 *   saves at once, with the note typed so far: a clip is never lost silently.
 *   The tab hidden after the countdown stopped keeps the panel.
 */

/** How long the countdown runs, in ms. */
export const PICKER_MS = 3_000;
/** The digits 1 to 9 pick a template, so no more are offered. */
export const PICKER_MAX_TEMPLATES = 9;

export interface PickerTemplate {
  id: string;
  name: string;
}

export interface PickerView {
  /** `closed`: decided or cancelled. */
  phase: 'open' | 'closed';
  /** The default first, then the other pinned ones. */
  templates: PickerTemplate[];
  /** Index into `templates`. */
  highlighted: number;
  /** The countdown is running. Once false it never runs again. */
  counting: boolean;
  note: string;
}

export interface PickerDecision {
  templateId: string;
  note: string;
}

export interface KeyInfo {
  key: string;
  shiftKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  isComposing?: boolean;
}

export interface PickerOptions {
  /** The default first. */
  templates: PickerTemplate[];
  /** Save the clip. Called once, at most. */
  onDecide: (decision: PickerDecision) => void;
  /** Escape, or a click outside after the countdown stopped. */
  onCancel?: () => void;
  /** The panel is gone, whatever the reason. */
  onClosed?: () => void;
  /** The event comes from the panel itself: the panel handles it. */
  isPanelEvent?: (event: Event) => boolean;
  durationMs?: number;
  /** Where keys and clicks are seen. */
  doc?: Pick<Document, 'addEventListener' | 'removeEventListener'>;
  /** Where `pagehide` is seen. */
  win?: Pick<Window, 'addEventListener' | 'removeEventListener'>;
  isHidden?: () => boolean;
}

export interface ClipPicker {
  getView: () => PickerView;
  subscribe: (listener: () => void) => () => void;
  /** The highlight one up or down, wrapping. Stops the countdown. */
  move: (delta: 1 | -1) => void;
  /** The pointer is over the panel. Stops the countdown. */
  hover: () => void;
  /** The note field has focus. Stops the countdown. */
  focusNote: () => void;
  /** The note changed. Stops the countdown. */
  setNote: (note: string) => void;
  /** Save with `templateId`, the highlighted one without it. */
  decide: (templateId?: string) => void;
  /** Nothing is written. */
  cancel: () => void;
  /**
   * A key pressed in the panel (`inNote`: in its note field) or anywhere else.
   * True when the panel took it: the caller must not let it go on.
   */
  handleKey: (event: KeyInfo, inNote: boolean) => boolean;
  /** Close without saving or cancelling: listeners and timers are removed. */
  destroy: () => void;
}

/**
 * The key goes to something the user types in: a digit there is text. No
 * instanceof: in a content script the element may come from another realm.
 */
export const isEditableTarget = (
  event: Pick<Event, 'target' | 'composedPath'>,
): boolean => {
  const target = (event.composedPath?.()[0] ?? event.target) as
    | { tagName?: unknown; isContentEditable?: unknown }
    | null
    | undefined;
  if (!target) return false;
  const tag = typeof target.tagName === 'string' ? target.tagName.toUpperCase() : '';
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    target.isContentEditable === true
  );
};

export const createClipPicker = ({
  templates,
  onDecide,
  onCancel,
  onClosed,
  isPanelEvent = () => false,
  durationMs = PICKER_MS,
  doc = document,
  win = window,
  isHidden = () => document.visibilityState === 'hidden',
}: PickerOptions): ClipPicker => {
  let view: PickerView = {
    phase: 'open',
    templates: templates.slice(0, PICKER_MAX_TEMPLATES),
    highlighted: 0,
    counting: true,
    note: '',
  };
  const listeners = new Set<() => void>();
  const update = (change: Partial<PickerView>) => {
    view = { ...view, ...change };
    listeners.forEach((listener) => listener());
  };

  let timer: ReturnType<typeof setTimeout> | undefined;
  const open = () => view.phase === 'open';

  const stop = () => {
    if (!open() || !view.counting) return;
    clearTimeout(timer);
    update({ counting: false });
  };

  const close = () => {
    clearTimeout(timer);
    doc.removeEventListener('keydown', onKeydown as EventListener, true);
    doc.removeEventListener('pointerdown', onPointerdown as EventListener, true);
    doc.removeEventListener('visibilitychange', onVisibility);
    win.removeEventListener('pagehide', onPagehide);
    if (!open()) return;
    update({ phase: 'closed', counting: false });
    onClosed?.();
  };

  const decide = (templateId?: string) => {
    if (!open()) return;
    const chosen =
      view.templates.find((template) => template.id === templateId) ??
      view.templates[view.highlighted];
    const { note } = view;
    close();
    if (chosen) onDecide({ templateId: chosen.id, note });
  };

  const cancel = () => {
    if (!open()) return;
    close();
    onCancel?.();
  };

  const handleKey = (event: KeyInfo, inNote: boolean): boolean => {
    if (!open() || event.isComposing) return false;
    if (event.key === 'Escape') {
      cancel();
      return true;
    }
    const plain = !event.ctrlKey && !event.metaKey && !event.altKey;
    if (event.key === 'Enter' && plain && !event.shiftKey) {
      decide();
      return true;
    }
    if (!plain) return false;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      // In a note of several lines the arrows move the caret.
      if (inNote && view.note.includes('\n')) return false;
      move(event.key === 'ArrowDown' ? 1 : -1);
      return true;
    }
    if (!inNote && !event.shiftKey && /^[1-9]$/.test(event.key)) {
      const picked = view.templates[Number(event.key) - 1];
      if (!picked) return false;
      decide(picked.id);
      return true;
    }
    return false;
  };

  const move = (delta: 1 | -1) => {
    if (!open()) return;
    stop();
    const count = view.templates.length;
    update({ highlighted: (view.highlighted + delta + count) % count });
  };

  function onKeydown(event: KeyboardEvent) {
    // Keys of the panel are handled by the panel; keys of a field of the page
    // are the page's.
    if (isPanelEvent(event) || isEditableTarget(event)) return;
    if (handleKey(event, false)) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }

  function onPointerdown(event: Event) {
    if (isPanelEvent(event)) return;
    if (!view.counting) cancel();
  }

  function onVisibility() {
    if (view.counting && isHidden()) decide();
  }

  function onPagehide() {
    decide();
  }

  doc.addEventListener('keydown', onKeydown as EventListener, true);
  doc.addEventListener('pointerdown', onPointerdown as EventListener, true);
  doc.addEventListener('visibilitychange', onVisibility);
  win.addEventListener('pagehide', onPagehide);
  timer = setTimeout(() => decide(), durationMs);

  return {
    getView: () => view,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    move,
    hover: stop,
    focusNote: stop,
    setNote: (note) => {
      if (!open()) return;
      stop();
      update({ note });
    },
    decide,
    cancel,
    handleKey,
    destroy: close,
  };
};

// ---- the panel that is up ----------------------------------------------------

let panelElement: Element | null = null;

/** The element of the panel on screen, so its events are known (ClipPicker.tsx). */
export const setPanelElement = (element: Element | null) => {
  panelElement = element;
};

/**
 * The event comes from the panel. Events of a closed shadow root reach the page
 * with its host as the target, so the path is checked for the host as well.
 */
export const isPanelEvent = (event: Event): boolean => {
  if (!panelElement) return false;
  const root = panelElement.getRootNode() as { host?: Element };
  const path = event.composedPath?.() ?? [];
  return path.includes(panelElement) || (!!root.host && path.includes(root.host));
};

let active: ClipPicker | null = null;
const activeListeners = new Set<() => void>();
const announce = () => activeListeners.forEach((listener) => listener());

/** The picker that is up, for ClipPicker.tsx. */
export const getActivePicker = () => active;
export const subscribeActivePicker = (listener: () => void) => {
  activeListeners.add(listener);
  return () => {
    activeListeners.delete(listener);
  };
};

/** Open the panel; the one still up goes without saving. */
export const openClipPicker = (options: PickerOptions): ClipPicker => {
  active?.destroy();
  const picker: ClipPicker = createClipPicker({
    isPanelEvent,
    ...options,
    onClosed: () => {
      if (active === picker) {
        active = null;
        announce();
      }
      options.onClosed?.();
    },
  });
  active = picker;
  announce();
  return picker;
};

/**
 * The clip command arrived again while the panel is up: save with the
 * highlighted template at once. False when there is no panel (a new clip).
 */
export const confirmActivePicker = (): boolean => {
  if (!active || active.getView().phase !== 'open') return false;
  active.decide();
  return true;
};
