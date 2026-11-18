import { assertStorableImage, type AssetRef, type ImageAssetStore, type ImageFile } from '../image-assets';
import { gitBinaryPatch } from './git-binary-patch';

/**
 * The API server takes a request body of 1 MiB at most (fastify's default,
 * 413 above it; probed on 0.10.15). A patch is about 1.3 times the size of an
 * image that does not compress, so 760 KB images are the largest that fit.
 */
export const MAX_REQUEST_BODY = 1_000_000;
export const FILE_GRAPH_IMAGE_LIMIT = 760_000;

/** The storage folder the patch is written to, outside the graph. */
const PLUGIN_ID = 'logseq-copilot';
const PATCH_FILE = 'image.patch';

/** What the store needs of the file graph client. */
export interface FileGraphAssetClient {
  writePluginStorageFile(pluginId: string, file: string, content: string): Promise<string>;
  execGitCommand(args: string[]): Promise<string>;
}

/** Times a git command is run before its failure counts. */
const GIT_ATTEMPTS = 3;
/** The wait before the second try; it grows with each one. */
const GIT_RETRY_MS = 250;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** A new file name in the assets folder, the way Logseq names pasted files. */
const assetFileName = (image: ImageFile) =>
  `${image.name}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${image.ext}`;

/**
 * Stores images in the `assets` folder of a file graph (see
 * git-binary-patch.ts); a clip shows one as `![alt](../assets/<file>)`, as
 * Logseq does for a pasted image. Writes go one at a time: they share the
 * patch file.
 */
export const createFileImageStore = (
  client: FileGraphAssetClient,
  { retryMs = GIT_RETRY_MS }: { retryMs?: number } = {},
): ImageAssetStore => {
  let queue: Promise<unknown> = Promise.resolve();

  /**
   * Logseq starts `git init` with every exec_git_command and does not wait
   * for it (electron/git.cljs `raw!`, 0.10.15). In a graph that is not a git
   * repository yet, the first command can run while that init writes the
   * graph's `.git` file, and fails ("fatal: not a git repository"). So a
   * failed command is run again after a moment. `git apply` writes nothing
   * when it fails, so running it again is safe.
   */
  const git = async (args: string[]): Promise<string> => {
    for (let attempt = 1; ; attempt++) {
      try {
        return await client.execGitCommand(args);
      } catch (error) {
        if (attempt >= GIT_ATTEMPTS) throw error;
        await wait(retryMs * attempt);
      }
    }
  };

  const save = async (image: ImageFile): Promise<AssetRef> => {
    // The name goes into the patch and the git command: [A-Za-z0-9_-] only.
    assertStorableImage(image);
    const file = assetFileName(image);
    const { id, patch } = await gitBinaryPatch(`assets/${file}`, image.bytes);
    const body = JSON.stringify({
      method: 'write_plugin_storage_file',
      args: [PLUGIN_ID, PATCH_FILE, patch, false],
    });
    if (body.length > MAX_REQUEST_BODY) throw new Error('The image is too large.');

    const patchPath = await client.writePluginStorageFile(PLUGIN_ID, PATCH_FILE, patch);
    try {
      await git(['apply', patchPath]);
    } finally {
      // Do not leave a copy of the image behind in Logseq's folder.
      await client.writePluginStorageFile(PLUGIN_ID, PATCH_FILE, '').catch(() => {});
    }
    const written = (await git(['hash-object', `assets/${file}`])).trim();
    if (written !== id) throw new Error('Logseq did not write the image.');
    return { kind: 'path', path: `../assets/${file}` };
  };

  return {
    imageAssetLimit: FILE_GRAPH_IMAGE_LIMIT,
    saveImageAsset: (image) => {
      const result = queue.then(() => save(image));
      queue = result.catch(() => {});
      return result;
    },
  };
};
