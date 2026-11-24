import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { fakeBrowser } from 'wxt/testing';
import { templates } from '@/utils/storage';
import { useTemplates } from './use-templates';

// Storage rejects with something that is not an Error: the hook has its own
// words for that.
const FAILURE = 'storage is gone';

type Hook = ReturnType<typeof useTemplates>;

const mount = async () => {
  const hook = renderHook(() => useTemplates());
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  return hook;
};

describe('useTemplates errors', () => {
  beforeEach(() => {
    fakeBrowser.reset();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'debug').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('says it could not load the templates', async () => {
    vi.spyOn(templates, 'getValue').mockRejectedValue(FAILURE);
    const { result } = await mount();
    expect(result.current.error).toBe('Failed to load templates');
  });

  it('keeps the message of an Error when loading fails', async () => {
    vi.spyOn(templates, 'getValue').mockRejectedValue(new Error('quota'));
    const { result } = await mount();
    expect(result.current.error).toBe('quota');
  });

  it.each([
    ['addTemplate', (r: Hook) => r.addTemplate({ name: 'x', content: 'y' } as never), 'Failed to add template'],
    ['updateTemplate', (r: Hook) => r.updateTemplate('default', { name: 'z' }), 'Failed to update template'],
    ['deleteTemplate', (r: Hook) => r.deleteTemplate('task'), 'Failed to delete template'],
    ['reorderTemplates', (r: Hook) => r.reorderTemplates([]), 'Failed to reorder templates'],
  ])('%s says why it failed', async (_name, run, message) => {
    const { result } = await mount();

    // Not an Error: the hook's own words.
    vi.spyOn(templates, 'getValue').mockRejectedValue(FAILURE);
    vi.spyOn(templates, 'setValue').mockRejectedValue(FAILURE);
    await act(() => run(result.current));
    expect(result.current.error).toBe(message);

    // An Error: its own message.
    vi.spyOn(templates, 'getValue').mockRejectedValue(new Error('quota'));
    vi.spyOn(templates, 'setValue').mockRejectedValue(new Error('quota'));
    await act(() => run(result.current));
    expect(result.current.error).toBe('quota');
  });
});
