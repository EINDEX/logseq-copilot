import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ClipPicker } from './ClipPicker';
import { PICKER_MS, getActivePicker, openClipPicker } from './clip-picker';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const TEMPLATES = [
  { id: 'clip', name: 'Clip' },
  { id: 'task', name: 'Task' },
  { id: 'read', name: 'Reading note' },
];

describe('ClipPicker', () => {
  const onDecide = vi.fn();
  const onCancel = vi.fn();

  const show = () => {
    render(<ClipPicker />);
    act(() => {
      openClipPicker({ templates: TEMPLATES, onDecide, onCancel });
    });
  };
  const options = () => screen.getAllByRole('option');

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    onDecide.mockReset();
    onCancel.mockReset();
  });

  afterEach(() => {
    act(() => getActivePicker()?.destroy());
    cleanup();
    vi.useRealTimers();
  });

  it('is nothing until a panel is opened', () => {
    render(<ClipPicker />);
    expect(document.querySelector('[data-clip-picker]')).toBeNull();
  });

  it('lists the templates as a listbox, numbered, the default first and selected', () => {
    show();
    expect(screen.getByRole('listbox', { name: 'Template' })).toBeTruthy();
    expect(options().map((o) => o.textContent)).toEqual(['1Clip', '2Task', '3Reading note']);
    expect(options().map((o) => o.getAttribute('aria-selected'))).toEqual(['true', 'false', 'false']);
    const list = screen.getByRole('listbox');
    expect(list.getAttribute('aria-activedescendant')).toBe(options()[0].id);
  });

  it('has a countdown bar, and a note field', () => {
    show();
    expect(document.querySelector('[data-clip-picker-progress]')).not.toBeNull();
    expect(screen.getByRole('textbox', { name: 'Note' })).toBeTruthy();
  });

  it('takes the focus when it opens, and gives it back when it closes', () => {
    const outside = document.createElement('button');
    document.body.append(outside);
    outside.focus();
    show();
    expect(document.activeElement).toBe(screen.getByRole('listbox'));
    act(() => getActivePicker()!.cancel());
    expect(document.activeElement).toBe(outside);
    outside.remove();
  });

  it('stops the countdown, and the bar goes, when the pointer is over it', () => {
    show();
    fireEvent.pointerEnter(document.querySelector('[data-clip-picker]')!);
    expect(document.querySelector('[data-clip-picker-progress]')).toBeNull();
    act(() => {
      vi.advanceTimersByTime(PICKER_MS * 3);
    });
    expect(onDecide).not.toHaveBeenCalled();
  });

  it('moves the highlight with the arrow keys, and Enter saves it', () => {
    show();
    const list = screen.getByRole('listbox');
    fireEvent.keyDown(list, { key: 'ArrowDown' });
    expect(options().map((o) => o.getAttribute('aria-selected'))).toEqual(['false', 'true', 'false']);
    expect(document.querySelector('[data-clip-picker-progress]')).toBeNull();
    fireEvent.keyDown(list, { key: 'Enter' });
    expect(onDecide).toHaveBeenCalledExactlyOnceWith({ templateId: 'task', note: '' });
    expect(document.querySelector('[data-clip-picker]')).toBeNull();
  });

  it('picks with a digit, and cancels with Escape', () => {
    show();
    fireEvent.keyDown(screen.getByRole('listbox'), { key: '3' });
    expect(onDecide).toHaveBeenCalledExactlyOnceWith({ templateId: 'read', note: '' });

    act(() => {
      openClipPicker({ templates: TEMPLATES, onDecide, onCancel });
    });
    fireEvent.keyDown(screen.getByRole('listbox'), { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onDecide).toHaveBeenCalledTimes(1);
  });

  it('picks with a click', () => {
    show();
    fireEvent.click(options()[1]);
    expect(onDecide).toHaveBeenCalledExactlyOnceWith({ templateId: 'task', note: '' });
  });

  describe('the note field', () => {
    it('stops the countdown when it takes focus', () => {
      show();
      fireEvent.focus(screen.getByRole('textbox'));
      expect(getActivePicker()!.getView().counting).toBe(false);
    });

    it('keeps what is typed, and Enter saves it with the highlighted template', () => {
      show();
      const note = screen.getByRole('textbox');
      fireEvent.change(note, { target: { value: 'a thought' } });
      expect((note as HTMLTextAreaElement).value).toBe('a thought');
      fireEvent.keyDown(note, { key: 'Enter' });
      expect(onDecide).toHaveBeenCalledExactlyOnceWith({ templateId: 'clip', note: 'a thought' });
    });

    it('takes Shift+Enter as a new line: no save', () => {
      show();
      const note = screen.getByRole('textbox');
      const event = new KeyboardEvent('keydown', {
        key: 'Enter',
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      });
      act(() => {
        note.dispatchEvent(event);
      });
      expect(event.defaultPrevented).toBe(false);
      expect(onDecide).not.toHaveBeenCalled();
    });

    it('a digit typed there is text, not a pick', () => {
      show();
      const note = screen.getByRole('textbox');
      fireEvent.keyDown(note, { key: '2' });
      expect(onDecide).not.toHaveBeenCalled();
    });

    it('keeps its keys from the page’s hotkeys', () => {
      show();
      const seen = vi.fn();
      document.body.addEventListener('keydown', seen);
      fireEvent.keyDown(screen.getByRole('textbox'), { key: 'j' });
      document.body.removeEventListener('keydown', seen);
      expect(seen).not.toHaveBeenCalled();
    });
  });
});

describe('ClipPicker untitled template', () => {
  afterEach(() => {
    act(() => getActivePicker()?.destroy());
    cleanup();
  });

  it('names a template without a name "Untitled"', () => {
    render(<ClipPicker />);
    act(() => {
      openClipPicker({
        templates: [{ id: 'blank', name: '' }, ...TEMPLATES],
        onDecide: vi.fn(),
        onCancel: vi.fn(),
      });
    });
    expect(screen.getByText('Untitled')).toBeTruthy();
  });
});
