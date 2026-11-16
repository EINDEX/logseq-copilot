import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PICKER_MAX_TEMPLATES,
  PICKER_MS,
  confirmActivePicker,
  createClipPicker,
  getActivePicker,
  isEditableTarget,
  openClipPicker,
  type PickerOptions,
} from './clip-picker';

const TEMPLATES = [
  { id: 'clip', name: 'Clip' },
  { id: 'task', name: 'Task' },
  { id: 'read', name: 'Reading note' },
];

const key = (name: string, init: KeyboardEventInit = {}, target: EventTarget = document) => {
  const event = new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event;
};

describe('the picker panel', () => {
  const onDecide = vi.fn();
  const onCancel = vi.fn();
  const onClosed = vi.fn();
  let hidden = false;
  let picker: ReturnType<typeof createClipPicker>;

  const open = (options: Partial<PickerOptions> = {}) => {
    picker = createClipPicker({
      templates: TEMPLATES,
      onDecide,
      onCancel,
      onClosed,
      isHidden: () => hidden,
      ...options,
    });
    return picker;
  };

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    onDecide.mockReset();
    onCancel.mockReset();
    onClosed.mockReset();
    hidden = false;
  });

  afterEach(() => {
    picker?.destroy();
    vi.useRealTimers();
  });

  describe('opens', () => {
    it('counting, with the first template (the default) highlighted and no note', () => {
      expect(open().getView()).toEqual({
        phase: 'open',
        templates: TEMPLATES,
        highlighted: 0,
        counting: true,
        note: '',
      });
    });

    it('offers 9 templates at most: one digit each', () => {
      const many = Array.from({ length: 12 }, (_, i) => ({ id: `t${i}`, name: `T${i}` }));
      expect(open({ templates: many }).getView().templates).toHaveLength(PICKER_MAX_TEMPLATES);
    });
  });

  describe('the countdown', () => {
    it('saves the highlighted template when it runs out', () => {
      open();
      vi.advanceTimersByTime(PICKER_MS - 1);
      expect(onDecide).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);
      expect(onDecide).toHaveBeenCalledWith({ templateId: 'clip', note: '' });
      expect(picker.getView().phase).toBe('closed');
      expect(onClosed).toHaveBeenCalledTimes(1);
    });

    it.each([
      ['↑/↓', (p: typeof picker) => p.move(1)],
      ['the pointer over the panel', (p: typeof picker) => p.hover()],
      ['focus in the note field', (p: typeof picker) => p.focusNote()],
      ['typing in the note field', (p: typeof picker) => p.setNote('a')],
    ])('is stopped for good by %s: nothing is saved without a decision', (_name, interact) => {
      open();
      vi.advanceTimersByTime(PICKER_MS - 500);
      interact(picker);
      expect(picker.getView().counting).toBe(false);
      vi.advanceTimersByTime(60_000);
      expect(onDecide).not.toHaveBeenCalled();
      expect(picker.getView().phase).toBe('open');
      // It does not start again.
      picker.hover();
      picker.move(-1);
      expect(picker.getView().counting).toBe(false);
    });
  });

  describe('moves the highlight', () => {
    it('with the arrow keys, wrapping round', () => {
      open();
      expect(key('ArrowDown').defaultPrevented).toBe(true);
      expect(picker.getView().highlighted).toBe(1);
      key('ArrowDown');
      key('ArrowDown');
      expect(picker.getView().highlighted).toBe(0);
      key('ArrowUp');
      expect(picker.getView().highlighted).toBe(2);
    });

    it('then Enter saves the second one', () => {
      open();
      key('ArrowDown');
      const enter = key('Enter');
      expect(enter.defaultPrevented).toBe(true);
      expect(onDecide).toHaveBeenCalledWith({ templateId: 'task', note: '' });
    });

    it('but in a note of several lines the arrows are the caret’s', () => {
      open();
      picker.setNote('one\ntwo');
      expect(picker.handleKey({ key: 'ArrowDown' }, true)).toBe(false);
      expect(picker.getView().highlighted).toBe(0);
      picker.setNote('one line');
      expect(picker.handleKey({ key: 'ArrowDown' }, true)).toBe(true);
      expect(picker.getView().highlighted).toBe(1);
    });
  });

  describe('decides', () => {
    it('with Enter: the highlighted template at once, with the note', () => {
      open();
      picker.setNote('my note');
      key('Enter');
      expect(onDecide).toHaveBeenCalledExactlyOnceWith({ templateId: 'clip', note: 'my note' });
    });

    it('with a digit: that template at once', () => {
      open();
      key('3');
      expect(onDecide).toHaveBeenCalledExactlyOnceWith({ templateId: 'read', note: '' });
    });

    it('ignores a digit with no template, and with a modifier', () => {
      open();
      key('4');
      key('2', { metaKey: true });
      key('2', { shiftKey: true });
      expect(onDecide).not.toHaveBeenCalled();
    });

    it('does not take a digit typed in the note field: it is text', () => {
      open();
      expect(picker.handleKey({ key: '2' }, true)).toBe(false);
      expect(onDecide).not.toHaveBeenCalled();
    });

    it('saves with Enter in the note field, and Shift+Enter is a new line', () => {
      open();
      expect(picker.handleKey({ key: 'Enter', shiftKey: true }, true)).toBe(false);
      expect(onDecide).not.toHaveBeenCalled();
      picker.setNote('a');
      expect(picker.handleKey({ key: 'Enter' }, true)).toBe(true);
      expect(onDecide).toHaveBeenCalledWith({ templateId: 'clip', note: 'a' });
    });

    it('does not take Enter that ends an IME composition', () => {
      open();
      expect(picker.handleKey({ key: 'Enter', isComposing: true }, true)).toBe(false);
      expect(onDecide).not.toHaveBeenCalled();
    });

    it('with a click: that template at once', () => {
      open();
      picker.decide('task');
      expect(onDecide).toHaveBeenCalledExactlyOnceWith({ templateId: 'task', note: '' });
    });

    it('once: no second save, and the keys are the page’s again', () => {
      open();
      picker.decide('task');
      picker.decide('read');
      const enter = key('Enter');
      vi.advanceTimersByTime(PICKER_MS * 2);
      expect(onDecide).toHaveBeenCalledTimes(1);
      expect(enter.defaultPrevented).toBe(false);
    });

    it('with the clip command again (confirm): the highlighted one', () => {
      const up = openClipPicker({ templates: TEMPLATES, onDecide });
      up.move(1);
      expect(getActivePicker()).toBe(up);
      expect(confirmActivePicker()).toBe(true);
      expect(onDecide).toHaveBeenCalledExactlyOnceWith({ templateId: 'task', note: '' });
      expect(getActivePicker()).toBeNull();
      expect(confirmActivePicker()).toBe(false);
    });
  });

  describe('Escape', () => {
    it('cancels: nothing is saved, the countdown is gone', () => {
      open();
      const escape = key('Escape');
      expect(escape.defaultPrevented).toBe(true);
      expect(onCancel).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(PICKER_MS * 2);
      expect(onDecide).not.toHaveBeenCalled();
      expect(picker.getView().phase).toBe('closed');
    });

    it('cancels from the note field too', () => {
      open();
      picker.setNote('lost on purpose');
      expect(picker.handleKey({ key: 'Escape' }, true)).toBe(true);
      expect(onCancel).toHaveBeenCalledTimes(1);
      expect(onDecide).not.toHaveBeenCalled();
    });
  });

  describe('a click outside', () => {
    const click = () => document.dispatchEvent(new Event('pointerdown', { bubbles: true }));

    it('is ignored while the countdown runs', () => {
      open();
      click();
      expect(picker.getView().phase).toBe('open');
      vi.advanceTimersByTime(PICKER_MS);
      expect(onDecide).toHaveBeenCalledTimes(1);
      expect(onCancel).not.toHaveBeenCalled();
    });

    it('cancels once the countdown stopped', () => {
      open();
      picker.hover();
      click();
      expect(onCancel).toHaveBeenCalledTimes(1);
      expect(onDecide).not.toHaveBeenCalled();
    });

    it('is no click outside when it is in the panel', () => {
      open({ isPanelEvent: () => true });
      picker.hover();
      click();
      expect(picker.getView().phase).toBe('open');
    });
  });

  describe('the tab and the page', () => {
    const visibility = () => document.dispatchEvent(new Event('visibilitychange'));

    it('saves at once when the tab is hidden while counting', () => {
      open();
      hidden = true;
      visibility();
      expect(onDecide).toHaveBeenCalledExactlyOnceWith({ templateId: 'clip', note: '' });
    });

    it('keeps the panel when the tab is hidden after the countdown stopped', () => {
      open();
      picker.setNote('half a thought');
      hidden = true;
      visibility();
      expect(onDecide).not.toHaveBeenCalled();
      expect(picker.getView().phase).toBe('open');
    });

    it('does not save when the tab becomes visible', () => {
      open();
      visibility();
      expect(onDecide).not.toHaveBeenCalled();
    });

    it('saves at once, with the note so far, when the page leaves', () => {
      open();
      picker.move(1);
      picker.setNote('typed so far');
      window.dispatchEvent(new Event('pagehide'));
      expect(onDecide).toHaveBeenCalledExactlyOnceWith({ templateId: 'task', note: 'typed so far' });
    });

    it('also saves when the page leaves while counting', () => {
      open();
      window.dispatchEvent(new Event('pagehide'));
      expect(onDecide).toHaveBeenCalledExactlyOnceWith({ templateId: 'clip', note: '' });
    });
  });

  describe('keys', () => {
    it('are the page’s own when it is typing in a field', () => {
      open();
      const input = document.createElement('input');
      document.body.append(input);
      const event = key('Enter', {}, input);
      expect(event.defaultPrevented).toBe(false);
      expect(onDecide).not.toHaveBeenCalled();
      input.remove();
    });

    it('are the panel’s when they come from it', () => {
      open({ isPanelEvent: () => true });
      key('Enter');
      expect(onDecide).not.toHaveBeenCalled();
    });

    it('stops the page from seeing a key the panel took', () => {
      open();
      const seen = vi.fn();
      document.addEventListener('keydown', seen);
      key('Enter');
      document.removeEventListener('keydown', seen);
      expect(seen).not.toHaveBeenCalled();
    });
  });

  describe('closing', () => {
    it('destroy removes timers and listeners without saving', () => {
      open();
      picker.destroy();
      vi.advanceTimersByTime(PICKER_MS * 2);
      key('Enter');
      window.dispatchEvent(new Event('pagehide'));
      expect(onDecide).not.toHaveBeenCalled();
      expect(onClosed).toHaveBeenCalledTimes(1);
    });

    it('opening a panel closes the one that is up without saving', () => {
      const first = openClipPicker({ templates: TEMPLATES, onDecide });
      const second = openClipPicker({ templates: TEMPLATES, onDecide });
      expect(first.getView().phase).toBe('closed');
      expect(getActivePicker()).toBe(second);
      second.destroy();
      expect(getActivePicker()).toBeNull();
      expect(onDecide).not.toHaveBeenCalled();
    });
  });
});

describe('isEditableTarget', () => {
  it('is true for a field and for contenteditable, false for the rest', () => {
    const at = (target: unknown) => isEditableTarget({ target, composedPath: () => [] } as any);
    expect(at({ tagName: 'input' })).toBe(true);
    expect(at({ tagName: 'TEXTAREA' })).toBe(true);
    expect(at({ tagName: 'DIV', isContentEditable: true })).toBe(true);
    expect(at({ tagName: 'BODY' })).toBe(false);
    expect(at(null)).toBe(false);
  });
});
