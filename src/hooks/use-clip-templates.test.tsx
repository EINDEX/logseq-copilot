import { beforeEach, describe, expect, it } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { fakeBrowser } from 'wxt/testing';
import { defaultTemplateIdItem, templates } from '@/utils/storage';
import { defaultFirst, ruledTemplateId, useClipTemplates } from './use-clip-templates';

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

describe('defaultFirst with page rules', () => {
  const RULED = [
    { id: 'a', name: 'Alpha', content: 'x' },
    { id: 'b', name: 'Beta', content: 'x', rules: ['example.com'] },
    { id: 'c', name: 'Gamma', content: 'x', rules: ['*.example.com'] },
  ];

  it('puts the rule winner first, marked, then the default and the others', () => {
    expect(defaultFirst(RULED, null, 'https://example.com/p')).toEqual([
      { id: 'b', name: 'Beta', ruled: true },
      { id: 'a', name: 'Alpha' },
      { id: 'c', name: 'Gamma' },
    ]);
    expect(ruledTemplateId(defaultFirst(RULED, 'c', 'https://x.example.com/'))).toBe('c');
  });

  it('is as before on a page no rule matches: the default first, none marked', () => {
    const list = defaultFirst(RULED, 'c', 'https://other.com/');
    expect(list.map((t) => t.id)).toEqual(['c', 'a', 'b']);
    expect(ruledTemplateId(list)).toBeUndefined();
    expect(defaultFirst(RULED, null, null)[0]).toEqual({ id: 'a', name: 'Alpha' });
  });

  it('names no template for the main buttons when the default is the winner by no rule', () => {
    expect(ruledTemplateId([])).toBeUndefined();
  });

  it('follows the page in the hook', async () => {
    fakeBrowser.reset();
    await templates.setValue(RULED);
    const { result, rerender } = renderHook(({ url }) => useClipTemplates(url), {
      initialProps: { url: 'https://example.com/' as string | null },
    });
    await waitFor(() => expect(result.current.map((t) => t.id)).toEqual(['b', 'a', 'c']));
    expect(ruledTemplateId(result.current)).toBe('b');
    rerender({ url: 'https://other.com/' });
    await waitFor(() => expect(result.current.map((t) => t.id)).toEqual(['a', 'b', 'c']));
    expect(ruledTemplateId(result.current)).toBeUndefined();
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
