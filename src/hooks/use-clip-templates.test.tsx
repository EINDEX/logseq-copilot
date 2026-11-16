import { beforeEach, describe, expect, it } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { fakeBrowser } from 'wxt/testing';
import { defaultTemplateIdItem, templates } from '@/utils/storage';
import { defaultFirst, useClipTemplates } from './use-clip-templates';

const LIST = [
  { id: 'a', name: 'Alpha', content: 'x' },
  { id: 'b', name: 'Beta', content: 'x' },
  { id: 'c', name: 'Gamma', content: 'x' },
];

describe('defaultFirst', () => {
  it('keeps the order of the settings until the user chooses a default', () => {
    expect(defaultFirst(LIST, null).map((t) => t.id)).toEqual(['a', 'b', 'c']);
  });

  it('puts the default first, the others in order', () => {
    expect(defaultFirst(LIST, 'c').map((t) => t.id)).toEqual(['c', 'a', 'b']);
  });

  it('falls back to the first template for a default that is gone', () => {
    expect(defaultFirst(LIST, 'gone').map((t) => t.id)).toEqual(['a', 'b', 'c']);
  });

  it('gives only what the buttons need', () => {
    expect(defaultFirst(LIST, null)[0]).toEqual({ id: 'a', name: 'Alpha' });
  });
});

describe('useClipTemplates', () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });

  it('follows the templates and the default', async () => {
    await templates.setValue(LIST);
    const { result } = renderHook(() => useClipTemplates());
    await waitFor(() => expect(result.current.map((t) => t.id)).toEqual(['a', 'b', 'c']));

    await act(async () => {
      await defaultTemplateIdItem.setValue('b');
    });
    await waitFor(() => expect(result.current.map((t) => t.id)).toEqual(['b', 'a', 'c']));

    await act(async () => {
      await templates.setValue(LIST.filter((t) => t.id !== 'b'));
    });
    await waitFor(() => expect(result.current.map((t) => t.id)).toEqual(['a', 'c']));
  });
});
