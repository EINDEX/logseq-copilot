import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { fakeBrowser } from 'wxt/testing';
import { recallRulesConfig } from '@/utils/storage';
import { useRecallRules } from './use-recall-rules';

// Storage rejects with something that is not an Error: the hook has its own
// words for that.
const FAILURE = 'storage is gone';

type Hook = ReturnType<typeof useRecallRules>;

const mount = async () => {
  const hook = renderHook(() => useRecallRules());
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  return hook;
};

describe('useRecallRules errors', () => {
  beforeEach(() => {
    fakeBrowser.reset();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'debug').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('says it could not load the recall rules', async () => {
    vi.spyOn(recallRulesConfig, 'getValue').mockRejectedValue(FAILURE);
    const { result } = await mount();
    expect(result.current.error).toBe('Failed to load recall rules');
  });

  it('keeps the message of an Error when loading fails', async () => {
    vi.spyOn(recallRulesConfig, 'getValue').mockRejectedValue(new Error('quota'));
    const { result } = await mount();
    expect(result.current.error).toBe('quota');
  });

  it.each([
    ['addRecallRule', (r: Hook) => r.addRecallRule({ name: 'x' } as never), 'Failed to add recall rule'],
    ['updateRecallRule', (r: Hook) => r.updateRecallRule('default-spa', { name: 'y' }), 'Failed to update recall rule'],
    ['deleteRecallRule', (r: Hook) => r.deleteRecallRule('default-spa'), 'Failed to delete recall rule'],
    ['reorderRules', (r: Hook) => r.reorderRules([]), 'Failed to reorder recall rules'],
  ])('%s says why it failed', async (_name, run, message) => {
    const { result } = await mount();

    // Not an Error: the hook's own words.
    vi.spyOn(recallRulesConfig, 'getValue').mockRejectedValue(FAILURE);
    vi.spyOn(recallRulesConfig, 'setValue').mockRejectedValue(FAILURE);
    await act(() => run(result.current));
    expect(result.current.error).toBe(message);

    // An Error: its own message.
    vi.spyOn(recallRulesConfig, 'getValue').mockRejectedValue(new Error('quota'));
    vi.spyOn(recallRulesConfig, 'setValue').mockRejectedValue(new Error('quota'));
    await act(() => run(result.current));
    expect(result.current.error).toBe('quota');
  });
});
