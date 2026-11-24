import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing';
import { templates } from '@/utils/storage';
import { clipToLogseq } from './clip';

const client = {
  getUserConfig: vi.fn(async () => ({ preferredDateFormat: 'yyyy-MM-dd' })),
  getCurrentPage: vi.fn(async () => null),
  appendBlock: vi.fn(async () => ({})),
};
const clipBlocks = vi.fn(async () => ({ rootUuid: 'root-1', children: 0, added: true }));

vi.mock('./logseq/tool', () => ({
  getLogseqService: async () => ({
    client,
    clipBlocks,
    getGraph: async () => 'test graph',
    imageAssetLimit: 1_000_000,
    saveImageAsset: vi.fn(),
  }),
}));

describe('clipToLogseq errors', () => {
  beforeEach(() => {
    fakeBrowser.reset();
    vi.clearAllMocks();
  });

  it('says there is no clip template to clip with', async () => {
    await templates.setValue([]);
    await expect(clipToLogseq({ data: 'x', templateId: 'gone' })).rejects.toThrow(
      'No clip template found. Add one in the extension settings.',
    );
    expect(clipBlocks).not.toHaveBeenCalled();
  });

  it('says the template made no block to clip', async () => {
    await templates.setValue([{ id: 'blank', name: 'Blank', content: '- ' }]);
    await expect(clipToLogseq({ data: 'x', templateId: 'blank' })).rejects.toThrow(
      'The template made no block to clip. Check it in the extension settings.',
    );
    expect(clipBlocks).not.toHaveBeenCalled();
  });
});
