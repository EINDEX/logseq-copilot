import { beforeEach, describe, expect, it } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { fakeBrowser } from 'wxt/testing';
import { templates } from '@/utils/storage';
import { useTemplates } from './use-templates';

describe('useTemplates deleteTemplate', () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });

  it('deletes a template', async () => {
    const { result } = renderHook(() => useTemplates());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(() => result.current.deleteTemplate('task'));

    expect((await templates.getValue()).map((t) => t.id)).toEqual(['default']);
  });

  it('keeps the last template', async () => {
    await templates.setValue([{ id: 'only', name: 'Only', content: 'x' }]);
    const { result } = renderHook(() => useTemplates());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(() => result.current.deleteTemplate('only'));

    expect((await templates.getValue()).map((t) => t.id)).toEqual(['only']);
  });
});
