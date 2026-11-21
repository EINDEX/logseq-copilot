import { describe, expect, it, vi } from 'vitest';
import LogseqClient from './client';

/** Saved blocks must never open in edit mode, so every insert passes focus: false. */
describe('db graph client block inserts', () => {
  const clientWithSpy = () => {
    const client = new LogseqClient();
    const baseJson = vi.spyOn(client, 'baseJson').mockResolvedValue({});
    return { client, baseJson };
  };

  it('appendBlock passes focus: false', async () => {
    const { client, baseJson } = clientWithSpy();
    await client.appendBlock('Page', 'content');
    expect(baseJson).toHaveBeenCalledWith('logseq.Editor.appendBlockInPage', [
      'Page',
      'content',
      { focus: false },
    ]);
  });

  it('insertChildBlock passes focus: false', async () => {
    const { client, baseJson } = clientWithSpy();
    await client.insertChildBlock('uuid-1', 'content');
    expect(baseJson).toHaveBeenCalledWith('logseq.Editor.insertBlock', [
      'uuid-1',
      'content',
      { sibling: false, focus: false },
    ]);
  });
});
