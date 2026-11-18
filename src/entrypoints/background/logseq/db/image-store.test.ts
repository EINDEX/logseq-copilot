import { describe, expect, it, vi } from 'vitest';
import crypto from 'node:crypto';
import { assetEdn, assetTitle, createDbImageStore, DB_GRAPH_IMAGE_LIMIT } from './image-store';

const CLASS_UUID = '00000002-7975-0297-0000-000000000000';
const image = (bytes = new Uint8Array([1, 2, 3])) => ({ bytes, ext: 'png', name: 'cat' });
const sha256 = (bytes: Uint8Array) => crypto.createHash('sha256').update(bytes).digest('hex');

const fakeClient = ({ existing }: { existing?: string } = {}) => {
  const client = {
    queryUuid: vi.fn(async (query: string) =>
      query.includes('asset/checksum') ? existing : CLASS_UUID,
    ),
    writeAssetsdirFile: vi.fn(async (file: string, _bytes: Uint8Array) => `/graph/assets/${file}`),
    importEdn: vi.fn(async (_transit: string) => {}),
    getBlockViaUuid: vi.fn(async (uuid: string) => ({ uuid })),
  };
  return client;
};

describe('createDbImageStore', () => {
  it('writes the file under the Asset uuid and makes the Asset below the Asset tag', async () => {
    const client = fakeClient();
    const store = createDbImageStore(client);
    const ref = await store.saveImageAsset(image(), 'a [cat]');

    expect(ref.kind).toBe('ref');
    const uuid = (ref as { uuid: string }).uuid;
    expect(client.writeAssetsdirFile).toHaveBeenCalledWith(`${uuid}.png`, image().bytes);
    expect(JSON.parse(client.importEdn.mock.calls[0][0])).toEqual(
      JSON.parse(
        assetEdn({
          classUuid: CLASS_UUID,
          uuid,
          title: 'a cat',
          ext: 'png',
          size: 3,
          checksum: sha256(image().bytes),
        }),
      ),
    );
    expect(store.imageAssetLimit).toBe(DB_GRAPH_IMAGE_LIMIT);
  });

  it('refuses a file name it did not make: nothing is written', async () => {
    const client = fakeClient();
    await expect(
      createDbImageStore(client).saveImageAsset({ bytes: new Uint8Array([1]), ext: '../x', name: 'a' }, ''),
    ).rejects.toThrow();
    expect(client.writeAssetsdirFile).not.toHaveBeenCalled();
    expect(client.importEdn).not.toHaveBeenCalled();
  });

  it('writes a page-controlled alt text into the EDN as a plain string', async () => {
    const client = fakeClient();
    for (const alt of ['~:logseq.class/Tag', '^ ', '~#set', '`x', '"] [:db/retract 1']) {
      await createDbImageStore(client).saveImageAsset(image(), alt);
      const edn = JSON.parse(client.importEdn.mock.calls.at(-1)![0]);
      const block = edn[2][0][4][0];
      const title = block[block.indexOf('~:block/title') + 1];
      // Transit reads a string that starts with ~ ^ ` as a tag: it gets a ~ in front.
      const plain = assetTitle(alt, image());
      expect(title).toBe(/^[~^`]/.test(plain) ? `~${plain}` : plain);
    }
  });

  it('uses the Asset the graph has for the same file (Logseq keeps one)', async () => {
    const client = fakeClient({ existing: 'aaaaaaaa-0000-4000-8000-000000000000' });
    expect(await createDbImageStore(client).saveImageAsset(image(), '')).toEqual({
      kind: 'ref',
      uuid: 'aaaaaaaa-0000-4000-8000-000000000000',
    });
    expect(client.writeAssetsdirFile).not.toHaveBeenCalled();
    expect(client.importEdn).not.toHaveBeenCalled();
  });

  it('fails when Logseq did not make the Asset', async () => {
    const client = fakeClient();
    client.getBlockViaUuid.mockResolvedValueOnce(null as never);
    await expect(createDbImageStore(client).saveImageAsset(image(), '')).rejects.toThrow(
      'Logseq did not make the Asset.',
    );
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

describe('assetEdn and assetTitle', () => {
  it('escapes strings that start with a transit mark', () => {
    const edn = JSON.parse(
      assetEdn({ classUuid: 'c', uuid: 'u', title: '~tilde', ext: 'png', size: 1, checksum: 'x' }),
    );
    expect(JSON.stringify(edn)).toContain('"~~tilde"');
  });

  it('names the Asset after the alt text, without references or tags, else the file', () => {
    expect(assetTitle('see [[Page]] #tag (x)', image())).toBe('see Page tag x');
    expect(assetTitle(' [ ] ', image())).toBe('cat');
  });
});
