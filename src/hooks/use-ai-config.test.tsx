import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { fakeBrowser } from 'wxt/testing';
import { aiConfig } from '@/utils/storage';
import { useAIConfig } from './use-ai-config';

// Storage rejects with something that is not an Error: the hook has its own
// words for that.
const FAILURE = 'storage is gone';

const mount = async () => {
  const hook = renderHook(() => useAIConfig());
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  return hook;
};

describe('useAIConfig errors', () => {
  beforeEach(() => {
    fakeBrowser.reset();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'debug').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('says it could not load the AI config', async () => {
    vi.spyOn(aiConfig, 'getValue').mockRejectedValue(FAILURE);
    const { result } = await mount();
    expect(result.current.error).toBe('Failed to load AI config');
  });

  it('keeps the message of an Error', async () => {
    vi.spyOn(aiConfig, 'getValue').mockRejectedValue(new Error('quota'));
    const { result } = await mount();
    expect(result.current.error).toBe('quota');
  });

  it.each([
    ['updateConfig', (r: ReturnType<typeof useAIConfig>) => r.updateConfig({ enabled: true }), 'Failed to update AI config'],
    [
      'addProvider',
      (r: ReturnType<typeof useAIConfig>) =>
        r.addProvider({ name: 'p' } as never),
      'Failed to add provider',
    ],
    ['updateProvider', (r: ReturnType<typeof useAIConfig>) => r.updateProvider('p', { name: 'q' }), 'Failed to update provider'],
    ['deleteProvider', (r: ReturnType<typeof useAIConfig>) => r.deleteProvider('p'), 'Failed to delete provider'],
    ['reorderProviders', (r: ReturnType<typeof useAIConfig>) => r.reorderProviders([]), 'Failed to reorder providers'],
  ])('%s says why it failed', async (_name, run, message) => {
    const { result } = await mount();

    // Not an Error: the hook's own words.
    vi.spyOn(aiConfig, 'getValue').mockRejectedValue(FAILURE);
    await act(() => run(result.current));
    expect(result.current.error).toBe(message);

    // An Error: its own message.
    vi.spyOn(aiConfig, 'getValue').mockRejectedValue(new Error('quota'));
    await act(() => run(result.current));
    expect(result.current.error).toBe('quota');
  });
});
