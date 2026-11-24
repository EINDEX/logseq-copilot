import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, renderHook, waitFor } from '@testing-library/react';

const sendMessage = vi.hoisted(() => vi.fn());
vi.mock('@/types/messaging', () => ({ sendMessage }));

import { usePageRecall } from './use-page-recall';

const recallFor = async (url: string) => {
  const hook = renderHook(() => usePageRecall(url));
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  return hook.result;
};

describe('usePageRecall fallback messages', () => {
  beforeEach(() => {
    sendMessage.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("says it couldn't search when the answer has no message", async () => {
    sendMessage.mockResolvedValue({ status: 500, msg: '', response: undefined });
    const result = await recallFor('https://example.com/');
    expect(result.current.error).toBe("Couldn't search Logseq");
    expect(result.current.result).toBeNull();
  });

  it("says it couldn't search when it throws something that is not an Error", async () => {
    sendMessage.mockRejectedValue('gone');
    const result = await recallFor('https://example.com/');
    expect(result.current.error).toBe("Couldn't search Logseq");
  });

  it("says it couldn't search when it throws an Error without a message", async () => {
    sendMessage.mockRejectedValue(new Error(''));
    const result = await recallFor('https://example.com/');
    expect(result.current.error).toBe("Couldn't search Logseq");
  });
});
