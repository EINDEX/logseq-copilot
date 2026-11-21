import { assertStorableImage, type AssetRef, type ImageAssetStore, type ImageFile } from '../image-assets';

/*
 * Images in the assets of a DB graph, made the way Logseq makes a pasted one
 * (frontend.handler.editor.assets): the file is `assets/<uuid>.<ext>`, and an
 * Asset node with that uuid, under the Asset tag, has its type, size and
 * SHA-256 checksum. Another block shows it as `[[uuid]]`. Probed on Logseq
 * 2.0.2: `write_assetsdir_file` (internal) writes bytes given as
 * `{ type: 'Buffer', data: [...] }`.
 *
 * The node is made with `insertBlock` and `addBlockTag`, which validate only
 * what they change. Not with `import_edn`: it validates the whole graph
 * after the import and refuses it for any invalid entity already there (a
 * graph imported from a file graph can have hundreds).
 *
 * The node first, the file after: the API can remove a block, not a file.
 * When a step fails, the node made here (its uuid is new, Logseq refuses one
 * that exists) is removed, and no file is left without its node.
 */

/**
 * The API server takes a request body of 1 MiB at most (413 above it). The
 * bytes go as a JSON array of numbers, up to 3.6 characters per byte.
 */
export const MAX_REQUEST_BODY = 1_000_000;
export const DB_GRAPH_IMAGE_LIMIT = 270_000;

/** What the store needs of the DB graph client. */
export interface DbGraphAssetClient {
  writeAssetsdirFile(file: string, bytes: Uint8Array): Promise<string>;
  /** A block `uuid` as the last child of `parentUuid`, with these properties (full idents). */
  insertBlockWithProperties(
    parentUuid: string,
    content: string,
    uuid: string,
    properties: Record<string, string | number>,
  ): Promise<unknown>;
  addBlockTag(uuid: string, tagUuid: string): Promise<unknown>;
  removeBlock(uuid: string): Promise<unknown>;
  /** A query that finds one uuid, or nothing. */
  queryUuid(query: string): Promise<string | undefined>;
  getBlockViaUuid(uuid: string): Promise<any>;
}

const ASSET_CLASS_QUERY =
  '[:find ?u . :where [?e :db/ident :logseq.class/Asset] [?e :block/uuid ?u]]';

const checksumQuery = (checksum: string) =>
  `[:find ?u . :where [?e :logseq.property.asset/checksum "${checksum}"] [?e :block/uuid ?u]]`;

const sha256 = async (bytes: Uint8Array) =>
  [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as BufferSource))]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

/**
 * The title of the Asset node: the alt text, without what a DB graph reads
 * as a reference, a tag, a heading, math or code, else the file name.
 */
export const assetTitle = (title: string, image: ImageFile) =>
  title
    .replace(/[[\]#(){}$`]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100) || image.name;

/** Stores images as Asset nodes of a DB graph. */
export const createDbImageStore = (client: DbGraphAssetClient): ImageAssetStore => ({
  imageAssetLimit: DB_GRAPH_IMAGE_LIMIT,
  saveImageAsset: async (image: ImageFile, title: string): Promise<AssetRef> => {
    assertStorableImage(image);
    const checksum = await sha256(image.bytes);
    // Logseq keeps one Asset per file: a second paste of it is refused.
    const existing = await client.queryUuid(checksumQuery(checksum));
    if (existing) return { kind: 'ref', uuid: existing };

    const uuid = crypto.randomUUID();
    const file = `${uuid}.${image.ext}`;
    const body = JSON.stringify({
      method: 'logseq.App.write_assetsdir_file',
      args: [file, { type: 'Buffer', data: Array.from(image.bytes) }, ''],
    });
    if (body.length > MAX_REQUEST_BODY) throw new Error('The image is too large.');

    const classUuid = await client.queryUuid(ASSET_CLASS_QUERY);
    if (!classUuid) throw new Error('The graph has no Asset tag.');
    try {
      // The properties before the tag: Logseq tags a block with Asset only
      // when it has an asset type.
      await client.insertBlockWithProperties(classUuid, assetTitle(title, image), uuid, {
        'logseq.property.asset/type': image.ext,
        'logseq.property.asset/size': image.bytes.length,
        'logseq.property.asset/checksum': checksum,
      });
      await client.addBlockTag(uuid, classUuid);
      const node = await client.getBlockViaUuid(uuid);
      if (!node?.uuid || node.uuid !== uuid) throw new Error('Logseq did not make the Asset.');
      await client.writeAssetsdirFile(file, image.bytes);
    } catch (error) {
      // insertBlock can fail after it made the block: remove it all the same.
      await client.removeBlock(uuid).catch(() => {});
      throw error;
    }
    return { kind: 'ref', uuid };
  },
});
