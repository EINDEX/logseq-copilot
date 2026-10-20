import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { caretRangeAtPoint } from './caret';

const API = ['caretPositionFromPoint', 'caretRangeFromPoint'] as const;

const setApi = (name: (typeof API)[number], value: unknown) =>
  Object.defineProperty(document, name, { configurable: true, value });

describe('caretRangeAtPoint', () => {
  let text: Text;

  beforeEach(() => {
    document.body.innerHTML = '<p id="p">hello world</p>';
    text = document.getElementById('p')!.firstChild as Text;
    for (const name of API) setApi(name, undefined);
  });

  afterEach(() => {
    for (const name of API) delete (document as any)[name];
  });

  it('builds a collapsed range from caretPositionFromPoint (Firefox)', () => {
    const fromPosition = vi.fn(() => ({ offsetNode: text, offset: 3 }));
    setApi('caretPositionFromPoint', fromPosition);

    const range = caretRangeAtPoint(10, 20);

    expect(fromPosition).toHaveBeenCalledWith(10, 20);
    expect(range).not.toBeNull();
    expect(range!.collapsed).toBe(true);
    expect(range!.startContainer).toBe(text);
    expect(range!.startOffset).toBe(3);
  });

  it('prefers caretPositionFromPoint when both exist', () => {
    const legacy = vi.fn();
    setApi('caretPositionFromPoint', () => ({ offsetNode: text, offset: 1 }));
    setApi('caretRangeFromPoint', legacy);

    expect(caretRangeAtPoint(1, 2)!.startOffset).toBe(1);
    expect(legacy).not.toHaveBeenCalled();
  });

  it('falls back to caretRangeFromPoint (older Chromium)', () => {
    const expected = document.createRange();
    expected.setStart(text, 5);
    const legacy = vi.fn(() => expected);
    setApi('caretRangeFromPoint', legacy);

    expect(caretRangeAtPoint(4, 5)).toBe(expected);
    expect(legacy).toHaveBeenCalledWith(4, 5);
  });

  it('returns null when there is no caret position at the point', () => {
    setApi('caretPositionFromPoint', () => null);
    expect(caretRangeAtPoint(0, 0)).toBeNull();
  });

  it('returns null without throwing when neither API exists', () => {
    expect(caretRangeAtPoint(0, 0)).toBeNull();
  });

  it('returns null without throwing when the API throws', () => {
    setApi('caretPositionFromPoint', () => {
      throw new Error('boom');
    });
    expect(caretRangeAtPoint(0, 0)).toBeNull();
  });
});
