import { describe, expect, it, vi } from 'vitest';
import { gitBlobId } from './git-binary-patch';
import { createFileImageStore, FILE_GRAPH_IMAGE_LIMIT } from './image-store';

const image = (bytes = new Uint8Array([1, 2, 3])) => ({ bytes, ext: 'png', name: 'cat' });

/** A file graph client: writes go to `files`, git hash-object reads them back. */
const fakeClient = (written = async (bytes: Uint8Array) => gitBlobId(bytes)) => {
  const calls: string[] = [];
  let lastImage = new Uint8Array();
  return {
    calls,
    client: {
      writePluginStorageFile: vi.fn(async (_id: string, _file: string, content: string) => {
        calls.push(content ? 'write patch' : 'clear patch');
        return '/home/.logseq/storages/logseq-copilot/image.patch';
      }),
      execGitCommand: vi.fn(async (args: string[]) => {
        calls.push(args[0]);
        if (args[0] === 'apply') lastImage = image().bytes;
        return args[0] === 'hash-object' ? `${await written(lastImage)}\n` : '';
      }),
    },
  };
};

describe('createFileImageStore', () => {
  it.each([
    ['a path in the name', { name: '../../.git/hooks/x', ext: 'png' }],
    ['a git option as name', { name: '--exec=x y', ext: 'png' }],
    ['a newline in the name (patch header)', { name: 'a\nb', ext: 'png' }],
    ['an extension with a path', { name: 'a', ext: 'png/../../x' }],
  ])('refuses %s: nothing is written, no git command runs', async (_, file) => {
    const { client } = fakeClient();
    await expect(
      createFileImageStore(client).saveImageAsset({ bytes: new Uint8Array([1]), ...file }, ''),
    ).rejects.toThrow();
    expect(client.writePluginStorageFile).not.toHaveBeenCalled();
    expect(client.execGitCommand).not.toHaveBeenCalled();
  });

  it('writes the image as a patch, applies it, checks it and clears the patch', async () => {
    const { client, calls } = fakeClient();
    const store = createFileImageStore(client);
    const ref = await store.saveImageAsset(image(), 'a cat');

    expect(calls).toEqual(['write patch', 'apply', 'clear patch', 'hash-object']);
    expect(client.writePluginStorageFile.mock.calls[0].slice(0, 2)).toEqual([
      'logseq-copilot',
      'image.patch',
    ]);
    expect(client.execGitCommand.mock.calls[0][0]).toEqual([
      'apply',
      '/home/.logseq/storages/logseq-copilot/image.patch',
    ]);
    const file = client.execGitCommand.mock.calls[1][0][1];
    expect(file).toMatch(/^assets\/cat_\d+_[a-z0-9]+\.png$/);
    expect(ref).toEqual({ kind: 'path', path: `../${file}` });
    expect(store.imageAssetLimit).toBe(FILE_GRAPH_IMAGE_LIMIT);
  });

  it('fails when the file git finds is not the image', async () => {
    const { client } = fakeClient(async () => '0'.repeat(40));
    await expect(createFileImageStore(client).saveImageAsset(image(), '')).rejects.toThrow(
      'Logseq did not write the image.',
    );
  });

  it('runs git again when it fails at first: the git init Logseq starts with it is not done yet', async () => {
    const { client, calls } = fakeClient();
    const refused = () => new Error('Logseq refused exec_git_command: {"error":"fatal: not a git repository"}');
    client.execGitCommand.mockRejectedValueOnce(refused()).mockRejectedValueOnce(refused());
    const ref = await createFileImageStore(client, { retryMs: 0 }).saveImageAsset(image(), '');

    expect(ref.kind).toBe('path');
    expect(calls).toEqual(['write patch', 'apply', 'clear patch', 'hash-object']);
    expect(client.execGitCommand.mock.calls.map(([args]) => args[0])).toEqual([
      'apply', 'apply', 'apply', 'hash-object',
    ]);
  });

  it('clears the patch and fails when git apply keeps failing', async () => {
    const { client, calls } = fakeClient();
    client.execGitCommand.mockRejectedValue(new Error('Logseq refused exec_git_command'));
    await expect(
      createFileImageStore(client, { retryMs: 0 }).saveImageAsset(image(), ''),
    ).rejects.toThrow('Logseq refused exec_git_command');
    expect(client.execGitCommand).toHaveBeenCalledTimes(3);
    expect(calls).toEqual(['write patch', 'clear patch']);
  });

  it('refuses an image whose request would be too large for the API', async () => {
    const { client } = fakeClient();
    const big = new Uint8Array(900_000).map(() => Math.floor(Math.random() * 256));
    await expect(createFileImageStore(client).saveImageAsset(image(big), '')).rejects.toThrow(
      'The image is too large.',
    );
    expect(client.writePluginStorageFile).not.toHaveBeenCalled();
  });

  it('writes one image at a time: they share the patch file', async () => {
    const { client, calls } = fakeClient();
    const store = createFileImageStore(client);
    await Promise.all([store.saveImageAsset(image(), ''), store.saveImageAsset(image(), '')]);
    expect(calls).toEqual([
      'write patch', 'apply', 'clear patch', 'hash-object',
      'write patch', 'apply', 'clear patch', 'hash-object',
    ]);
  });
});
