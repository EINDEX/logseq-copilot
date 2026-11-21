import { describe, expect, it, vi } from 'vitest';
import crypto from 'node:crypto';
import { assetTitle, createDbImageStore, DB_GRAPH_IMAGE_LIMIT } from './image-store';

const CLASS_UUID = '00000002-7975-0297-0000-000000000000';
const image = (bytes = new Uint8Array([1, 2, 3])) => ({ bytes, ext: 'png', name: 'cat' });
const sha256 = (bytes: Uint8Array) => crypto.createHash('sha256').update(bytes).digest('hex');

const fakeClient = ({ existing }: { existing?: string } = {}) => {
  const calls: string[] = [];
  const client = {
    calls,
    queryUuid: vi.fn(async (query: string) =>
      query.includes('asset/checksum') ? existing : CLASS_UUID,
    ),
    insertBlockWithProperties: vi.fn(
      async (_parent: string, _content: string, _uuid: string, _properties: Record<string, string | number>) => {
        calls.push('insert');
        return {};
      },
    ),
    addBlockTag: vi.fn(async (_uuid: string, _tag: string): Promise<unknown> => {
      calls.push('tag');
      return null;
    }),
    removeBlock: vi.fn(async (_uuid: string): Promise<unknown> => {
      calls.push('remove');
      return null;
    }),
    writeAssetsdirFile: vi.fn(async (file: string, _bytes: Uint8Array) => {
      calls.push('write');
      return `/graph/assets/${file}`;
    }),
    getBlockViaUuid: vi.fn(async (uuid: string) => ({ uuid })),
  };
  return client;
};

describe('createDbImageStore', () => {
  it('makes the Asset below the Asset tag, then writes the file under its uuid', async () => {
    const client = fakeClient();
    const store = createDbImageStore(client);
    const ref = await store.saveImageAsset(image(), 'a [cat]');

    expect(ref.kind).toBe('ref');
    const uuid = (ref as { uuid: string }).uuid;
    expect(client.insertBlockWithProperties).toHaveBeenCalledWith(CLASS_UUID, 'a cat', uuid, {
      'logseq.property.asset/type': 'png',
      'logseq.property.asset/size': 3,
      'logseq.property.asset/checksum': sha256(image().bytes),
    });
    expect(client.addBlockTag).toHaveBeenCalledWith(uuid, CLASS_UUID);
    expect(client.writeAssetsdirFile).toHaveBeenCalledWith(`${uuid}.png`, image().bytes);
    // The properties before the tag, the node before the file.
    expect(client.calls).toEqual(['insert', 'tag', 'write']);
    expect(client.removeBlock).not.toHaveBeenCalled();
    expect(store.imageAssetLimit).toBe(DB_GRAPH_IMAGE_LIMIT);
  });

  it('refuses a file name it did not make: nothing is written', async () => {
    const client = fakeClient();
    await expect(
      createDbImageStore(client).saveImageAsset({ bytes: new Uint8Array([1]), ext: '../x', name: 'a' }, ''),
    ).rejects.toThrow();
    expect(client.writeAssetsdirFile).not.toHaveBeenCalled();
    expect(client.insertBlockWithProperties).not.toHaveBeenCalled();
  });

  it('uses the Asset the graph has for the same file (Logseq keeps one)', async () => {
    const client = fakeClient({ existing: 'aaaaaaaa-0000-4000-8000-000000000000' });
    expect(await createDbImageStore(client).saveImageAsset(image(), '')).toEqual({
      kind: 'ref',
      uuid: 'aaaaaaaa-0000-4000-8000-000000000000',
    });
    expect(client.writeAssetsdirFile).not.toHaveBeenCalled();
    expect(client.insertBlockWithProperties).not.toHaveBeenCalled();
  });

  it('fails when Logseq did not make the Asset: no file, what it made is removed', async () => {
    const client = fakeClient();
    client.getBlockViaUuid.mockResolvedValueOnce(null as never);
    await expect(createDbImageStore(client).saveImageAsset(image(), '')).rejects.toThrow(
      'Logseq did not make the Asset.',
    );
    expect(client.writeAssetsdirFile).not.toHaveBeenCalled();
    expect(client.removeBlock).toHaveBeenCalledWith(client.insertBlockWithProperties.mock.calls[0][2]);
  });

  it('removes the block when Logseq refuses its properties or the tag: no file', async () => {
    for (const step of ['insertBlockWithProperties', 'addBlockTag'] as const) {
      const client = fakeClient();
      client[step].mockRejectedValueOnce(new Error('refused'));
      await expect(createDbImageStore(client).saveImageAsset(image(), '')).rejects.toThrow('refused');
      expect(client.writeAssetsdirFile).not.toHaveBeenCalled();
      expect(client.removeBlock).toHaveBeenCalledTimes(1);
      expect(client.removeBlock).toHaveBeenCalledWith(client.insertBlockWithProperties.mock.calls[0][2]);
    }
  });

  it('removes the Asset when the file is not written, and fails with that error', async () => {
    const client = fakeClient();
    client.writeAssetsdirFile.mockImplementationOnce(async () => {
      client.calls.push('write');
      throw new Error('disk full');
    });
    client.removeBlock.mockImplementationOnce(async () => {
      client.calls.push('remove');
      throw new Error('gone');
    });
    await expect(createDbImageStore(client).saveImageAsset(image(), '')).rejects.toThrow('disk full');
    expect(client.calls).toEqual(['insert', 'tag', 'write', 'remove']);
    expect(client.removeBlock).toHaveBeenCalledWith(client.insertBlockWithProperties.mock.calls[0][2]);
  });

  it('touches nothing when the graph has no Asset tag', async () => {
    const client = fakeClient();
    client.queryUuid.mockResolvedValue(undefined);
    await expect(createDbImageStore(client).saveImageAsset(image(), '')).rejects.toThrow(
      'The graph has no Asset tag.',
    );
    expect(client.calls).toEqual([]);
  });

  it('refuses an image whose request would be too large for the API', async () => {
    const client = fakeClient();
    const big = new Uint8Array(300_000).fill(255);
    await expect(createDbImageStore(client).saveImageAsset(image(big), '')).rejects.toThrow(
      'The image is too large.',
    );
    expect(client.writeAssetsdirFile).not.toHaveBeenCalled();
  });
});

describe('assetTitle', () => {
  it('names the Asset after the alt text, without references, tags, math or code, else the file', () => {
    expect(assetTitle('see [[Page]] #tag (x)', image())).toBe('see Page tag x');
    expect(assetTitle('# $$x$$ `c`', image())).toBe('x c');
    expect(assetTitle(' [ ] ', image())).toBe('cat');
  });

  it('keeps any other alt text as it is, on one line', () => {
    expect(assetTitle('赛博朋克：边缘行者背景图', image())).toBe('赛博朋克：边缘行者背景图');
    expect(assetTitle('~:logseq.class/Tag\n^ a:: b', image())).toBe('~:logseq.class/Tag ^ a:: b');
  });
});
